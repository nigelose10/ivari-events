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
 * Image regen: `regenerateImage` schedules an action defined in `images.ts`
 * that does the HTTP call and writes the URL back via `events.setImage`.
 */
import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
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
        return { ...evt, guestCount: guests.length, rsvpCounts };
      }),
    );
  },
});

export const get = query({
  args: { id: v.id("events") },
  handler: async (ctx, { id }) => {
    const user = await requireUser(ctx);
    return requireOwnedEvent(ctx, id, user._id);
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
    return {
      _id: event._id,
      slug: event.slug,
      title: event.title,
      description: event.description,
      imageUrl: event.imageUrl,
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
    imageUrl: v.optional(v.string()),
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
    imageUrl: v.optional(v.string()),
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
    await requireOwnedEvent(ctx, id, user._id);

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
 * Internal mutation: write a fresh imageUrl after an image-gen action resolves.
 * Called from `images.runRegenerateImage`.
 */
export const setImage = internalMutation({
  args: {
    id: v.id("events"),
    imageUrl: v.string(),
    imagePrompt: v.optional(v.string()),
  },
  handler: async (ctx, { id, imageUrl, imagePrompt }) => {
    await ctx.db.patch(id, {
      imageUrl,
      ...(imagePrompt !== undefined ? { imagePrompt } : {}),
      updatedAt: Date.now(),
    });
  },
});

/**
 * Schedule an image regen for an event. Verifies ownership, then schedules
 * the actual image-gen action. Returns immediately; client subscribes to the
 * reactive `imageUrl` field via `events.get`.
 */
export const regenerateImage = mutation({
  args: {
    id: v.id("events"),
    subject: v.string(),
  },
  handler: async (ctx, { id, subject }) => {
    const user = await requireUser(ctx);
    await requireOwnedEvent(ctx, id, user._id);
    if (subject.length < 1) throw new Error("Subject is required");

    await ctx.scheduler.runAfter(0, internal.images.runRegenerateImage, {
      id,
      subject,
    });
    return { scheduled: true };
  },
});
