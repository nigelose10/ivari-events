/**
 * Notification actions — Node-only HTTP fan-out.
 *
 * Convex actions can do `fetch()` and call into mutations/queries. Lives in a
 * separate `"use node"` file because the matching queries/mutations need the
 * V8 runtime; co-locating them would make the whole file Node-only.
 *
 * Side-effects ported from the legacy router:
 *   - notifications.sendBlast → `send`
 *   - events.changeStatus auto-blast on draft→active → `autoSendOnActivate`
 *     (split out so it's an opt-in client-side chain after `events.transitionStatus`)
 *   - events.changeStatus cancellation log on →cancelled → `recordCancellation`
 *
 * The `notifyOwner` helper is inlined here (port of `server/_core/notification.ts`)
 * so we don't carry the legacy file's @trpc/server dep.
 */
"use node";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

async function notifyOwnerHttp(payload: {
  title: string;
  content: string;
}): Promise<boolean> {
  const baseUrl = process.env.BUILT_IN_FORGE_API_URL;
  const apiKey = process.env.BUILT_IN_FORGE_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error(
      "Notification service env not configured (BUILT_IN_FORGE_API_URL / BUILT_IN_FORGE_API_KEY)",
    );
  }
  const normalized = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const endpoint = new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalized,
  ).toString();
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1",
      },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Send invitation/broadcast notifications to all pending+failed guests for
 * an event. Returns sent/failed counts. Equivalent to legacy
 * `notifications.sendBlast`.
 */
export const send = action({
  args: {
    eventId: v.id("events"),
    origin: v.string(),
    customMessage: v.optional(v.string()),
    type: v.optional(
      v.union(
        v.literal("invitation"),
        v.literal("update"),
        v.literal("reminder"),
        v.literal("broadcast"),
      ),
    ),
  },
  handler: async (
    ctx,
    { eventId, origin, customMessage, type },
  ): Promise<{ sent: number; failed: number; total: number }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const event = await ctx.runQuery(
      internal.notifications.getEventForOwnerCheck,
      { eventId, tokenIdentifier: identity.tokenIdentifier },
    );
    if (!event) throw new Error("Event not found");

    const pending = await ctx.runQuery(
      internal.notifications.getPendingGuestsForBlast,
      { eventId },
    );
    if (pending.length === 0) {
      throw new Error("No pending guests to notify");
    }

    const notificationType = type || "invitation";
    const sentIds: Id<"guests">[] = [];
    const failedIds: Id<"guests">[] = [];

    for (const guest of pending) {
      const portalUrl = `${origin}/portal/${event.slug}?token=${guest.portalToken ?? ""}`;
      const ok = await notifyOwnerHttp({
        title: `Invitation sent to ${guest.name}`,
        content: `Guest: ${guest.name}\nEmail: ${guest.email || "N/A"}\nPhone: ${guest.phone || "N/A"}\nPortal: ${portalUrl}`,
      });
      if (ok) sentIds.push(guest._id);
      else failedIds.push(guest._id);
    }

    await ctx.runMutation(internal.notifications.recordSendInternal, {
      eventId,
      type: notificationType,
      subject: `${notificationType === "invitation" ? "Invitation" : "Broadcast"} for ${event.title}`,
      body: customMessage || `Invitation to ${event.title}`,
      recipientCount: pending.length,
      sentCount: sentIds.length,
      failedCount: failedIds.length,
      triggeredBy: "host",
      sentGuestIds: sentIds,
      failedGuestIds: failedIds,
    });

    return {
      sent: sentIds.length,
      failed: failedIds.length,
      total: pending.length,
    };
  },
});

/**
 * Auto-blast invitations after a draft→active transition. Same wire as
 * `send` but the recorded notification reads "auto-sent" and
 * `triggeredBy: "system"`. Call from the client after a successful
 * `events.transitionStatus` to "active". Behavior matches the legacy
 * `events.changeStatus` side-effect.
 */
export const autoSendOnActivate = action({
  args: {
    eventId: v.id("events"),
    origin: v.string(),
  },
  handler: async (
    ctx,
    { eventId, origin },
  ): Promise<{ sent: number; failed: number; total: number }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const event = await ctx.runQuery(
      internal.notifications.getEventForOwnerCheck,
      { eventId, tokenIdentifier: identity.tokenIdentifier },
    );
    if (!event) throw new Error("Event not found");

    const pending = await ctx.runQuery(
      internal.notifications.getPendingGuestsForBlast,
      { eventId },
    );
    if (pending.length === 0) {
      return { sent: 0, failed: 0, total: 0 };
    }

    const sentIds: Id<"guests">[] = [];
    const failedIds: Id<"guests">[] = [];

    for (const guest of pending) {
      const portalUrl = `${origin}/portal/${event.slug}?token=${guest.portalToken ?? ""}`;
      const ok = await notifyOwnerHttp({
        title: `Invitation auto-sent to ${guest.name}`,
        content: `Event "${event.title}" is now ACTIVE.\nGuest: ${guest.name}\nPortal: ${portalUrl}`,
      });
      if (ok) sentIds.push(guest._id);
      else failedIds.push(guest._id);
    }

    await ctx.runMutation(internal.notifications.recordSendInternal, {
      eventId,
      type: "invitation",
      subject: `Auto-invitations for ${event.title}`,
      body: `Event activated — ${sentIds.length} invitations sent, ${failedIds.length} failed`,
      recipientCount: pending.length,
      sentCount: sentIds.length,
      failedCount: failedIds.length,
      triggeredBy: "system",
      sentGuestIds: sentIds,
      failedGuestIds: failedIds,
    });

    return {
      sent: sentIds.length,
      failed: failedIds.length,
      total: pending.length,
    };
  },
});

/**
 * Cancellation broadcast — fire after `events.transitionStatus` to
 * "cancelled". Logs an owner notification + a system-triggered notification row.
 */
export const recordCancellation = action({
  args: { eventId: v.id("events") },
  handler: async (
    ctx,
    { eventId },
  ): Promise<{ recorded: boolean; guestsAffected: number }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const event = await ctx.runQuery(
      internal.notifications.getEventForOwnerCheck,
      { eventId, tokenIdentifier: identity.tokenIdentifier },
    );
    if (!event) throw new Error("Event not found");

    const pending = await ctx.runQuery(
      internal.notifications.getPendingGuestsForBlast,
      { eventId },
    );

    await notifyOwnerHttp({
      title: `Event "${event.title}" cancelled`,
      content: `${pending.length} guests were on the list. The guest portal is now closed.`,
    });

    await ctx.runMutation(internal.notifications.recordSendInternal, {
      eventId,
      type: "update",
      subject: `Event "${event.title}" cancelled`,
      body: `Event cancelled by host. ${pending.length} guests affected.`,
      recipientCount: pending.length,
      sentCount: pending.length,
      failedCount: 0,
      triggeredBy: "system",
      sentGuestIds: [],
      failedGuestIds: [],
    });

    return { recorded: true, guestsAffected: pending.length };
  },
});
