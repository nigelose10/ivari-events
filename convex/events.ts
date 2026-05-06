/**
 * Events — host-facing CRUD plus the public `getBySlug` lookup the guest
 * portal uses to render the event page.
 *
 * Auth model:
 * - Host endpoints (list, get, create, update, remove, duplicate, etc.) require
 *   Stack Auth via `ctx.auth.getUserIdentity()` and check `event.hostId === user._id`.
 * - `getBySlug` is public and returns only fields safe for guest portals
 *   (no `hostId`, no `guestTokenSalt`).
 *
 * Cover image: hosts upload directly to Convex storage via the upload-URL
 * pattern (see `events.generateCoverUploadUrl`). The resulting `_storage` ID
 * is persisted as `imageStorageId`; queries resolve it to a fresh URL on
 * read and return it as `imageUrl` so consumers don't need to change shape.
 */
import { v } from "convex/values";
import { mutation, query, internalQuery } from "./_generated/server";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

/** Valid status transitions — same matrix as the legacy router. */
const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ["active", "cancelled"],
  active: ["past", "cancelled"],
  past: ["active"],
  cancelled: ["draft", "active"],
};

const STATUS_VALIDATOR = v.union(
  v.literal("draft"),
  v.literal("active"),
  v.literal("past"),
  v.literal("cancelled"),
);

/** Resolve the Stack Auth user record from `ctx.auth.getUserIdentity()`.
 *  Throws if unauthenticated or if the user has no row in `users` (the auth
 *  bootstrap mutation handles upsert; if it didn't run, we want to fail loud). */
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
  if (!user) throw new Error("User record missing — auth bootstrap not run");
  return user;
}

/** Lookup an event and assert the caller owns it. Throws on miss/unauth. */
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

/** Generate a slug and re-roll until it doesn't collide. */
async function generateUniqueSlug(ctx: MutationCtx): Promise<string> {
  for (let attempts = 0; attempts < 8; attempts++) {
    const candidate = Math.random().toString(36).slice(2, 14);
    const collision = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", candidate))
      .first();
    if (!collision) return candidate;
  }
  throw new Error("Failed to generate unique slug after 8 attempts");
}

function randomSalt(): string {
  // 32 chars; not cryptographic — just disambiguates token issuance.
  return (
    Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
  ).slice(0, 32);
}

async function countRsvpsForEvent(
  ctx: QueryCtx | MutationCtx,
  eventId: Id<"events">,
) {
  const all = await ctx.db
    .query("rsvps")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .collect();
  return {
    attending: all.filter((r) => r.status === "attending").length,
    declined: all.filter((r) => r.status === "declined").length,
    maybe: all.filter((r) => r.status === "maybe").length,
    total: all.length,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Queries
// ───────────────────────────────────────────────────────────────────────────

/** Resolve the cover image URL for an event row. Prefers the new
 *  `imageStorageId` (host-uploaded), falls back to the legacy `imageUrl`
 *  string for events created before the upload migration. Returns the
 *  event with `imageUrl` set to whichever resolved (so callers don't have
 *  to branch on which storage path the row came from). */
async function withResolvedImage<T extends Doc<"events">>(
  ctx: QueryCtx | MutationCtx,
  evt: T,
): Promise<T & { imageUrl: string | undefined }> {
  if (evt.imageStorageId) {
    const url = await ctx.storage.getUrl(evt.imageStorageId);
    return { ...evt, imageUrl: url ?? evt.imageUrl };
  }
  return { ...evt, imageUrl: evt.imageUrl };
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const events = await ctx.db
      .query("events")
      .withIndex("by_hostId", (q) => q.eq("hostId", user._id))
      .order("desc")
      .collect();

    return Promise.all(
      events.map(async (evt) => {
        const guests = await ctx.db
          .query("guests")
          .withIndex("by_eventId", (q) => q.eq("eventId", evt._id))
          .collect();
        const rsvpCounts = await countRsvpsForEvent(ctx, evt._id);
        const resolved = await withResolvedImage(ctx, evt);
        return { ...resolved, guestCount: guests.length, rsvpCounts };
      }),
    );
  },
});

export const get = query({
  args: { id: v.id("events") },
  handler: async (ctx, { id }) => {
    const user = await requireUser(ctx);
    const event = await requireOwnedEvent(ctx, id, user._id);
    return withResolvedImage(ctx, event);
  },
});

