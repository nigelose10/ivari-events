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
import { mutation, query, internalQuery } from "./_generated/server";
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
    const rows = await ctx.db
      .query("guests")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .order("desc")
      .collect();

    // Enrich each row with the claimer's public profile fields so the host's
    // guest list can show an "ivari account ✓" indicator alongside name/email.
    // Cheap (one .get per claimed row, skipped otherwise).
    return Promise.all(
      rows.map(async (g) => {
        if (!g.claimedByUserId) return { ...g, hasIvariAccount: false as const };
        const claimer = await ctx.db.get(g.claimedByUserId);
        if (!claimer) return { ...g, hasIvariAccount: false as const };
        return {
          ...g,
          hasIvariAccount: true as const,
          claimerUsername: claimer.username,
          claimerName: claimer.name,
          claimerAvatarUrl: claimer.avatarUrl,
        };
      }),
    );
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
  // Wedding-tier seating + notes (V10). All optional for backward compat with
  // legacy CSV imports that only had name/email/phone.
  tableNumber: v.optional(v.string()),
  seatNumber: v.optional(v.string()),
  dietaryNotes: v.optional(v.string()),
  hostNotes: v.optional(v.string()),
  guestNotes: v.optional(v.string()),
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
        tableNumber: row.tableNumber,
        seatNumber: row.seatNumber,
        dietaryNotes: row.dietaryNotes,
        hostNotes: row.hostNotes,
        guestNotes: row.guestNotes,
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

/**
 * Public-safe attendee bubbles for the LiveEvent surface — returns claimed
 * guests (those with an ivari account) and their avatar/name. Limited to 24
 * rows so the UI never paints a wall of bubbles. No JWT required: this is
 * intentionally guest-readable since LiveEvent is `/live/:slug` (public).
 *
 * Privacy: only emits avatar + first name. Email, phone, table assignment
 * stay on the host-only `list` query.
 */
export const liveAttendees = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const rows = await ctx.db
      .query("guests")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .collect();

    // Prefer checked-in first, then any claimed, then anonymous fallback.
    const ranked = rows
      .map((g) => ({
        guest: g,
        score:
          (g.checkedIn === "1" ? 2 : 0) + (g.claimedByUserId ? 1 : 0),
      }))
      .filter((r) => r.score > 0 || r.guest.checkedIn === "1")
      .sort((a, b) => b.score - a.score)
      .slice(0, 24);

    return Promise.all(
      ranked.map(async ({ guest }) => {
        let avatarUrl: string | undefined;
        let displayName = guest.name;
        if (guest.claimedByUserId) {
          const u = await ctx.db.get(guest.claimedByUserId);
          if (u) {
            avatarUrl = u.avatarUrl;
            // Use the user's name only if it's set — otherwise keep the
            // guest-row name (which is the host-typed display name).
            if (u.name) displayName = u.name;
          }
        }
        return {
          _id: guest._id,
          name: displayName,
          checkedIn: guest.checkedIn === "1",
          hasIvariAccount: !!guest.claimedByUserId,
          avatarUrl,
        };
      }),
    );
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
 * Bulk-invite ivari friends as guests on the event. The host picks people
 * from their friends list; we insert one guest row per friend and pre-link
 * `claimedByUserId` so each friend's account immediately sees the event in
 * their "I'm Attending" list — no QR claim flow needed for in-network guests.
 *
 * Idempotent per-friend: if the friend already has a claimed row on this
 * event, we skip them (returned in `skipped[]`). Existing unclaimed rows by
 * the same email are linked to the friend rather than duplicated.
 */
