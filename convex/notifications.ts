/**
 * Notifications — host-only list (query) plus the internal queries and
 * mutations the action layer in `notificationActions.ts` calls into.
 *
 * Why split? Convex requires `"use node"` for any file that uses Node built-ins
 * (the SMS/email HTTP fan-out fetches), and `"use node"` files can ONLY define
 * actions. So queries/mutations live here; actions live next door.
 */
import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// ───────────────────────────────────────────────────────────────────────────
// Host-only list
// ───────────────────────────────────────────────────────────────────────────

export const list = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const user = await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
    if (!user) throw new Error("User record missing");

    const event = await ctx.db.get(eventId);
    if (!event || event.hostId !== user._id) {
      throw new Error("Event not found");
    }

    return ctx.db
      .query("notifications")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .order("desc")
      .collect();
  },
});

// ───────────────────────────────────────────────────────────────────────────
// Internal helpers used by `notificationActions.ts`
// ───────────────────────────────────────────────────────────────────────────

/** Re-validate ownership from inside an action context, where ctx.db isn't
 *  directly available. The caller is expected to have already pulled the
 *  Stack Auth identity and pass `tokenIdentifier`. */
export const getEventForOwnerCheck = internalQuery({
  args: {
    eventId: v.id("events"),
    tokenIdentifier: v.string(),
  },
  handler: async (ctx, { eventId, tokenIdentifier }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) =>
        q.eq("tokenIdentifier", tokenIdentifier),
      )
      .unique();
    if (!user) return null;
    const event = await ctx.db.get(eventId);
    if (!event || event.hostId !== user._id) return null;
    return event;
  },
});

export const getPendingGuestsForBlast = internalQuery({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const all = await ctx.db
      .query("guests")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .collect();
    return all.filter(
      (g) =>
        g.notificationStatus === "pending" ||
        g.notificationStatus === "failed",
    );
  },
});

export const getFailedGuests = internalQuery({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const all = await ctx.db
      .query("guests")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .collect();
    return all.filter((g) => g.notificationStatus === "failed");
  },
});

export const recordSendInternal = internalMutation({
  args: {
    eventId: v.id("events"),
    type: v.union(
      v.literal("invitation"),
      v.literal("update"),
      v.literal("reminder"),
      v.literal("broadcast"),
    ),
    subject: v.string(),
    body: v.string(),
    recipientCount: v.number(),
    sentCount: v.number(),
    failedCount: v.number(),
    triggeredBy: v.union(v.literal("host"), v.literal("system")),
    sentGuestIds: v.array(v.id("guests")),
    failedGuestIds: v.array(v.id("guests")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const id of args.sentGuestIds) {
      const g = await ctx.db.get(id);
      if (!g || g.eventId !== args.eventId) continue;
      await ctx.db.patch(id, {
        notificationStatus: "sent",
        notificationSentAt: now,
        updatedAt: now,
      });
    }
    for (const id of args.failedGuestIds) {
      const g = await ctx.db.get(id);
      if (!g || g.eventId !== args.eventId) continue;
      await ctx.db.patch(id, {
        notificationStatus: "failed",
        notificationError: "Notification delivery failed",
        updatedAt: now,
      });
    }
    await ctx.db.insert("notifications", {
      eventId: args.eventId,
      type: args.type,
      subject: args.subject,
      body: args.body,
      recipientCount: args.recipientCount,
      sentCount: args.sentCount,
      failedCount: args.failedCount,
      triggeredBy: args.triggeredBy,
    });
  },
});

/** Public mutation: flip all "failed" guests for an event back to "pending"
 *  so a subsequent `notificationActions.send` retries them. Replaces the
 *  legacy `notifications.resendFailed` route. */
export const resetFailedToPending = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const user = await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
    if (!user) throw new Error("User record missing");
    const event = await ctx.db.get(eventId);
    if (!event || event.hostId !== user._id) {
      throw new Error("Event not found");
    }

    const all = await ctx.db
      .query("guests")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .collect();
    const failed = all.filter((g) => g.notificationStatus === "failed");
    const now = Date.now();
    for (const g of failed) {
      await ctx.db.patch(g._id, {
        notificationStatus: "pending",
        updatedAt: now,
      });
    }
    return { reset: failed.length };
  },
});
