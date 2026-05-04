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
import { requireHostOrCohost, requireUser } from "./lib/permissions";

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

// Resolve a photo doc's storage URL (best-effort; legacy S3 photos already
// have `imageUrl` populated and no Convex storageId).
async function withResolvedUrl(
  ctx: QueryCtx,
  photo: Doc<"photos">,
): Promise<Doc<"photos"> & { imageUrl: string }> {
  if (photo.fileKey && !photo.imageUrl) {
    const url = await ctx.storage.getUrl(photo.fileKey as Id<"_storage">);
    return { ...photo, imageUrl: url ?? "" };
  }
  return photo as Doc<"photos"> & { imageUrl: string };
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

    // Public list excludes pending/rejected. Legacy rows (status undefined)
    // are grandfathered in as approved.
    const visible = photos.filter(
      (p) => p.status === undefined || p.status === "approved",
    );

    return Promise.all(visible.map((p) => withResolvedUrl(ctx, p)));
  },
});

// ───────────────────────────────────────────────────────────────────────────
// Moderation queries (V1 — moderated gallery)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Public, moderated feed. Returns approved photos for a given event,
 * resolved storage URLs included.
 *
 * The `featured` rows surface first (then by recency); the client renders
 * featured photos in a larger frame.
 */
export const listApproved = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    // Pull approved + legacy (status undefined) in one go. Legacy rows can't
    // be hit through the compound index (status field missing), so we fetch
    // by event and filter — fine for typical event sizes.
    const all = await ctx.db
      .query("photos")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .order("desc")
      .collect();

    const visible = all.filter(
      (p) => p.status === undefined || p.status === "approved",
    );

    // Featured first, then chronological (already desc from the query).
    visible.sort((a, b) => {
      const af = a.featured ? 1 : 0;
      const bf = b.featured ? 1 : 0;
      if (af !== bf) return bf - af;
      return b._creationTime - a._creationTime;
    });

    return Promise.all(visible.map((p) => withResolvedUrl(ctx, p)));
  },
});

/**
 * Host-only moderation queue. Lists pending photos in chronological order
 * (oldest first — first-in-first-reviewed feels right for a queue).
 */
export const listPending = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    await requireHostOrCohost(ctx, eventId);

    const pending = await ctx.db
      .query("photos")
      .withIndex("by_event_status", (q) =>
        q.eq("eventId", eventId).eq("status", "pending"),
      )
      .order("asc")
      .collect();

    return Promise.all(pending.map((p) => withResolvedUrl(ctx, p)));
  },
});

/**
 * Host-only "everything" view for the moderation overview. Includes legacy
 * rows so hosts can retroactively feature them.
 */
export const listAll = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    await requireHostOrCohost(ctx, eventId);

    const all = await ctx.db
      .query("photos")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .order("desc")
      .collect();

    return Promise.all(all.map((p) => withResolvedUrl(ctx, p)));
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
    // Internal callers (`submitGuestPhoto`, `submitHostPhoto`) pass the
    // moderation status they want. Defaults to "pending" — guest is the
    // safer default, hosts override to "approved".
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("approved"),
        v.literal("rejected"),
      ),
    ),
    moderatedBy: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const { eventId, storageId, uploaderName, caption, status, moderatedBy } =
      args;
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

    const finalStatus = status ?? "pending";
    const photoId = await ctx.db.insert("photos", {
      eventId,
      uploaderName: uploaderName || "Anonymous",
      imageUrl: url,
      fileKey: storageId,
      caption,
      status: finalStatus,
      moderatedBy: finalStatus === "approved" ? moderatedBy : undefined,
      moderatedAt: finalStatus === "approved" ? Date.now() : undefined,
      featured: false,
    });

    return { _id: photoId, imageUrl: url, status: finalStatus };
  },
});

/**
 * Public action: verify guest token, then save photo record. Composes
 * `verifyGuestTokenInternal` + `savePhotoInternal`.
 *
 * NOTE: this is the legacy entry point retained for backwards-compat with
 * the pre-moderation client. It defaults the new row to `status: "pending"`
 * via savePhotoInternal, so guests on old clients still get the moderated
 * behavior — they just won't see the "submitted for review" copy.
 *
 * New code should use `submitGuestPhoto` (action) instead.
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
      status: "pending",
    });
  },
});

// ───────────────────────────────────────────────────────────────────────────
// Moderation upload entry points (V1 — gallery moderation)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Guest-side submission. The client has already uploaded the file to a
 * Convex storage URL (via `requestUploadUrl`) and now passes the
 * `storageId` plus their guest JWT.
 *
 * Side-effect: inserts a `photos` row with `status: "pending"`. The photo
 * is invisible to the public list until a host approves it.
 */
