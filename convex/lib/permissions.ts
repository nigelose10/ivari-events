/**
 * Authorization helpers shared across Convex functions.
 *
 * Centralizing these here keeps the IDOR/auth-check pattern consistent: every
 * mutation that touches event-scoped data should call exactly one of these
 * before reading or writing.
 *
 * Co-host plumbing comes in V7 W5 (sibling agent owns it). For now,
 * `requireHostOrCohost` only checks `event.hostId === user._id`. When the
 * `eventCohosts` table lands, extend the function to additionally consult
 * that join — call sites won't change.
 */
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/**
 * Resolves the authenticated user from the request identity. Throws on
 * missing identity or missing user record.
 */
export async function requireUser(
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

/**
 * Loads an event and returns it together with the authenticated user, but
 * only if that user is the event host (or, in V7+, a co-host).
 *
 * Throws when:
 *   - the request is unauthenticated
 *   - the event doesn't exist
 *   - the user is neither host nor co-host
 *
 * IDOR guard: callers should pass the eventId from their own arguments and
 * rely on this helper for the ownership check, rather than trusting any
 * client-provided "isHost" flag.
 */
export async function requireHostOrCohost(
  ctx: QueryCtx | MutationCtx,
  eventId: Id<"events">,
): Promise<{ user: Doc<"users">; event: Doc<"events"> }> {
  const user = await requireUser(ctx);
  const event = await ctx.db.get(eventId);
  if (!event) throw new Error("Event not found");

  const isHost = event.hostId === user._id;
  const isCoHost =
    !!event.coHostIds && event.coHostIds.includes(user._id);
  if (!isHost && !isCoHost) throw new Error("Forbidden");

  return { user, event };
}

/**
 * Softer check for surfaces guests can also see (chat, memory wall reads).
 * Returns the role rather than throwing — the caller decides what to do.
 *
 * Roles:
 *   - "host"      — `event.hostId === user._id`
 *   - "co-host"   — user is in `event.coHostIds`
 *   - "guest"     — user has at least one `guests` row on the event with
 *                   `claimedByUserId === user._id`
 *   - null         — none of the above (no access to private surfaces)
 *
 * Public-by-default events (`isPublic: true`) still gate sensitive ops like
 * sending messages on the role; reads are allowed for any "guest" or above.
 */
export async function getEventRole(
  ctx: QueryCtx | MutationCtx,
  eventId: Id<"events">,
): Promise<{
  user: Doc<"users"> | null;
  event: Doc<"events"> | null;
  role: "host" | "co-host" | "guest" | null;
}> {
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
  const event = await ctx.db.get(eventId);
  if (!event) return { user, event: null, role: null };
  if (!user) return { user: null, event, role: null };

  if (event.hostId === user._id) return { user, event, role: "host" };
  if (event.coHostIds && event.coHostIds.includes(user._id)) {
    return { user, event, role: "co-host" };
  }

  // Claimed-guest check — at least one guests row pointing back to this user.
  const claimed = await ctx.db
    .query("guests")
    .withIndex("by_claimedByUserId", (q) => q.eq("claimedByUserId", user._id))
    .collect();
  if (claimed.some((g) => g.eventId === eventId)) {
    return { user, event, role: "guest" };
  }
  return { user, event, role: null };
}