/**
 * Host-only event lookup that accepts EITHER a Convex `Id<"events">` OR an
 * event slug. Pulse and other host surfaces use this so URLs can be either
 * `/pulse/<convex-id>` (post-duplicate) or `/pulse/<slug>` (post-create from
 * Forge, which prefers the slug for shareability).
 *
 * Returns null on miss/unauth instead of throwing — easier on the React tree
 * (no boundary needed, just a "Not found" state).
 */
export const getByIdOrSlug = query({
  args: { idOrSlug: v.string() },
  handler: async (ctx, { idOrSlug }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
    if (!user) return null;

    // Try as Convex Id first. normalizeId returns null if the string isn't
    // a valid id for the events table, which lets us fall back to a slug
    // lookup without throwing.
    let event = null;
    const asId = ctx.db.normalizeId("events", idOrSlug);
    if (asId !== null) {
      event = await ctx.db.get(asId);
    }
    if (!event) {
      event = await ctx.db
        .query("events")
        .withIndex("by_slug", (q) => q.eq("slug", idOrSlug))
        .first();
    }
    if (!event) return null;
    if (event.hostId !== user._id) return null; // not the owner — treat as not found
    return withResolvedImage(ctx, event);
  },
});

/**
 * Resolves whether the currently-authed user is the host of the given event.
 * Returns `false` (not throw) for unauthenticated callers — this is consumed
 * by guest-facing surfaces (like MemoryWall) that need to conditionally show
 * a "Moderate" button without breaking guests who hit the same page.
 */
export const isHostBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { isHost: false, eventId: null };

    const event = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!event) return { isHost: false, eventId: null };

    const user = await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
    if (!user) return { isHost: false, eventId: event._id };

    return {
      isHost: event.hostId === user._id,
      eventId: event._id,
    };
  },
});

/** Public — used by the guest portal page. Returns only guest-safe fields. */
export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const event = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!event) throw new Error("Event not found");
    const imageUrl = event.imageStorageId
      ? ((await ctx.storage.getUrl(event.imageStorageId)) ?? event.imageUrl)
      : event.imageUrl;
    return {
      _id: event._id,
      slug: event.slug,
      title: event.title,
      description: event.description,
      imageUrl,
      eventDate: event.eventDate,
      locationName: event.locationName,
      locationLat: event.locationLat,
      locationLng: event.locationLng,
      status: event.status,
      memoryWallEnabled: event.memoryWallEnabled,
      maxGuests: event.maxGuests,
      maxCapacity: event.maxCapacity,
      rsvpDeadline: event.rsvpDeadline,
      surveyConfig: event.surveyConfig,
      themeColor: event.themeColor,
      themeColorSecondary: event.themeColorSecondary,
      language: event.language,
    };
  },
});

// ───────────────────────────────────────────────────────────────────────────
// Mutations
// ───────────────────────────────────────────────────────────────────────────

export const create = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    eventDate: v.optional(v.number()),
    locationName: v.optional(v.string()),
    locationLat: v.optional(v.string()),
    locationLng: v.optional(v.string()),
    locationPlaceId: v.optional(v.string()),
    /** Host-uploaded cover image (preferred). */
    imageStorageId: v.optional(v.id("_storage")),
    /** @deprecated Legacy URL field. Kept for back-compat with old clients. */
    imageUrl: v.optional(v.string()),
    /** @deprecated Schema-only; the AI-prompt flow has been removed. */
    imagePrompt: v.optional(v.string()),
    maxGuests: v.optional(v.number()),
    maxCapacity: v.optional(v.number()),
    rsvpDeadline: v.optional(v.number()),
    status: v.optional(STATUS_VALIDATOR),
    surveyConfig: v.optional(v.any()),
    templateId: v.optional(v.string()),
    themeColor: v.optional(v.string()),
    themeColorSecondary: v.optional(v.string()),
    language: v.optional(v.string()),
  },
  handler: async (ctx, input) => {
    const user = await requireUser(ctx);
    if (input.title.length < 1 || input.title.length > 500) {
      throw new Error("Title must be between 1 and 500 characters");
    }
    if (input.maxCapacity !== undefined && input.maxCapacity < 0) {
      throw new Error("maxCapacity must be >= 0");
    }

    const slug = await generateUniqueSlug(ctx);
    const guestTokenSalt = randomSalt();

    const eventId = await ctx.db.insert("events", {
      slug,
      hostId: user._id,
      title: input.title,
      description: input.description,
      eventDate: input.eventDate,
      locationName: input.locationName,
      locationLat: input.locationLat,
      locationLng: input.locationLng,
      locationPlaceId: input.locationPlaceId,
      imageStorageId: input.imageStorageId,
      imageUrl: input.imageUrl,
      imagePrompt: input.imagePrompt,
      maxGuests: input.maxGuests,
      maxCapacity: input.maxCapacity,
      rsvpDeadline: input.rsvpDeadline,
      surveyConfig: input.surveyConfig,
      templateId: input.templateId,
      themeColor: input.themeColor,
      themeColorSecondary: input.themeColorSecondary,
      language: input.language,
      guestTokenSalt,
      status: input.status || "active",
      memoryWallEnabled: "1",
      smsBroadcastEnabled: "0",
      updatedAt: Date.now(),
    });

    // Schedule auto-geocoding of the free-text location → lat/lng so the
    // WeatherWidget (which keys off `latitude`/`longitude`) becomes reachable.
    // Runs after the mutation commits; failure is silent and non-blocking.
    if (input.locationName) {
      await ctx.scheduler.runAfter(0, api.geocoding.geocodeAndAttach, {
        eventId,
        locationName: input.locationName,
      });
    }

    // The legacy router signed a guest token here and returned it. Convex
    // mutations cannot sign JWTs (no Node crypto), so the client should call
    // `guestTokens.signGuestToken` after this with `{ eventId, slug, access:"full" }`.
    return { _id: eventId, slug };
  },
});

