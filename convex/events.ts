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

/** Race-tolerant variant for read-only queries on Home / lists.
 *
 *  After Stack Auth flips to authenticated, `UserBootstrap` fires a separate
 *  `ensureUser` mutation that upserts the row. Reactive queries that gate on
 *  `isAuthenticated` will subscribe before that mutation completes, so for the
 *  first one or two ticks the user row genuinely doesn't exist yet. Returning
 *  null lets callers render an empty list; the bootstrap creates the row, the
 *  query re-fires, and real data appears within a frame or two. Mutations and
 *  ownership-sensitive queries still use the strict `requireUser`. */
async function requireUserOrNull(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return ctx.db
    .query("users")
    .withIndex("by_tokenIdentifier", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier),
    )
    .unique();
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
    const user = await requireUserOrNull(ctx);
    if (!user) return [];
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

/**
 * "I'm Attending" — events the current user has claimed via a per-guest
 * invitation link. Returns each event with the user's guest metadata
 * (table number, name as registered) attached so Home can render a
 * personalized card.
 *
 * Returns [] when unauthenticated — no throws so Home can render even when
 * the user is signed-out (the section just collapses).
 */
export const myClaimedEvents = query({
  args: {
    /** Optional anon device key. When passed and the caller isn't signed in,
     *  we surface events the device claimed via the name-list flow so anon
     *  visitors see "I'm Attending" populated too. */
    deviceKey: v.optional(v.string()),
  },
  handler: async (ctx, { deviceKey }) => {
    const identity = await ctx.auth.getUserIdentity();
    let user: Doc<"users"> | null = null;
    if (identity) {
      user = await ctx.db
        .query("users")
        .withIndex("by_tokenIdentifier", (q) =>
          q.eq("tokenIdentifier", identity.tokenIdentifier),
        )
        .unique();
    }

    // Pull both account-claimed and device-claimed guest rows.
    const claimedByUser = user
      ? await ctx.db
          .query("guests")
          .withIndex("by_claimedByUserId", (q) =>
            q.eq("claimedByUserId", user!._id),
          )
          .collect()
      : [];
    const claimedByDevice = deviceKey
      ? await ctx.db
          .query("guests")
          .withIndex("by_claimedByDeviceKey", (q) =>
            q.eq("claimedByDeviceKey", deviceKey),
          )
          .collect()
      : [];

    // Dedupe (a row claimed by both user + device — e.g. user signed in
    // after an anon claim — should appear once).
    const byId = new Map<Id<"guests">, Doc<"guests">>();
    for (const g of claimedByUser) byId.set(g._id, g);
    for (const g of claimedByDevice) byId.set(g._id, g);

    const enriched = await Promise.all(
      Array.from(byId.values()).map(async (g) => {
        const event = await ctx.db.get(g.eventId);
        if (!event) return null;
        // Hosts of an event don't see it in their "I'm Attending" list —
        // it already lives in the host events column.
        if (user && event.hostId === user._id) return null;
        const resolved = await withResolvedImage(ctx, event);
        return {
          ...resolved,
          asGuestId: g._id,
          tableNumber: g.tableNumber,
          seatNumber: g.seatNumber,
          guestName: g.name,
          claimedAt: g.claimedAt,
        };
      }),
    );
    return enriched.filter((e): e is NonNullable<typeof e> => e !== null);
  },
});

/**
 * Public-event discovery — full-text search over titles of events that are
 * marked `isPublic: true` and currently `active`. Returns up to 10 hits with
 * guest-safe fields (no hostId, no guestTokenSalt) so unauthenticated callers
 * can preview before signing in.
 *
 * Trims and rejects very-short queries (<2 chars) to keep the index from
 * returning the firehose. The `prefix` mode treats the last token as a
 * prefix — typing "summ" matches "Summer Block Party".
 */
export const searchPublic = query({
  args: { q: v.string() },
  handler: async (ctx, { q }) => {
    const trimmed = q.trim();
    if (trimmed.length < 2) return [];

    const hits = await ctx.db
      .query("events")
      .withSearchIndex("search_title_public", (idx) =>
        idx.search("title", trimmed).eq("isPublic", true).eq("status", "active"),
      )
      .take(10);

    // Privacy: deliberately do NOT return guestCount on public search hits
    // — the size of someone's invite list is the host's business, not the
    // public's. The host sees real counts in Pulse.
    return Promise.all(
      hits.map(async (e) => {
        const resolved = await withResolvedImage(ctx, e);
        return {
          _id: e._id,
          slug: e.slug,
          title: e.title,
          description: e.description,
          imageUrl: resolved.imageUrl,
          eventDate: e.eventDate,
          locationName: e.locationName,
          themeColor: e.themeColor,
        };
      }),
    );
  },
});

