/**
 * RSVPs — guest portal submission + host-only listing.
 *
 * Realtime: the legacy router emitted `emitRsvpUpdate` over Socket.IO after
 * each submit. That's gone — Convex queries (`list`, `getCounts`,
 * `publicCounts`) re-fire automatically when this mutation writes, so any
 * subscribed client gets the new counts for free.
 *
 * Public submit: guests authenticate via a JWT token in the URL, NOT Stack
 * Auth. The flow is:
 *   1. `guestTokens.verifyGuestToken` action → returns the eventId+slug.
 *   2. `rsvps.create` mutation, called with the verified eventId.
 *
 * The mutation itself doesn't (and can't) verify the JWT — token verification
 * is done by an action, then the trusted eventId is passed in. This is how
 * Convex recommends mixing Node-only crypto with reactive mutations.
 *
 * For convenience, `submitWithToken` is an action that does both steps in one
 * call from the client. The action runs in Node, verifies the token, then
 * calls the internal mutation.
 */
import { v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
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

async function rsvpCounts(
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
// Host-only queries
// ───────────────────────────────────────────────────────────────────────────

export const list = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const user = await requireUser(ctx);
    await requireOwnedEvent(ctx, eventId, user._id);
    return ctx.db
      .query("rsvps")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .order("desc")
      .collect();
  },
});

export const getCounts = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const user = await requireUser(ctx);
    await requireOwnedEvent(ctx, eventId, user._id);
    return rsvpCounts(ctx, eventId);
  },
});

/** Public counts for a slug — used by the guest portal to show an "X people
 *  are coming" stat without exposing the full RSVP list. */
export const publicCounts = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const event = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!event) throw new Error("Event not found");
    return rsvpCounts(ctx, event._id);
  },
});

// ───────────────────────────────────────────────────────────────────────────
// Public RSVP submission — JWT-gated, not Stack-Auth-gated.
// ───────────────────────────────────────────────────────────────────────────

const RSVP_INPUT = {
  guestName: v.string(),
  guestEmail: v.optional(v.string()),
  guestPhone: v.optional(v.string()),
  status: v.union(
    v.literal("attending"),
    v.literal("declined"),
    v.literal("maybe"),
  ),
  plusOnes: v.optional(v.number()),
  message: v.optional(v.string()),
  surveyResponses: v.optional(v.any()),
} as const;

/**
 * Internal mutation: create the RSVP after the token has been verified.
 * Caller (action) is responsible for proving they hold a valid token for
 * `eventId` — DO NOT expose this directly to the client.
 */
export const createInternal = internalMutation({
  args: {
    eventId: v.id("events"),
    ...RSVP_INPUT,
  },
  handler: async (ctx, { eventId, ...input }) => {
    if (input.guestName.length < 1 || input.guestName.length > 300) {
      throw new Error("Guest name must be 1-300 characters");
    }
    if (input.message && input.message.length > 2000) {
      throw new Error("Message too long");
    }
    if (input.plusOnes !== undefined && (input.plusOnes < 0 || input.plusOnes > 10)) {
      throw new Error("plusOnes must be 0-10");
    }

    const event = await ctx.db.get(eventId);
    if (!event) throw new Error("Event not found");
    if (event.status !== "active") {
      throw new Error("This event is not currently accepting RSVPs");
    }
    if (event.rsvpDeadline && Date.now() > event.rsvpDeadline) {
      throw new Error("The RSVP deadline for this event has passed");
    }

    if (
      input.status === "attending" &&
      event.maxCapacity &&
      event.maxCapacity > 0
    ) {
      const counts = await rsvpCounts(ctx, eventId);
      if (counts.attending >= event.maxCapacity) {
        throw new Error("This event has reached its capacity limit");
      }
    }

    const rsvpId = await ctx.db.insert("rsvps", {
      eventId,
      guestName: input.guestName,
      guestEmail: input.guestEmail,
      guestPhone: input.guestPhone,
      status: input.status,
      plusOnes: input.plusOnes ?? 0,
      message: input.message,
      surveyResponses: input.surveyResponses,
      updatedAt: Date.now(),
    });

    return { _id: rsvpId, success: true };
  },
});

/**
 * Public action: verify guest JWT, then create the RSVP. One round trip from
 * the client's perspective. This is the canonical entry point for guest
 * portal RSVP submissions.
 */
export const submitWithToken = action({
  args: {
    token: v.string(),
    ...RSVP_INPUT,
  },
  handler: async (ctx, { token, ...input }) => {
    const payload = await ctx.runAction(
      internal.guestTokens.verifyGuestTokenInternal,
      { token },
    );
    return ctx.runMutation(internal.rsvps.createInternal, {
      eventId: payload.eventId as Id<"events">,
      ...input,
    });
  },
});