export const submitGuestPhoto = action({
  args: {
    guestToken: v.string(),
    storageId: v.id("_storage"),
    uploaderName: v.optional(v.string()),
    caption: v.optional(v.string()),
  },
  handler: async (ctx, { guestToken, storageId, uploaderName, caption }) => {
    const payload = await ctx.runAction(
      internal.guestTokens.verifyGuestTokenInternal,
      { token: guestToken },
    );
    const result = await ctx.runMutation(internal.photos.savePhotoInternal, {
      eventId: payload.eventId as Id<"events">,
      storageId,
      uploaderName,
      caption,
      status: "pending",
    });
    return {
      success: true,
      photoId: result._id,
      message: "Photo submitted for review",
    };
  },
});

/**
 * Host-side submission. Bypasses moderation — the photo lands as
 * `approved` immediately. Auth: must be the event host (or a co-host
 * once V7 W5 lands).
 */
export const submitHostPhoto = mutation({
  args: {
    eventId: v.id("events"),
    storageId: v.id("_storage"),
    uploaderName: v.optional(v.string()),
    caption: v.optional(v.string()),
    featured: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    { eventId, storageId, uploaderName, caption, featured },
  ) => {
    const { user, event } = await requireHostOrCohost(ctx, eventId);
    if (event.memoryWallEnabled !== "1") {
      throw new Error("Photo uploads not enabled");
    }

    if (uploaderName && uploaderName.length > 300) {
      throw new Error("Uploader name too long");
    }
    if (caption && caption.length > 1000) {
      throw new Error("Caption too long");
    }

    const url = await ctx.storage.getUrl(storageId);
    if (!url) throw new Error("Failed to resolve storage URL");

    const photoId = await ctx.db.insert("photos", {
      eventId,
      uploaderName: uploaderName || user.name || "Host",
      imageUrl: url,
      fileKey: storageId,
      caption,
      status: "approved",
      moderatedBy: user._id,
      moderatedAt: Date.now(),
      featured: featured ?? false,
    });

    return { success: true, photoId, status: "approved" as const };
  },
});

// ───────────────────────────────────────────────────────────────────────────
// Moderation actions (host-only; IDOR-checked)
// ───────────────────────────────────────────────────────────────────────────

export const approvePhoto = mutation({
  args: { photoId: v.id("photos"), eventId: v.id("events") },
  handler: async (ctx, { photoId, eventId }) => {
    const { user } = await requireHostOrCohost(ctx, eventId);
    const photo = await ctx.db.get(photoId);
    if (!photo || photo.eventId !== eventId) {
      throw new Error("Photo not found in this event");
    }
    await ctx.db.patch(photoId, {
      status: "approved",
      moderatedBy: user._id,
      moderatedAt: Date.now(),
    });
    return { success: true };
  },
});

export const rejectPhoto = mutation({
  args: {
    photoId: v.id("photos"),
    eventId: v.id("events"),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { photoId, eventId, note }) => {
    const { user } = await requireHostOrCohost(ctx, eventId);
    const photo = await ctx.db.get(photoId);
    if (!photo || photo.eventId !== eventId) {
      throw new Error("Photo not found in this event");
    }
    if (note && note.length > 500) throw new Error("Reason too long");
    await ctx.db.patch(photoId, {
      status: "rejected",
      moderatedBy: user._id,
      moderatedAt: Date.now(),
      moderationNote: note,
    });
    return { success: true };
  },
});

export const featurePhoto = mutation({
  args: { photoId: v.id("photos"), eventId: v.id("events") },
  handler: async (ctx, { photoId, eventId }) => {
    await requireHostOrCohost(ctx, eventId);
    const photo = await ctx.db.get(photoId);
    if (!photo || photo.eventId !== eventId) {
      throw new Error("Photo not found in this event");
    }
    await ctx.db.patch(photoId, { featured: true });
    return { success: true };
  },
});

export const unfeaturePhoto = mutation({
  args: { photoId: v.id("photos"), eventId: v.id("events") },
  handler: async (ctx, { photoId, eventId }) => {
    await requireHostOrCohost(ctx, eventId);
    const photo = await ctx.db.get(photoId);
    if (!photo || photo.eventId !== eventId) {
      throw new Error("Photo not found in this event");
    }
    await ctx.db.patch(photoId, { featured: false });
    return { success: true };
  },
});

// ───────────────────────────────────────────────────────────────────────────
// Host-only deletion (with IDOR check — V6 audit fix preserved)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Removes a photo for good (db row + Convex storage object). This supersedes
 * the older `remove` mutation; we keep `remove` exported below as a thin
 * alias so existing call-sites keep working until the next sweep.
 */
export const removePhoto = mutation({
  args: {
    photoId: v.id("photos"),
    eventId: v.id("events"),
  },
  handler: async (ctx, { photoId, eventId }) => {
    await requireHostOrCohost(ctx, eventId);

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

/**
 * @deprecated use `removePhoto`. Kept for backwards-compat with V6 callers.
 */
export const remove = mutation({
  args: {
    photoId: v.id("photos"),
    eventId: v.id("events"),
  },
  handler: async (ctx, { photoId, eventId }) => {
    const user = await requireUser(ctx);
    await requireOwnedEvent(ctx, eventId, user._id);

    const photo = await ctx.db.get(photoId);
    if (!photo || photo.eventId !== eventId) {
      throw new Error("Photo not found in this event");
    }

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