/**
 * Join a public event as a self-claimed guest. Idempotent — calling twice
 * returns "already-joined" rather than inserting a duplicate guest row.
 *
 * Auth: requires a Stack-auth user. The new `guests` row carries
 * `claimedByUserId = me._id` so the event immediately surfaces in the
 * user's "I'm Attending" list on Home (same path as friend-invite + QR claim).
 */
export const joinPublicEvent = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const me = await requireUser(ctx);
    const event = await ctx.db.get(eventId);
    if (!event) throw new Error("Event not found");
    if (!event.isPublic) throw new Error("This event isn't public");
    if (event.status !== "active") throw new Error("This event isn't active");
    if (event.hostId === me._id) {
      // Hosts don't get a guest row for their own event.
      return { state: "you-host-this" as const };
    }

    // Already joined?
    const existing = await ctx.db
      .query("guests")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .filter((q) => q.eq(q.field("claimedByUserId"), me._id))
      .first();
    if (existing) {
      return { state: "already-joined" as const, guestId: existing._id };
    }

    // Capacity check (maxCapacity 0 or undefined = unlimited).
    if (event.maxCapacity && event.maxCapacity > 0) {
      const total = (
        await ctx.db
          .query("guests")
          .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
          .collect()
      ).length;
      if (total >= event.maxCapacity) {
        throw new Error("This event is at capacity");
      }
    }

    const now = Date.now();
    const guestId = await ctx.db.insert("guests", {
      eventId,
      name: me.name || me.username || "ivari guest",
      email: me.email,
      phone: undefined,
      portalToken: undefined,
      notificationStatus: "skipped",
      checkedIn: "0",
      claimedByUserId: me._id,
      claimedAt: now,
      updatedAt: now,
    });

    return { state: "joined" as const, guestId };
  },
});

/**
 * Name-list search for public-events with `claimMode === "name-list"`.
 * Visitor types their name; we return up to 8 candidate guest rows from the
 * pre-loaded list. Only safe-to-public fields come back: name + table number,
 * never email/phone/notes.
 *
 * Authentication: none required. The lookup is deliberately public because the
 * gala-style use case (DRA@50) wants attendees who arrive without a token to
 * still be able to find themselves on the list. The match is fuzzy — uses
 * the existing `search_name_for_event` text index, which already does
 * tokenized prefix matching.
 *
 * Throws if the event isn't `claimMode: "name-list"` so we don't accidentally
 * leak open-event guest names.
 */
export const searchGuestsByName = query({
  args: { slug: v.string(), q: v.string() },
  handler: async (ctx, { slug, q }) => {
    const trimmed = q.trim();
    if (trimmed.length < 2) return [];

    const event = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!event) throw new Error("Event not found");
    if (!event.isPublic || event.claimMode !== "name-list") {
      throw new Error("This event isn't using name-list claim");
    }

    const hits = await ctx.db
      .query("guests")
      .withSearchIndex("search_name_for_event", (idx) =>
        idx.search("name", trimmed).eq("eventId", event._id),
      )
      .take(8);

    return hits.map((g) => ({
      _id: g._id,
      name: g.name,
      tableNumber: g.tableNumber,
      seatNumber: g.seatNumber,
      isClaimed: !!g.claimedByUserId,
    }));
  },
});

/**
 * Confirm a name-list claim. The visitor has picked one of the rows from
 * `searchGuestsByName` and is asserting it's them.
 *
 * Two paths, picked at runtime:
 *   - **Signed-in user** → persist `claimedByUserId = me._id` (durable across
 *     devices; event shows in their "I'm Attending" list).
 *   - **Anonymous visitor** → client supplies a `deviceKey` (random UUID
 *     stored in localStorage). We store it on the row so subsequent visits
 *     from the same device recognize the same guest. They can later upgrade
 *     to a real account and we'll fold the device claim into their user.
 *
 * Idempotent: re-claiming a row you already own returns `already-yours`.
 * `taken` if someone else owns it (signed-in or other device) — caller can
 * try a different row (e.g. "X's Guest").
 */
