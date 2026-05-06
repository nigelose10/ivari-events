/**
 * Users — Stack Auth → Convex identity bootstrap.
 *
 * Stack Auth signs JWTs and Convex verifies them (see auth.config.ts), but
 * Convex doesn't auto-create a row in the `users` table. The frontend must
 * call `ensureUser` once after sign-in (idempotent — safe to call on every
 * page load) to upsert the row by `tokenIdentifier`.
 *
 * Once the row exists, every other module's `requireUser()` helper succeeds.
 */
import { v } from "convex/values";
import { mutation, query, internalQuery } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

/**
 * Upsert the current authenticated user into the `users` table.
 *
 * - Pulls identity from `ctx.auth.getUserIdentity()` (verified Stack JWT).
 * - Looks up by `tokenIdentifier` (the canonical Convex identity key).
 * - If the row exists: patches name/email/lastSignedIn (non-destructive).
 * - If not: inserts a new row with role "user".
 *
 * Idempotent — frontend calls this on every mount of the auth-aware tree.
 * Throws if the JWT can't be verified (no auth) — caller should only invoke
 * after Stack Auth reports `isAuthenticated`.
 */
export const ensureUser = mutation({
  args: {},
  returns: v.object({
    _id: v.id("users"),
    tokenIdentifier: v.string(),
    role: v.union(v.literal("user"), v.literal("admin")),
  }),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized — no JWT");

    // Convex constructs tokenIdentifier as `${issuer}|${subject}`.
    const tokenIdentifier = identity.tokenIdentifier;
    const now = Date.now();

    // Stack Auth claim names: standard OIDC `email`, `name`/`given_name`.
    // Fall back to the subject if no name is available.
    const email = identity.email ?? undefined;
    const name =
      (identity.name as string | undefined) ??
      (identity.givenName as string | undefined) ??
      identity.email ??
      undefined;

    const existing = await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) =>
        q.eq("tokenIdentifier", tokenIdentifier),
      )
      .unique();

    if (existing) {
      // Non-destructive patch — keep existing role, refresh name/email/lastSignedIn.
      await ctx.db.patch(existing._id, {
        name: name ?? existing.name,
        email: email ?? existing.email,
        updatedAt: now,
        lastSignedIn: now,
      });
      return {
        _id: existing._id,
        tokenIdentifier: existing.tokenIdentifier,
        role: existing.role,
      };
    }

    const newId = await ctx.db.insert("users", {
      tokenIdentifier,
      name,
      email,
      loginMethod: "stack-auth",
      role: "user",
      updatedAt: now,
      lastSignedIn: now,
    });

    return {
      _id: newId,
      tokenIdentifier,
      role: "user" as const,
    };
  },
});

/** Read the current user row (returns null if not bootstrapped yet). */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
    return user;
  },
});

/**
 * Claim a guest record for the currently signed-in Stack Auth user.
 *
 * Called by the Portal after a guest signs in following an "Attending" tap on
 * a per-guest invitation link. The guest row is keyed by `eventSlug` + the
 * `guestId` carried in the JWT (`gt=` query param). Once claimed, the event
 * surfaces in the user's "I'm Attending" list on Home, and on subsequent
 * portal visits we greet them by name with their table assignment.
 */
export const claimGuestRecord = mutation({
  args: { eventSlug: v.string(), guestId: v.id("guests") },
  returns: v.union(
    v.literal("claimed"),
    v.literal("already-yours"),
    v.literal("not-found"),
    v.literal("already-claimed-by-other"),
  ),
  handler: async (ctx, { eventSlug, guestId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const user = await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
    if (!user) throw new Error("User row missing — auth bootstrap not run");

    const event = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", eventSlug))
      .first();
    if (!event) return "not-found";

    const guest = await ctx.db.get(guestId);
    if (!guest || guest.eventId !== event._id) return "not-found";

    if (guest.claimedByUserId === user._id) return "already-yours";
    // If another signed-in user already claimed this exact guest record,
    // refuse — guest rows are 1:1 with a person and shouldn't be transferred.
    if (guest.claimedByUserId && guest.claimedByUserId !== user._id) {
      return "already-claimed-by-other";
    }

    await ctx.db.patch(guestId, {
      claimedByUserId: user._id,
      claimedAt: Date.now(),
      updatedAt: Date.now(),
    });
    return "claimed";
  },
});

/**
 * Resolve the current user's claimed guest record for a given event slug.
 * Powers the personalized greeting in Portal — name + table number + dietary
 * notes appear on subsequent visits/scans without re-typing.
 *
 * Returns null when not signed in, no claim exists, or the event isn't found.
 */
export const myClaimedGuestForEvent = query({
  args: { eventSlug: v.string() },
  handler: async (ctx, { eventSlug }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
    if (!user) return null;

    const event = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", eventSlug))
      .first();
    if (!event) return null;

    // Pull all guest rows this user has claimed and pick the one for this event.
    const claimed = await ctx.db
      .query("guests")
      .withIndex("by_claimedByUserId", (q) =>
        q.eq("claimedByUserId", user._id),
      )
      .collect();
    const match = claimed.find((g) => g.eventId === event._id);
    if (!match) return null;

    return {
      _id: match._id,
      name: match.name,
      tableNumber: match.tableNumber,
      seatNumber: match.seatNumber,
      dietaryNotes: match.dietaryNotes,
      guestNotes: match.guestNotes,
    };
  },
});

/** Internal helper — used by other modules' actions to look up a user by JWT subject. */
export const getCurrentUser = internalQuery({
  args: { tokenIdentifier: v.string() },
  handler: async (ctx, { tokenIdentifier }): Promise<Doc<"users"> | null> => {
    return await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) =>
        q.eq("tokenIdentifier", tokenIdentifier),
      )
      .unique();
  },
});
