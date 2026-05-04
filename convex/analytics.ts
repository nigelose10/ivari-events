/**
 * Portal analytics — view tracking + dashboard rollups.
 *
 * `recordPortalView` is public: the guest portal calls it on mount to log a
 * view. Visitor fingerprint comes from the client (the legacy router hashed
 * IP+UA server-side; in Convex we have no access to req headers from a
 * mutation, so the client computes a hash and passes it). If the client
 * doesn't pass a hash, the row goes in with `visitorHash: undefined` and the
 * unique-visitor count falls back to total views.
 *
 * `getPortalAnalytics` and `getPhotoUploadTimeline` are host-only — the
 * analytics dashboard reads from these.
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
// Public — guest portal page view tracker
// ───────────────────────────────────────────────────────────────────────────

export const recordPortalView = mutation({
  args: {
    slug: v.string(),
    page: v.optional(v.string()),
    referrer: v.optional(v.string()),
    visitorHash: v.optional(v.string()),
  },
  handler: async (ctx, { slug, page, referrer, visitorHash }) => {
    const event = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!event) return { tracked: false };

    await ctx.db.insert("portalViews", {
      eventId: event._id,
      visitorHash,
      page: page || "portal",
      referrer,
    });
    return { tracked: true };
  },
});

// ───────────────────────────────────────────────────────────────────────────
// Host — analytics rollups
// ───────────────────────────────────────────────────────────────────────────

export const getPortalAnalytics = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const user = await requireUser(ctx);
    await requireOwnedEvent(ctx, eventId, user._id);

    const allViews = await ctx.db
      .query("portalViews")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .collect();
    const totalViews = allViews.length;

    const uniqueHashes = new Set(
      allViews.map((v) => v.visitorHash).filter(Boolean) as string[],
    );
    const uniqueVisitors = uniqueHashes.size || totalViews;

    const dayMap = new Map<
      string,
      { views: number; hashes: Set<string> }
    >();
    for (const view of allViews) {
      const date = new Date(view._creationTime).toISOString().split("T")[0];
      if (!dayMap.has(date)) {
        dayMap.set(date, { views: 0, hashes: new Set() });
      }
      const entry = dayMap.get(date)!;
      entry.views++;
      if (view.visitorHash) entry.hashes.add(view.visitorHash);
    }

    const sortedDays = Array.from(dayMap.entries()).sort((a, b) =>
      a[0].localeCompare(b[0]),
    );
    const viewsByDay = sortedDays.map(([date, data]) => ({
      date,
      views: data.views,
      unique: data.hashes.size || data.views,
    }));

    const viewsByPage: Record<string, number> = {};
    for (const view of allViews) {
      const p = view.page || "portal";
      viewsByPage[p] = (viewsByPage[p] || 0) + 1;
    }

    return { totalViews, uniqueVisitors, viewsByDay, viewsByPage };
  },
});

export const getPhotoUploadTimeline = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const user = await requireUser(ctx);
    await requireOwnedEvent(ctx, eventId, user._id);

    const allPhotos = await ctx.db
      .query("photos")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .collect();
    const dayMap = new Map<string, number>();
    for (const photo of allPhotos) {
      const date = new Date(photo._creationTime).toISOString().split("T")[0];
      dayMap.set(date, (dayMap.get(date) || 0) + 1);
    }
    return Array.from(dayMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  },
});

/**
 * Combined dashboard view — equivalent of the legacy `analytics.getStats`
 * route. Returns portal stats, RSVP counts, photo timeline, conversion rate,
 * and guest-status breakdown in one round trip so the analytics page only
 * makes a single subscription.
 */
export const getStats = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const user = await requireUser(ctx);
    await requireOwnedEvent(ctx, eventId, user._id);

    const [allViews, rsvps, allPhotos, guests] = await Promise.all([
      ctx.db
        .query("portalViews")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .collect(),
      ctx.db
        .query("rsvps")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .collect(),
      ctx.db
        .query("photos")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .collect(),
      ctx.db
        .query("guests")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .collect(),
    ]);

    // Portal stats
    const totalViews = allViews.length;
    const uniqueHashes = new Set(
      allViews.map((v) => v.visitorHash).filter(Boolean) as string[],
    );
    const uniqueVisitors = uniqueHashes.size || totalViews;

    const dayMap = new Map<
      string,
      { views: number; hashes: Set<string> }
    >();
    for (const view of allViews) {
      const date = new Date(view._creationTime).toISOString().split("T")[0];
      if (!dayMap.has(date)) dayMap.set(date, { views: 0, hashes: new Set() });
      const entry = dayMap.get(date)!;
      entry.views++;
      if (view.visitorHash) entry.hashes.add(view.visitorHash);
    }
    const viewsByDay = Array.from(dayMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, d]) => ({
        date,
        views: d.views,
        unique: d.hashes.size || d.views,
      }));
    const viewsByPage: Record<string, number> = {};
    for (const view of allViews) {
      const p = view.page || "portal";
      viewsByPage[p] = (viewsByPage[p] || 0) + 1;
    }
    const portal = { totalViews, uniqueVisitors, viewsByDay, viewsByPage };

    // RSVP counts
    const rsvp = {
      attending: rsvps.filter((r) => r.status === "attending").length,
      declined: rsvps.filter((r) => r.status === "declined").length,
      maybe: rsvps.filter((r) => r.status === "maybe").length,
      total: rsvps.length,
    };

    // Photo timeline
    const photoDayMap = new Map<string, number>();
    for (const p of allPhotos) {
      const date = new Date(p._creationTime).toISOString().split("T")[0];
      photoDayMap.set(date, (photoDayMap.get(date) || 0) + 1);
    }
    const photoTimeline = Array.from(photoDayMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const conversionRate =
      portal.uniqueVisitors > 0
        ? Math.round((rsvp.total / portal.uniqueVisitors) * 100)
        : 0;

    return {
      portal,
      rsvp,
      photoTimeline,
      conversionRate,
      guestStats: {
        total: guests.length,
        sent: guests.filter((g) => g.notificationStatus === "sent").length,
        pending: guests.filter((g) => g.notificationStatus === "pending")
          .length,
        failed: guests.filter((g) => g.notificationStatus === "failed").length,
      },
    };
  },
});