export const claimByName = mutation({
  args: {
    slug: v.string(),
    guestId: v.id("guests"),
    /** Required for anon visitors. Ignored when a Stack JWT is present. */
    deviceKey: v.optional(v.string()),
  },
  handler: async (ctx, { slug, guestId, deviceKey }) => {
    const event = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!event) throw new Error("Event not found");
    if (!event.isPublic || event.claimMode !== "name-list") {
      throw new Error("This event isn't using name-list claim");
    }

    const guest = await ctx.db.get(guestId);
    if (!guest || guest.eventId !== event._id) {
      throw new Error("Guest not on this event's list");
    }

    // Resolve a Stack user if there is one; falls back to anon-with-deviceKey.
    const identity = await ctx.auth.getUserIdentity();
    let me = null;
    if (identity) {
      me = await ctx.db
        .query("users")
        .withIndex("by_tokenIdentifier", (q) =>
          q.eq("tokenIdentifier", identity.tokenIdentifier),
        )
        .unique();
    }

    // Idempotent — re-claim by same owner.
    if (me && guest.claimedByUserId === me._id) {
      return {
        state: "already-yours" as const,
        guestId,
        name: guest.name,
        tableNumber: guest.tableNumber,
        seatNumber: guest.seatNumber,
      };
    }
    if (
      !me &&
      deviceKey &&
      guest.claimedByDeviceKey === deviceKey &&
      !guest.claimedByUserId
    ) {
      return {
        state: "already-yours" as const,
        guestId,
        name: guest.name,
        tableNumber: guest.tableNumber,
        seatNumber: guest.seatNumber,
      };
    }

    if (
      guest.claimedByUserId ||
      (guest.claimedByDeviceKey && guest.claimedByDeviceKey !== deviceKey)
    ) {
      return { state: "taken" as const };
    }

    if (!me && !deviceKey) {
      throw new Error("deviceKey required for anonymous claim");
    }

    const now = Date.now();
    await ctx.db.patch(guestId, {
      claimedByUserId: me ? me._id : undefined,
      claimedByDeviceKey: me ? undefined : deviceKey,
      claimedAt: now,
      updatedAt: now,
    });

    // Auto-RSVP as attending. The whole point of the name-list flow is
    // that picking your name means "I'll be there" — making the user click
    // a separate Accept after they've already confirmed identity adds
    // friction with no signal. The host can still see RSVP counts in Pulse.
    // Idempotent: skip if there's already an RSVP keyed by name.
    const existingRsvp = await ctx.db
      .query("rsvps")
      .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
      .filter((q) => q.eq(q.field("guestName"), guest.name))
      .first();
    if (!existingRsvp) {
      await ctx.db.insert("rsvps", {
        eventId: event._id,
        guestName: guest.name,
        guestEmail: guest.email,
        guestPhone: guest.phone,
        status: "attending",
        plusOnes: 0,
        updatedAt: now,
      });
      // Link the RSVP back to the guest row for cleaner host views.
      const justInserted = await ctx.db
        .query("rsvps")
        .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
        .filter((q) => q.eq(q.field("guestName"), guest.name))
        .first();
      if (justInserted) {
        await ctx.db.patch(guestId, { rsvpId: justInserted._id });
      }
    }

    return {
      state: "claimed" as const,
      guestId,
      name: guest.name,
      tableNumber: guest.tableNumber,
      seatNumber: guest.seatNumber,
    };
  },
});

/**
 * Recover an anonymous claim from a device key — called on page load by the
 * Portal so a returning visitor lands directly on their table assignment
 * without re-typing their name. Public-safe (only name + table, never
 * email/phone).
 */
export const getClaimByDeviceKey = query({
  args: { slug: v.string(), deviceKey: v.string() },
  handler: async (ctx, { slug, deviceKey }) => {
    if (!deviceKey) return null;
    const event = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!event) return null;

    const guest = await ctx.db
      .query("guests")
      .withIndex("by_claimedByDeviceKey", (q) =>
        q.eq("claimedByDeviceKey", deviceKey),
      )
      .filter((q) => q.eq(q.field("eventId"), event._id))
      .first();
    if (!guest) return null;
    return {
      _id: guest._id,
      name: guest.name,
      tableNumber: guest.tableNumber,
      seatNumber: guest.seatNumber,
    };
  },
});

