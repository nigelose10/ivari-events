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
  // TODO(V7 W5): add co-host check here once `eventCohosts` table lands:
  //   const cohost = await ctx.db.query("eventCohosts")...
  //   if (!isHost && !cohost) throw …
  if (!isHost) throw new Error("Forbidden");

  return { user, event };
}
