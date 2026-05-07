/**
 * Web Push — non-Node-runtime helpers (mutations + queries).
 *
 * The `web-push` library only runs in Node, so the action that actually
 * fires the notification lives in `push.ts` (with `"use node"`). Convex
 * doesn't allow mutations or queries inside a "use node" file, so they
 * live here in the V8 runtime.
 */
import { v } from "convex/values";
import { mutation, internalQuery, internalMutation } from "./_generated/server";

/**
 * Save (or refresh) a Web Push subscription for the current user.
 * Idempotent on `endpoint` — re-subscribing on the same device updates
 * the row instead of duplicating.
 */
export const subscribe = mutation({
  args: {
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    userAgent: v.optional(v.string()),
  },
  handler: async (ctx, { endpoint, p256dh, auth, userAgent }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const me = await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
    if (!me) throw new Error("User row missing — sign in again");

    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        userId: me._id,
        p256dh,
        auth,
        userAgent,
      });
      return { state: "refreshed" as const };
    }
    await ctx.db.insert("pushSubscriptions", {
      userId: me._id,
      endpoint,
      p256dh,
      auth,
      userAgent,
      createdAt: Date.now(),
    });
    return { state: "created" as const };
  },
});

/** Unsubscribe — called when the user revokes permission or signs out. */
export const unsubscribe = mutation({
  args: { endpoint: v.string() },
  handler: async (ctx, { endpoint }) => {
    const row = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))
      .unique();
    if (row) await ctx.db.delete(row._id);
    return { success: true };
  },
});

/** Internal — list all subscriptions for a user (used by `notifyUser`). */
export const subsForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return ctx.db
      .query("pushSubscriptions")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
  },
});

/** Internal — delete a stale subscription (404/410 from the push service). */
export const deleteSubByEndpoint = internalMutation({
  args: { endpoint: v.string() },
  handler: async (ctx, { endpoint }) => {
    const row = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))
      .unique();
    if (row) await ctx.db.delete(row._id);
  },
});