export const update = mutation({
  args: {
    id: v.id("events"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    eventDate: v.optional(v.number()),
    locationName: v.optional(v.string()),
    locationLat: v.optional(v.string()),
    locationLng: v.optional(v.string()),
    locationPlaceId: v.optional(v.string()),
    /** Host-uploaded cover image (preferred). */
    imageStorageId: v.optional(v.id("_storage")),
    /** @deprecated Legacy URL field. Kept for back-compat with old clients. */
    imageUrl: v.optional(v.string()),
    /** @deprecated Schema-only; AI-prompt flow has been removed. */
    imagePrompt: v.optional(v.string()),
    maxGuests: v.optional(v.number()),
    maxCapacity: v.optional(v.number()),
    rsvpDeadline: v.optional(v.union(v.number(), v.null())),
    status: v.optional(STATUS_VALIDATOR),
    memoryWallEnabled: v.optional(v.union(v.literal("0"), v.literal("1"))),
    smsBroadcastEnabled: v.optional(v.union(v.literal("0"), v.literal("1"))),
    surveyConfig: v.optional(v.any()),
    themeColor: v.optional(v.union(v.string(), v.null())),
    themeColorSecondary: v.optional(v.union(v.string(), v.null())),
    language: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, { id, ...rest }) => {
    const user = await requireUser(ctx);
    const event = await requireOwnedEvent(ctx, id, user._id);

    if (
      rest.title !== undefined &&
      (rest.title.length < 1 || rest.title.length > 500)
    ) {
      throw new Error("Title must be between 1 and 500 characters");
    }
    if (rest.maxCapacity !== undefined && rest.maxCapacity < 0) {
      throw new Error("maxCapacity must be >= 0");
    }

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [k, val] of Object.entries(rest)) {
      if (val !== undefined) patch[k] = val;
    }
    await ctx.db.patch(id, patch);

    // Re-geocode only when the human-readable locationName actually changed
    // since the last geocode pass — avoids hammering Open-Meteo on every save.
    if (rest.locationName && rest.locationName !== event.geocodedFrom) {
      await ctx.scheduler.runAfter(0, api.geocoding.geocodeAndAttach, {
        eventId: id,
        locationName: rest.locationName,
      });
    }

    return { success: true };
  },
});

/**
 * Status transition. The legacy `changeStatus` route also fired auto-invite
 * notifications when transitioning draft→active, and a cancellation broadcast
 * on →cancelled. Those side effects can't run from a mutation (need Node HTTP),
 * so they're split out: the client follows up with `notifications.sendBlast`
 * (or a dedicated cancellation action) after this mutation succeeds.
 */
export const transitionStatus = mutation({
  args: {
    id: v.id("events"),
    newStatus: STATUS_VALIDATOR,
  },
  handler: async (ctx, { id, newStatus }) => {
    const user = await requireUser(ctx);
    const event = await requireOwnedEvent(ctx, id, user._id);

    const allowed = VALID_TRANSITIONS[event.status] || [];
    if (!allowed.includes(newStatus)) {
      throw new Error(
        `Cannot transition from "${event.status}" to "${newStatus}". Allowed: ${allowed.join(", ")}`,
      );
    }

    await ctx.db.patch(id, { status: newStatus, updatedAt: Date.now() });
    return {
      success: true,
      previousStatus: event.status,
      newStatus,
    };
  },
});

