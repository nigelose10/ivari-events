/**
 * Guests — host-side guest list management. CSV parsing happens client-side
 * (the legacy router parsed CSV in `parseCSV`); the client now hands us
 * structured rows via `bulkImport`. Frees us from worrying about CSV edge
 * cases on the server and keeps mutations fast.
 *
 * Portal tokens: the legacy router signed a JWT per guest at insert time and
 * stored it on the row. JWT signing can't run inside a Convex mutation, so
 * inserts here leave `portalToken: undefined`. The client (or a follow-up
 * action) signs the token via `guestTokens.signGuestToken` after the row
 * exists, then patches it via `guests.update`.
 *
 * IDOR fix preserved: every per-guest mutation re-loads the guest and asserts
 * `guest.eventId === input.eventId`. V6 audit caught the gap; do not regress.
 */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
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
// Queries
// ───────────────────────────────────────────────────────────────────────────

export const list = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const user = await requireUser(ctx);
    await requireOwnedEvent(ctx, eventId, user._id);
    return ctx.db
      .query("guests")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .order("desc")
      .collect();
  },
});

export const getCheckInStats = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const user = await requireUser(ctx);
    const event = await requireOwnedEvent(ctx, eventId, user._id);

    const guests = await ctx.db
      .query("guests")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .collect();
    const rsvps = await ctx.db
      .query("rsvps")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .order("desc")
      .collect();

    const checkedIn = guests.filter((g) => g.checkedIn === "1").length;
    const stats = {
      total: guests.length,
      checkedIn,
      pending: guests.length - checkedIn,
    };

    return { stats, guests, rsvps, event };
  },
});

// ───────────────────────────────────────────────────────────────────────────
// Mutations
// ───────────────────────────────────────────────────────────────────────────

const GUEST_ROW = v.object({
  name: v.string(),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
});

/**
 * Bulk insert from a list the client has already parsed (from CSV, paste, etc).
 * Replaces the legacy `importCSV` route, which did server-side CSV parsing.
 * Returns the freshly inserted guest rows.
 */
export const bulkImport = mutation({
  args: {
    eventId: v.id("events"),
    rows: v.array(GUEST_ROW),
  },
  handler: async (ctx, { eventId, rows }) => {
    const user = await requireUser(ctx);
    await requireOwnedEvent(ctx, eventId, user._id);

    if (rows.length === 0) {
      throw new Error("No valid guest entries provided");
    }

    const insertedIds: Id<"guests">[] = [];
    const now = Date.now();

    for (const row of rows) {
      if (!row.name || row.name.length > 300) continue;
      const id = await ctx.db.insert("guests", {
        eventId,
        name: row.name,
        email: row.email,
        phone: row.phone,
        portalToken: undefined,
        notificationStatus: "pending",
        checkedIn: "0",
        updatedAt: now,
      });
      insertedIds.push(id);
    }

    const inserted = await Promise.all(insertedIds.map((id) => ctx.db.get(id)));
    return { imported: insertedIds.length, guests: inserted.filter(Boolean) };
  },
});

/** Add a single guest. */
export const add = mutation({
  args: {
    eventId: v.id("events"),
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, { eventId, name, email, phone }) => {
    const user = await requireUser(ctx);
    await requireOwnedEvent(ctx, eventId, user._id);

    if (name.length < 1 || name.length > 300) {
      throw new Error("Name must be 1-300 characters");
    }

    const id = await ctx.db.insert("guests", {
      eventId,
      name,
      email,
      phone,
      portalToken: undefined,
      notificationStatus: "pending",
      checkedIn: "0",
      updatedAt: Date.now(),
    });
    const guest = await ctx.db.get(id);
    return { guest };
  },
});

/**
 * Patch a guest row. Used to persist a freshly-signed `portalToken` after
 * `guestTokens.signGuestToken` returns, and for general edits.
 */
export const update = mutation({
  args: {
    guestId: v.id("guests"),
    eventId: v.id("events"),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    portalToken: v.optional(v.string()),
    notificationStatus: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("sent"),
        v.literal("failed"),
        v.literal("skipped"),
      ),
    ),
    notificationSentAt: v.optional(v.number()),
    notificationError: v.optional(v.string()),
  },
  handler: async (ctx, { guestId, eventId, ...rest }) => {
    const user = await requireUser(ctx);
    await requireOwnedEvent(ctx, eventId, user._id);

    // IDOR fix: verify the guest actually belongs to this event.
    const guest = await ctx.db.get(guestId);
    if (!guest || guest.eventId !== eventId) {
      throw new Error("Guest not found in this event");
    }

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [k, val] of Object.entries(rest)) {
      if (val !== undefined) patch[k] = val;
    }
    await ctx.db.patch(guestId, patch);
    return { success: true };
  },
});

export const remove = mutation({
  args: {
    guestId: v.id("guests"),
    eventId: v.id("events"),
  },
  handler: async (ctx, { guestId, eventId }) => {
    const user = await requireUser(ctx);
    await requireOwnedEvent(ctx, eventId, user._id);

    // IDOR fix preserved.
    const guest = await ctx.db.get(guestId);
    if (!guest || guest.eventId !== eventId) {
      throw new Error("Guest not found in this event");
    }
    await ctx.db.delete(guestId);
    return { success: true };
  },
});

/**
 * Bulk patch notification status — used by the notifications send-blast flow
 * after delivery attempts. Each guestId is verified to belong to the eventId.
 */
export const updateNotificationStatusBulk = mutation({
  args: {
    eventId: v.id("events"),
    guestIds: v.array(v.id("guests")),
    status: v.union(
      v.literal("pending"),
      v.literal("sent"),
      v.literal("failed"),
      v.literal("skipped"),
    ),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { eventId, guestIds, status, error }) => {
    const user = await requireUser(ctx);
    await requireOwnedEvent(ctx, eventId, user._id);

    const now = Date.now();
    for (const id of guestIds) {
      const guest = await ctx.db.get(id);
      if (!guest || guest.eventId !== eventId) continue; // skip cross-tenant
      const patch: Record<string, unknown> = {
        notificationStatus: status,
        updatedAt: now,
      };
      if (status === "sent") patch.notificationSentAt = now;
      if (error) patch.notificationError = error;
      await ctx.db.patch(id, patch);
    }
    return { updated: guestIds.length };
  },
});

export const checkIn = mutation({
  args: {
    eventId: v.id("events"),
    guestId: v.id("guests"),
  },
  handler: async (ctx, { eventId, guestId }) => {
    const user = await requireUser(ctx);
    await requireOwnedEvent(ctx, eventId, user._id);

    const guest = await ctx.db.get(guestId);
    if (!guest || guest.eventId !== eventId) {
      throw new Error("Guest not found in this event");
    }
    await ctx.db.patch(guestId, {
      checkedIn: "1",
      checkedInAt: Date.now(),
      updatedAt: Date.now(),
    });
    return { success: true };
  },
});

export const uncheckIn = mutation({
  args: {
    eventId: v.id("events"),
    guestId: v.id("guests"),
  },
  handler: async (ctx, { eventId, guestId }) => {
    const user = await requireUser(ctx);
    await requireOwnedEvent(ctx, eventId, user._id);

    const guest = await ctx.db.get(guestId);
    if (!guest || guest.eventId !== eventId) {
      throw new Error("Guest not found in this event");
    }
    await ctx.db.patch(guestId, {
      checkedIn: "0",
      checkedInAt: undefined,
      updatedAt: Date.now(),
    });
    return { success: true };
  },
});