// ───────────────────────────────────────────────────────────────────────────
// Co-hosts (admins) — host-only management
// ───────────────────────────────────────────────────────────────────────────

/**
 * Add a co-host to the event by their email. The user must already have
 * an ivari account (i.e. signed in at least once so their `users` row
 * exists). Returns the updated array or an error message.
 *
 * Auth: only the host can add co-hosts. Co-hosts cannot promote others —
 * keeps the chain of authority clear.
 */
export const addCoHostByEmail = mutation({
  args: { eventId: v.id("events"), email: v.string() },
  handler: async (
    ctx,
    { eventId, email },
  ): Promise<{ ok: true; userId: Id<"users"> } | { ok: false; reason: string }> => {
    const me = await requireUser(ctx);
    const event = await ctx.db.get(eventId);
    if (!event) throw new Error("Event not found");
    if (event.hostId !== me._id) {
      // Only the host (not co-hosts) can add new co-hosts. Keeps the
      // promotion authority unambiguous.
      return { ok: false, reason: "Only the event host can add admins." };
    }

    const target = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email.trim().toLowerCase()))
      .unique();
    if (!target) {
      return {
        ok: false,
        reason: `No ivari account found for ${email}. Ask them to sign in once, then try again.`,
      };
    }
    if (target._id === me._id) {
      return { ok: false, reason: "You're already the host." };
    }

    const existing = event.coHostIds ?? [];
    if (existing.includes(target._id)) {
      return { ok: true, userId: target._id };
    }
    await ctx.db.patch(eventId, {
      coHostIds: [...existing, target._id],
      updatedAt: Date.now(),
    });
    return { ok: true, userId: target._id };
  },
});

/**
 * Promote a guest row directly to co-host. Lets the host promote inline
 * from the Guests tab without re-typing the person's email — the guest
 * must have a `claimedByUserId` (i.e. they signed in and claimed the seat),
 * since co-host status is account-based, not anonymous-claim-based.
 *
 * Returns:
 *   { ok: true, userId } — promoted (or already a co-host; idempotent)
 *   { ok: false, reason } — guest hasn't signed in yet, or other failure
 */
export const promoteGuestToCoHost = mutation({
  args: { eventId: v.id("events"), guestId: v.id("guests") },
  handler: async (
    ctx,
    { eventId, guestId },
  ): Promise<{ ok: true; userId: Id<"users"> } | { ok: false; reason: string }> => {
    const me = await requireUser(ctx);
    const event = await ctx.db.get(eventId);
    if (!event) throw new Error("Event not found");
    if (event.hostId !== me._id) {
      return { ok: false, reason: "Only the event host can add admins." };
    }

    const guest = await ctx.db.get(guestId);
    if (!guest || guest.eventId !== eventId) {
      return { ok: false, reason: "Guest not on this event." };
    }
    if (!guest.claimedByUserId) {
      return {
        ok: false,
        reason: `${guest.name} hasn't signed in to ivari yet. Ask them to claim their seat first, then promote.`,
      };
    }
    if (guest.claimedByUserId === me._id) {
      return { ok: false, reason: "You're already the host." };
    }

    const existing = event.coHostIds ?? [];
    if (existing.includes(guest.claimedByUserId)) {
      return { ok: true, userId: guest.claimedByUserId };
    }
    await ctx.db.patch(eventId, {
      coHostIds: [...existing, guest.claimedByUserId],
      updatedAt: Date.now(),
    });
    return { ok: true, userId: guest.claimedByUserId };
  },
});

/** Remove a co-host. Host-only. Idempotent. */
export const removeCoHost = mutation({
  args: { eventId: v.id("events"), userId: v.id("users") },
  handler: async (ctx, { eventId, userId }) => {
    const me = await requireUser(ctx);
    const event = await ctx.db.get(eventId);
    if (!event) throw new Error("Event not found");
    if (event.hostId !== me._id) {
      throw new Error("Only the event host can remove admins.");
    }
    const existing = event.coHostIds ?? [];
    await ctx.db.patch(eventId, {
      coHostIds: existing.filter((id) => id !== userId),
      updatedAt: Date.now(),
    });
    return { success: true };
  },
});

/** List co-hosts with their public profile fields. Host-only read so we
 *  don't leak admin identities to guests. */