export const duplicate = mutation({
  args: {
    id: v.id("events"),
    includeGuests: v.optional(v.boolean()),
  },
  handler: async (ctx, { id, includeGuests }) => {
    const user = await requireUser(ctx);
    const source = await requireOwnedEvent(ctx, id, user._id);

    const newSlug = await generateUniqueSlug(ctx);
    const guestTokenSalt = randomSalt();

    const newEventId = await ctx.db.insert("events", {
      slug: newSlug,
      hostId: user._id,
      title: `${source.title} (Copy)`,
      description: source.description,
      imagePrompt: source.imagePrompt,
      imageUrl: source.imageUrl,
      imageStorageId: source.imageStorageId,
      eventDate: undefined,
      locationName: source.locationName,
      locationLat: source.locationLat,
      locationLng: source.locationLng,
      locationPlaceId: source.locationPlaceId,
      surveyConfig: source.surveyConfig,
      status: "draft",
      guestTokenSalt,
      maxGuests: source.maxGuests,
      maxCapacity: source.maxCapacity,
      rsvpDeadline: undefined,
      memoryWallEnabled: source.memoryWallEnabled,
      smsBroadcastEnabled: source.smsBroadcastEnabled,
      templateId: source.templateId,
      themeColor: source.themeColor,
      themeColorSecondary: source.themeColorSecondary,
      language: source.language,
      updatedAt: Date.now(),
    });

    if (includeGuests) {
      const originalGuests = await ctx.db
        .query("guests")
        .withIndex("by_eventId", (q) => q.eq("eventId", id))
        .collect();

      // NOTE: legacy router signed a fresh portalToken JWT for each duplicated
      // guest. JWT signing can't run inside a mutation. Insert with
      // portalToken: undefined; client must follow up with
      // `guestTokens.signGuestToken` per guest and patch via `guests.update`.
      for (const g of originalGuests) {
        await ctx.db.insert("guests", {
          eventId: newEventId,
          name: g.name,
          email: g.email,
          phone: g.phone,
          portalToken: undefined,
          notificationStatus: "pending",
          checkedIn: "0",
          updatedAt: Date.now(),
        });
      }
    }

    return { _id: newEventId, slug: newSlug };
  },
});

/**
 * Hard delete an event and every dependent row. Convex doesn't cascade.
 */
export const remove = mutation({
  args: { id: v.id("events") },
  handler: async (ctx, { id }) => {
    const user = await requireUser(ctx);
    await requireOwnedEvent(ctx, id, user._id);

    const tables = [
      "rsvps",
      "photos",
      "guests",
      "notifications",
      "portalViews",
    ] as const;

    for (const table of tables) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_eventId", (q) => q.eq("eventId", id))
        .collect();
      for (const row of rows) {
        await ctx.db.delete(row._id);
      }
    }

    await ctx.db.delete(id);
    return { success: true };
  },
});

/**
 * Mint a one-shot upload URL for a host's cover image. Mirrors the photo
 * upload pattern in `photos.ts`:
 *   1. Client calls this mutation, gets a signed upload URL.
 *   2. Client POSTs the file directly to that URL — bypasses the function
 *      arg-size limit and works for any image up to Convex storage caps.
 *   3. Client calls `events.create` (or `events.update`) with the resulting
 *      `imageStorageId` to attach the upload to the event row.
 *
 * Auth: any signed-in user can mint an upload URL. Ownership is enforced
 * when the storage ID is later attached to a specific event row.
 */
export const generateCoverUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return ctx.storage.generateUploadUrl();
  },
});

// ───────────────────────────────────────────────────────────────────────────
// Internal queries (called from actions, e.g. guestTokens.mintGuestLink)
// ───────────────────────────────────────────────────────────────────────────

/** Internal: fetch an event row for ownership checks performed inside actions.
 *  No auth here — callers are responsible for verifying the caller owns it. */
export const getEventForOwnerCheck = internalQuery({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => ctx.db.get(eventId),
});

/** Internal: resolve a `users` row from a Stack Auth tokenIdentifier.
 *  Used by actions that need to compare `event.hostId` to the caller. */
export const getUserByTokenIdentifier = internalQuery({
  args: { tokenIdentifier: v.string() },
  handler: async (ctx, { tokenIdentifier }) =>
    ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) =>
        q.eq("tokenIdentifier", tokenIdentifier),
      )
      .unique(),
});