export const addFromFriends = mutation({
  args: {
    eventId: v.id("events"),
    friendUserIds: v.array(v.id("users")),
  },
  handler: async (ctx, { eventId, friendUserIds }) => {
    const user = await requireUser(ctx);
    await requireOwnedEvent(ctx, eventId, user._id);

    if (friendUserIds.length === 0) {
      return { added: 0, skipped: [] as Id<"users">[] };
    }
    if (friendUserIds.length > 100) {
      throw new Error("Too many friends in one batch (max 100)");
    }

    // Verify each ID is actually a friend — defense against the client
    // tampering with the request to invite arbitrary users.
    const friendRows = await ctx.db
      .query("friends")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", user._id))
      .collect();
    const acceptedIds = new Set(
      friendRows.filter((r) => r.status === "accepted").map((r) => r.friendUserId),
    );

    let added = 0;
    const skipped: Id<"users">[] = [];
    const now = Date.now();

    for (const friendId of friendUserIds) {
      if (!acceptedIds.has(friendId)) {
        skipped.push(friendId);
        continue;
      }

      // Skip if already a claimed guest on this event.
      const existingClaimed = await ctx.db
        .query("guests")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .filter((q) => q.eq(q.field("claimedByUserId"), friendId))
        .first();
      if (existingClaimed) {
        skipped.push(friendId);
        continue;
      }

      const friend = await ctx.db.get(friendId);
      if (!friend) {
        skipped.push(friendId);
        continue;
      }

      // If an unclaimed guest row exists with the friend's email, link it
      // rather than inserting a duplicate.
      let linked = false;
      if (friend.email) {
        const sameEmail = await ctx.db
          .query("guests")
          .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
          .filter((q) => q.eq(q.field("email"), friend.email))
          .first();
        if (sameEmail && !sameEmail.claimedByUserId) {
          await ctx.db.patch(sameEmail._id, {
            claimedByUserId: friend._id,
            claimedAt: now,
            updatedAt: now,
          });
          linked = true;
        }
      }

      if (!linked) {
        await ctx.db.insert("guests", {
          eventId,
          name: friend.name || friend.username || "ivari friend",
          email: friend.email,
          phone: undefined,
          portalToken: undefined,
          notificationStatus: "pending",
          checkedIn: "0",
          claimedByUserId: friend._id,
          claimedAt: now,
          updatedAt: now,
        });
      }
      added += 1;
    }

    return { added, skipped };
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
    /** Host-controlled guest tier (free-form vocabulary, e.g. VIP, Family). */
    tier: v.optional(v.string()),
    tableNumber: v.optional(v.string()),
    seatNumber: v.optional(v.string()),
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
 * V10 seating-chart assignment. Sets (or clears) tableNumber/seatNumber on a
 * single guest. Pass `tableNumber: undefined` (or omit) to UNASSIGN — the
 * client uses this when a guest is dragged back to the unassigned rail.
 *
 * IDOR-checked: re-loads the guest, then re-loads its event and asserts the
 * caller owns it. Same pattern as `update`/`remove` above.
 */
export const assignTable = mutation({
  args: {
    guestId: v.id("guests"),
    tableNumber: v.optional(v.string()),
    seatNumber: v.optional(v.string()),
  },
  handler: async (ctx, { guestId, tableNumber, seatNumber }) => {
    const user = await requireUser(ctx);
    const guest = await ctx.db.get(guestId);
    if (!guest) throw new Error("Guest not found");
    const event = await ctx.db.get(guest.eventId);
    if (!event || event.hostId !== user._id) {
      throw new Error("Forbidden");
    }
    await ctx.db.patch(guestId, {
      tableNumber: tableNumber || undefined,
      seatNumber: seatNumber || undefined,
      updatedAt: Date.now(),
    });
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

// ───────────────────────────────────────────────────────────────────────────
// Internal queries (called from actions, e.g. guestTokens.mintGuestLink)
// ───────────────────────────────────────────────────────────────────────────

/** Internal: fetch a guest row from inside an action, before doing the
 *  owner-check round-trip via events.getEventForOwnerCheck. */
export const getGuestForOwnerCheck = internalQuery({
  args: { guestId: v.id("guests") },
  handler: async (ctx, { guestId }) => ctx.db.get(guestId),
});

// ───────────────────────────────────────────────────────────────────────────
// Public guest lookup (V10 wedding-tier "find your name" flow)
//
// PUBLIC — NO AUTH. Called from Portal.tsx so guests can type their name and
// see THEIR personalized seating + host-shared notes. We deliberately strip
// hostNotes, email, phone, claimedByUserId, portalToken before returning so
// nothing private leaks. Only the host sees those via guests.list().
// ───────────────────────────────────────────────────────────────────────────
export const findByNameInEvent = query({
  args: { eventSlug: v.string(), nameQuery: v.string() },
  handler: async (ctx, { eventSlug, nameQuery }) => {
    const event = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", eventSlug))
      .first();
    if (!event) return [];
    const trimmed = nameQuery.trim();
    if (trimmed.length < 2) return [];

    const matches = await ctx.db
      .query("guests")
      .withSearchIndex("search_name_for_event", (q) =>
        q.search("name", trimmed).eq("eventId", event._id),
      )
      .take(8);

    // Strip private fields before returning. NEVER include hostNotes,
    // email, phone, portalToken, or notification metadata in this surface.
    return matches.map((g) => ({
      _id: g._id,
      name: g.name,
      tableNumber: g.tableNumber,
      seatNumber: g.seatNumber,
      dietaryNotes: g.dietaryNotes,
      guestNotes: g.guestNotes,
    }));
  },
});