export const listCoHosts = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const user = await requireUser(ctx);
    const event = await ctx.db.get(eventId);
    if (!event || event.hostId !== user._id) return [];
    const ids = event.coHostIds ?? [];
    const profiles = await Promise.all(ids.map((id) => ctx.db.get(id)));
    return profiles
      .filter((u): u is Doc<"users"> => !!u)
      .map((u) => ({
        _id: u._id,
        name: u.name,
        username: u.username,
        email: u.email,
        avatarUrl: u.avatarUrl,
      }));
  },
});

/**
 * Auto-match a signed-in user to a guest row on a public name-list event
 * by display name. Used on Home for "want to claim X's seat?" prompts —
 * non-destructive (returns suggestions; does not auto-claim).
 *
 * Returns at most 5 suggestions across all public name-list events the user
 * doesn't already host or have a claimed seat on.
 */
export const guessClaimsForMe = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const me = await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
    if (!me) return [];

    const myName = (me.name ?? "").trim();
    const myUsername = (me.username ?? "").trim();
    if (myName.length < 3 && myUsername.length < 3) return [];

    // Pull all public name-list events.
    const events = await ctx.db
      .query("events")
      .withIndex("by_slug")
      .collect();
    const publicNameList = events.filter(
      (e) => e.isPublic && e.claimMode === "name-list" && e.status === "active",
    );

    const suggestions: Array<{
      eventSlug: string;
      eventTitle: string;
      guestId: Id<"guests">;
      guestName: string;
      tableNumber?: string;
    }> = [];

    for (const ev of publicNameList) {
      // Skip events I host or already have a claim on.
      if (ev.hostId === me._id) continue;

      const myExistingClaim = await ctx.db
        .query("guests")
        .withIndex("by_claimedByUserId", (q) => q.eq("claimedByUserId", me._id))
        .filter((q) => q.eq(q.field("eventId"), ev._id))
        .first();
      if (myExistingClaim) continue;

      // Try a name search using the search index.
      const queries = [myName, myUsername].filter((q) => q.length >= 3);
      for (const q of queries) {
        const hits = await ctx.db
          .query("guests")
          .withSearchIndex("search_name_for_event", (idx) =>
            idx.search("name", q).eq("eventId", ev._id),
          )
          .take(3);
        for (const g of hits) {
          if (g.claimedByUserId) continue;
          // Only surface "high-confidence" matches: the guest name must
          // contain the user's name (or vice versa) as a whole token.
          const lower = g.name.toLowerCase();
          const fragments = [myName.toLowerCase(), myUsername.toLowerCase()].filter(Boolean);
          const isStrong = fragments.some((f) => f.length >= 3 && lower.includes(f));
          if (!isStrong) continue;
          suggestions.push({
            eventSlug: ev.slug,
            eventTitle: ev.title,
            guestId: g._id,
            guestName: g.name,
            tableNumber: g.tableNumber,
          });
          if (suggestions.length >= 5) return suggestions;
        }
      }
    }
    return suggestions;
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
      isPublic: event.isPublic,
      claimMode: event.claimMode,
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
    /** Make this event publicly discoverable in Home search. Defaults false. */
    isPublic: v.optional(v.boolean()),
    /** Public claim flow: "open" lets anyone create a guest row; "name-list"
     *  forces visitors to find their pre-loaded name. */
    claimMode: v.optional(
      v.union(v.literal("open"), v.literal("name-list")),
    ),
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
      isPublic: input.isPublic ?? false,
      claimMode: input.claimMode ?? "open",
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
    /** Toggle public discoverability. */
    isPublic: v.optional(v.boolean()),
    claimMode: v.optional(
      v.union(v.literal("open"), v.literal("name-list")),
    ),
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
 * V10 seating-chart — replace the host's table layout for an event. Only the
 * event owner can call this. Stable string ids on each table are referenced
 * by guests.tableNumber (drag-drop assignment in SeatingChart.tsx).
 */
export const updateTablesConfig = mutation({
  args: {
    id: v.id("events"),
    tables: v.array(
      v.object({
        id: v.string(),
        label: v.string(),
        capacity: v.optional(v.number()),
        shape: v.optional(
          v.union(
            v.literal("round"),
            v.literal("rect"),
            v.literal("oval"),
          ),
        ),
      }),
    ),
  },
  handler: async (ctx, { id, tables }) => {
    const user = await requireUser(ctx);
    await requireOwnedEvent(ctx, id, user._id);
    await ctx.db.patch(id, { tablesConfig: tables, updatedAt: Date.now() });
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
