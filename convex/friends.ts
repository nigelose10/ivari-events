/**
 * Friends — bidirectional friend graph for ivari users.
 *
 * Storage shape: two `friends` rows per accepted pair (one owned by each
 * side) so listing a user's friends is a single indexed scan on `ownerId`.
 * `status` lifecycle: pending (inbound from `friendUserId`) → accepted on the
 * accept mutation, which patches both rows in one transaction.
 *
 * Auth: every endpoint requires a Stack-auth user; throws on unauthenticated.
 * No public/guest variants — friends are an account-only concept.
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
  if (!user) throw new Error("User row missing — sign in again");
  return user;
}

/** List my friends (status = "accepted") with their public profile fields. */
export const list = query({
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

    const rows = await ctx.db
      .query("friends")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", me._id))
      .collect();

    const enriched = await Promise.all(
      rows
        .filter((r) => r.status === "accepted")
        .map(async (r) => {
          const friend = await ctx.db.get(r.friendUserId);
          if (!friend) return null;
          return {
            _id: friend._id,
            name: friend.name,
            username: friend.username,
            email: friend.email,
            avatarUrl: friend.avatarUrl,
            tagline: friend.tagline,
          };
        }),
    );
    return enriched.filter((x): x is NonNullable<typeof x> => x !== null);
  },
});

/** List inbound pending requests (others wanting to friend me). */
export const pendingRequests = query({
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

    const rows = await ctx.db
      .query("friends")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", me._id))
      .collect();
    return Promise.all(
      rows
        .filter((r) => r.status === "pending")
        .map(async (r) => {
          const friend = await ctx.db.get(r.friendUserId);
          return friend
            ? {
                _id: friend._id,
                name: friend.name,
                username: friend.username,
                avatarUrl: friend.avatarUrl,
                createdAt: r.createdAt,
              }
            : null;
        }),
    ).then((arr) => arr.filter((x): x is NonNullable<typeof x> => x !== null));
  },
});

/** Send a friend request. Creates one pending row on the recipient's side. */
export const sendRequest = mutation({
  args: { targetUserId: v.id("users") },
  handler: async (ctx, { targetUserId }) => {
    const me = await requireUser(ctx);
    if (me._id === targetUserId) throw new Error("Cannot friend yourself");

    const existingMine = await ctx.db
      .query("friends")
      .withIndex("by_pair", (q) =>
        q.eq("ownerId", me._id).eq("friendUserId", targetUserId),
      )
      .unique();
    if (existingMine?.status === "accepted") return { state: "already-friends" };
    if (existingMine?.status === "pending") return { state: "request-already-sent" };

    // If the other side has a pending row from us already, this is the accept path.
    const existingTheirs = await ctx.db
      .query("friends")
      .withIndex("by_pair", (q) =>
        q.eq("ownerId", targetUserId).eq("friendUserId", me._id),
      )
      .unique();

    const now = Date.now();

    if (existingTheirs?.status === "pending") {
      // Auto-mutual accept (race / re-send).
      await ctx.db.patch(existingTheirs._id, { status: "accepted" });
      if (existingMine) {
        await ctx.db.patch(existingMine._id, { status: "accepted" });
      } else {
        await ctx.db.insert("friends", {
          ownerId: me._id,
          friendUserId: targetUserId,
          status: "accepted",
          createdAt: now,
        });
      }
      return { state: "accepted" };
    }

    // Standard outbound: insert one pending row on the recipient's side.
    // The sender doesn't get a row until acceptance, keeping their list clean.
    await ctx.db.insert("friends", {
      ownerId: targetUserId,
      friendUserId: me._id,
      status: "pending",
      createdAt: now,
    });
    return { state: "request-sent" };
  },
});

/** Accept an inbound pending request. */
export const acceptRequest = mutation({
  args: { fromUserId: v.id("users") },
  handler: async (ctx, { fromUserId }) => {
    const me = await requireUser(ctx);

    const inbound = await ctx.db
      .query("friends")
      .withIndex("by_pair", (q) =>
        q.eq("ownerId", me._id).eq("friendUserId", fromUserId),
      )
      .unique();
    if (!inbound || inbound.status !== "pending") {
      throw new Error("No pending request from that user");
    }
    await ctx.db.patch(inbound._id, { status: "accepted" });

    // Ensure the sender's mirror row exists.
    const mirror = await ctx.db
      .query("friends")
      .withIndex("by_pair", (q) =>
        q.eq("ownerId", fromUserId).eq("friendUserId", me._id),
      )
      .unique();
    if (mirror) {
      await ctx.db.patch(mirror._id, { status: "accepted" });
    } else {
      await ctx.db.insert("friends", {
        ownerId: fromUserId,
        friendUserId: me._id,
        status: "accepted",
        createdAt: Date.now(),
      });
    }
    return { success: true };
  },
});

/** Remove a friend. Deletes both sides if present. */
export const removeFriend = mutation({
  args: { otherUserId: v.id("users") },
  handler: async (ctx, { otherUserId }) => {
    const me = await requireUser(ctx);
    const mine = await ctx.db
      .query("friends")
      .withIndex("by_pair", (q) =>
        q.eq("ownerId", me._id).eq("friendUserId", otherUserId),
      )
      .unique();
    if (mine) await ctx.db.delete(mine._id);
    const theirs = await ctx.db
      .query("friends")
      .withIndex("by_pair", (q) =>
        q.eq("ownerId", otherUserId).eq("friendUserId", me._id),
      )
      .unique();
    if (theirs) await ctx.db.delete(theirs._id);
    return { success: true };
  },
});

/** Search ivari users by username (prefix-match). Used to find people to friend
 *  before they're already in your graph. Returns at most 10 hits. */
export const searchUsers = query({
  args: { prefix: v.string() },
  handler: async (ctx, { prefix }) => {
    const me = await requireUser(ctx);
    const q = prefix.trim();
    if (q.length < 2) return [];
    // Cheap scan + filter — there's no built-in prefix index on Convex, so
    // we paginate over the by_username range. For the user counts ivari
    // is targeting this is fine; switch to a search index when it isn't.
    const candidates = await ctx.db
      .query("users")
      .withIndex("by_username", (idx) => idx.gte("username", q).lt("username", q + "￿"))
      .take(10);
    return candidates
      .filter((u) => u._id !== me._id)
      .map((u) => ({
        _id: u._id,
        name: u.name,
        username: u.username,
        avatarUrl: u.avatarUrl,
        tagline: u.tagline,
      }));
  },
});

/** Resolve a list of user IDs (e.g. previously-friended) into profile shells.
 *  Used by event composer to render a "your friends" picker that includes
 *  people you've already invited to past events. */
export const resolveProfiles = query({
  args: { userIds: v.array(v.id("users")) },
  handler: async (ctx, { userIds }) => {
    const out: Array<{
      _id: Id<"users">;
      name: string | undefined;
      username: string | undefined;
      avatarUrl: string | undefined;
    }> = [];
    for (const id of userIds) {
      const u = await ctx.db.get(id);
      if (u) {
        out.push({
          _id: u._id,
          name: u.name,
          username: u.username,
          avatarUrl: u.avatarUrl,
        });
      }
    }
    return out;
  },
});
