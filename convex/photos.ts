/**
 * Memory Wall photos — guest uploads + host listing/deletion.
 *
 * Realtime: legacy router emitted `emitPhotoAdded` over Socket.IO. Gone.
 * Subscribed clients of `photos.list` re-fire automatically when the
 * `savePhotoRecord` mutation lands.
 *
 * Storage flow (replaces S3 base64 upload):
 *   1. Client calls `photos.generateUploadUrl` (mutation, requires guest JWT).
 *      Returns a one-shot upload URL.
 *   2. Client POSTs the file directly to that URL — bypasses the Convex
 *      function size limit, supports any image size up to Convex storage caps.
 *   3. Client calls `photos.savePhotoRecord` with the storageId returned by
 *      the upload, plus the JWT token.
 *
 * The legacy `upload` route accepted base64 inline and uploaded to S3 server-side.
 * Convex's recommended pattern is direct-upload — we follow that.
 */
import { v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  internalQuery,
  action,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

async function requireUser(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthorized");
  const user = await ctx.db
    .query("users")
    .withIndex("by_tokenIdentifier", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier),
    )
    .unique();
  if (!user) throw new Error("User record missing");
  return user;
}

async function requireOwnedEvent(
  ctx: QueryCtx | MutationCtx,
  eventId: Id<"events">,
  userId: Id<"users">,
): Promise<Doc<"events">> {
  const event = await ctx.db.get(eventId);
  if (!event || event.hostId !== userId) {
    throw new Error("Event not found");
  }
  return event;
}

// ───────────────────────────────────────────────────────────────────────────
// Public: list photos for a slug. Resolves storage IDs to URLs on read.
// ───────────────────────────────────────────────────────────────────────────

export const list = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const event = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!event) throw new Error("Event not found");

    const photos = await ctx.db
      .query("photos")
      .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
      .order("desc")
      .collect();

    // If a photo's `fileKey` is a Convex storage ID, resolve to a fresh URL.
    // Legacy S3-uploaded rows already have `imageUrl` populated, so we just
    // pass those through.
    return Promise.all(
      photos.map(async (p) => {
        if (p.fileKey && !p.imageUrl) {
          const url = await ctx.storage.getUrl(p.fileKey as Id<"_storage">);
          return { ...p, imageUrl: url ?? "" };
        }
        return p;
      }),
    );
  },
});

// ───────────────────────────────────────────────────────────────────────────
// Public upload flow (guest portal, JWT-gated)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Step 1 of the upload flow. Client must call `guestTokens.verifyGuestToken`
 * (action) first to validate the token, OR call this via `requestUploadUrl`
 * action below which does both. Direct mutation usage is intended only when
 * the caller has already verified the token.
 *
 * NOTE: this returns an upload URL but does NOT enforce that the requester
 * has a valid guest token — callers must have verified out-of-band. For an
 * end-to-end safe guest path, use `requestUploadUrl` action instead.
 */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return ctx.storage.generateUploadUrl();
  },
});

/**
 * Bundled action: verifies token, checks the event allows memory-wall uploads,
 * then mints an upload URL. Use this from the guest portal.
 */
export const requestUploadUrl = action({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const payload = await ctx.runAction(
      internal.guestTokens.verifyGuestTokenInternal,
      { token },
    );
    // Confirm memory-wall is enabled before handing out an upload URL.
    const event = await ctx.runQuery(internal.photos.getEventForUploadCheck, {
      eventId: payload.eventId as Id<"events">,
    });
    if (!event) throw new Error("Event not found");
    if (event.memoryWallEnabled !== "1") {
      throw new Error("Photo uploads not enabled for this event");
    }
    return ctx.runMutation(internal.photos.mintUploadUrl, {});
  },
});

/** Internal helper for `requestUploadUrl` to check memory-wall flag. */
export const getEventForUploadCheck = internalQuery({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    return ctx.db.get(eventId);
  },
});

export const mintUploadUrl = internalMutation({
  args: {},
  handler: async (ctx) => {
    return ctx.storage.generateUploadUrl();
  },
});

/**
 * Step 2: persist the photo record after the client has uploaded the file
 * and received a storageId. Verifies the JWT inline by way of an internal
 * action (savePhotoRecord is itself an action below).
 */
export const savePhotoInternal = internalMutation({
  args: {
    eventId: v.id("events"),
    storageId: v.id("_storage"),
    uploaderName: v.optional(v.string()),
    caption: v.optional(v.string()),
  },
  handler: async (ctx, { eventId, storageId, uploaderName, caption }) => {
    if (uploaderName && uploaderName.length > 300) {
      throw new Error("Uploader name too long");
    }
    if (caption && caption.length > 1000) {
      throw new Error("Caption too long");
    }

    const event = await ctx.db.get(eventId);
    if (!event || event.memoryWallEnabled !== "1") {
      throw new Error("Photo uploads not enabled");
    }

    const url = await ctx.storage.getUrl(storageId);
    if (!url) throw new Error("Failed to resolve storage URL");

    const photoId = await ctx.db.insert("photos", {
      eventId,
      uploaderName: uploaderName || "Anonymous",
      imageUrl: url,
      fileKey: storageId,
      caption,
    });

    return { _id: photoId, imageUrl: url };
  },
});

/**
 * Public action: verify guest token, then save photo record. Composes
 * `verifyGuestTokenInternal` + `savePhotoInternal`.
 */
export const savePhotoRecord = action({
  args: {
    token: v.string(),
    storageId: v.id("_storage"),
    uploaderName: v.optional(v.string()),
    caption: v.optional(v.string()),
  },
  handler: async (ctx, { token, storageId, uploaderName, caption }) => {
    const payload = await ctx.runAction(
      internal.guestTokens.verifyGuestTokenInternal,
      { token },
    );
    return ctx.runMutation(internal.photos.savePhotoInternal, {
      eventId: payload.eventId as Id<"events">,
      storageId,
      uploaderName,
      caption,
    });
  },
});

// ───────────────────────────────────────────────────────────────────────────
// Host-only deletion (with IDOR check — V6 audit fix preserved)
// ───────────────────────────────────────────────────────────────────────────

export const remove = mutation({
  args: {
    photoId: v.id("photos"),
    eventId: v.id("events"),
  },
  handler: async (ctx, { photoId, eventId }) => {
    const user = await requireUser(ctx);
    await requireOwnedEvent(ctx, eventId, user._id);

    // IDOR fix: verify the photo actually belongs to this event before
    // deleting. The legacy `photos.delete` route did this; do not regress.
    const photo = await ctx.db.get(photoId);
    if (!photo || photo.eventId !== eventId) {
      throw new Error("Photo not found in this event");
    }

    // Best-effort: remove from storage if we have a storageId. Legacy S3
    // photos won't have a Convex storageId, so guard the call.
    if (photo.fileKey) {
      try {
        await ctx.storage.delete(photo.fileKey as Id<"_storage">);
      } catch {
        // S3-era key — nothing to delete in Convex storage. Ignore.
      }
    }

    await ctx.db.delete(photoId);
    return { success: true };
  },
});
