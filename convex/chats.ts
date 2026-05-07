/**
 * Per-event group chats — host-managed multi-chat with role-based moderation.
 *
 * Auth model:
 * - Hosts authenticate via Stack Auth (ctx.auth.getUserIdentity()) and resolve
 *   to a `users` row by tokenIdentifier.
 * - Guests have no Stack Auth identity. Mutations/queries that guests can call
 *   accept a `guestToken` arg, the JWT signed by `guestTokens.signGuestToken`.
 *   Verification runs in an action (jose needs Node), so the public guest-
 *   facing entry points are actions that compose verify + internal query/mut.
 *
 * Permissions matrix lives in the design doc — enforced inline per mutation.
 *
 * IDOR: every member-scoped operation re-loads the chat and the member, then
 * verifies the chat belongs to the host's event (when host-side) or that the
 * guest token actually belongs to the chat in question.
 */
import { v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  internalQuery,
  action,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { getEventRole } from "./lib/permissions";

// Local alias so the inline call site reads naturally — see chats.listForEvent.
async function getEventRoleInline(ctx: QueryCtx, eventId: Id<"events">) {
  return getEventRole(ctx, eventId);
}

// ───────────────────────────────────────────────────────────────────────────
// Auth helpers
// ───────────────────────────────────────────────────────────────────────────

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

/** Re-load the chat AND the parent event, asserting the host owns it. */
async function requireOwnedChat(
  ctx: QueryCtx | MutationCtx,
  chatId: Id<"chats">,
  userId: Id<"users">,
): Promise<{ chat: Doc<"chats">; event: Doc<"events"> }> {
  const chat = await ctx.db.get(chatId);
  if (!chat) throw new Error("Chat not found");
  const event = await requireOwnedEvent(ctx, chat.eventId, userId);
  return { chat, event };
}

/** Find the caller's membership row in a chat (as a Stack Auth user). */
async function findUserMembership(
  ctx: QueryCtx | MutationCtx,
  chatId: Id<"chats">,
  userId: Id<"users">,
): Promise<Doc<"chatMembers"> | null> {
  return ctx.db
    .query("chatMembers")
    .withIndex("by_chat_user", (q) =>
      q.eq("chatId", chatId).eq("userId", userId),
    )
    .unique();
}

/** Find a guest's membership row in a chat (by guestId). */
async function findGuestMembership(
  ctx: QueryCtx | MutationCtx,
  chatId: Id<"chats">,
  guestId: Id<"guests">,
): Promise<Doc<"chatMembers"> | null> {
  return ctx.db
    .query("chatMembers")
    .withIndex("by_chat_guest", (q) =>
      q.eq("chatId", chatId).eq("guestId", guestId),
    )
    .unique();
}

// ───────────────────────────────────────────────────────────────────────────
// Queries — host-side
// ───────────────────────────────────────────────────────────────────────────

/**
 * List all chats for an event (host view). Returns each chat with member
 * count and last-message preview for the chat list rail.
 */
export const listForEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    // Anyone with a role on this event can see the chat list — host,
    // co-host, OR a signed-in user with a claimed guest row. Returns
    // the chat list scoped to what their role allows: hosts see all,
    // guests see only chats they're members of.
    const role = await getEventRoleInline(ctx, eventId);
    if (!role.role) {
      // No access. Returning [] (instead of throwing) keeps the page
      // calm — UI shows the empty state rather than a Convex error.
      return [];
    }

    let chats = await ctx.db
      .query("chats")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .collect();

    if (role.role === "guest") {
      // Filter to chats the guest is a member of (or "general" — every
      // attending guest is implicitly in general).
      const myMembership = await ctx.db
        .query("chatMembers")
        .withIndex("by_userId", (q) => q.eq("userId", role.user!._id))
        .collect();
      const memberOf = new Set(myMembership.map((m) => m.chatId));
      chats = chats.filter(
        (c) => c.type === "general" || memberOf.has(c._id),
      );
    }

    return Promise.all(
      chats.map(async (chat) => {
        const members = await ctx.db
          .query("chatMembers")
          .withIndex("by_chatId", (q) => q.eq("chatId", chat._id))
          .collect();
        const last = await ctx.db
          .query("messages")
          .withIndex("by_chatId", (q) => q.eq("chatId", chat._id))
          .order("desc")
          .first();
        return {
          ...chat,
          memberCount: members.length,
          lastMessage: last
            ? {
                _id: last._id,
                body: last.deletedAt ? "" : last.body,
                authorName: last.authorName,
                _creationTime: last._creationTime,
                deletedAt: last.deletedAt,
              }
            : null,
        };
      }),
    );
  },
});

/** Members of a chat. Auth: host OR a member of the chat (user-side). */
export const getMembers = query({
  args: { chatId: v.id("chats") },
  handler: async (ctx, { chatId }) => {
    const user = await requireUser(ctx);
    const chat = await ctx.db.get(chatId);
    if (!chat) throw new Error("Chat not found");
    const event = await ctx.db.get(chat.eventId);
    if (!event) throw new Error("Event not found");

    const isHost = event.hostId === user._id;
    if (!isHost) {
      // Caller must at least be a member.
      const me = await findUserMembership(ctx, chatId, user._id);
      if (!me) throw new Error("Not a member of this chat");
    }

    const rows = await ctx.db
      .query("chatMembers")
      .withIndex("by_chatId", (q) => q.eq("chatId", chatId))
      .collect();

    return Promise.all(
      rows.map(async (m) => {
        let displayName = "Unknown";
        let displayKind: "host" | "guest" = "guest";
        if (m.userId) {
          const u = await ctx.db.get(m.userId);
          displayName = u?.name || u?.email || "Host";
          displayKind = "host";
        } else if (m.guestId) {
          const g = await ctx.db.get(m.guestId);
          displayName = g?.name || "Guest";
        }
        return { ...m, displayName, displayKind };
      }),
    );
  },
});

/**
 * Reactive message list for a chat. Caller must be a member (user-side).
 * For guest callers, use `listMessagesAsGuest` action (verifies token).
 *
 * Pagination: pass `beforeMs` as a `_creationTime` cursor; we return the
 * page in oldest-first order (UI scrolls upward to load more).
 */
export const listMessages = query({
  args: {
    chatId: v.id("chats"),
    limit: v.optional(v.number()),
    beforeMs: v.optional(v.number()),
  },
  handler: async (ctx, { chatId, limit, beforeMs }) => {
    const user = await requireUser(ctx);
    const chat = await ctx.db.get(chatId);
    if (!chat) throw new Error("Chat not found");

    const event = await ctx.db.get(chat.eventId);
    if (!event) throw new Error("Event not found");

    const isHost = event.hostId === user._id;
    if (!isHost) {
      const me = await findUserMembership(ctx, chatId, user._id);
      if (!me) throw new Error("Not a member of this chat");
    }

    return readMessages(ctx, chatId, limit, beforeMs);
  },
});

async function readMessages(
  ctx: QueryCtx,
  chatId: Id<"chats">,
  limit?: number,
  beforeMs?: number,
) {
  const cap = Math.min(limit ?? 50, 200);
  let q = ctx.db
    .query("messages")
    .withIndex("by_chatId", (q) => q.eq("chatId", chatId))
    .order("desc");
  const all = await q.collect();
  const filtered = beforeMs
    ? all.filter((m) => m._creationTime < beforeMs)
    : all;
  const slice = filtered.slice(0, cap);
  // Resolve attachment URLs lazily.
  const withUrls = await Promise.all(
    slice.map(async (m) => {
      let attachmentUrl: string | null = null;
      if (m.attachmentStorageId) {
        attachmentUrl = await ctx.storage.getUrl(m.attachmentStorageId);
      }
      return { ...m, attachmentUrl };
    }),
  );
  // Return oldest-first (UI appends new at bottom).
  return withUrls.reverse();
}

// ───────────────────────────────────────────────────────────────────────────
// Guest-side queries (token-gated, via internal queries + actions)
// ───────────────────────────────────────────────────────────────────────────

/** Internal: same logic as listForEvent but for a verified guestId. */
export const listForGuestInternal = internalQuery({
  args: { eventId: v.id("events"), guestId: v.id("guests") },
  handler: async (ctx, { eventId, guestId }) => {
    const guest = await ctx.db.get(guestId);
    if (!guest || guest.eventId !== eventId) {
      throw new Error("Guest not on this event");
    }

    const memberships = await ctx.db
      .query("chatMembers")
      .withIndex("by_guestId", (q) => q.eq("guestId", guestId))
      .collect();

    const chats = await Promise.all(
      memberships.map(async (m) => {
        const chat = await ctx.db.get(m.chatId);
        if (!chat || chat.archived || chat.eventId !== eventId) return null;
        const last = await ctx.db
          .query("messages")
          .withIndex("by_chatId", (q) => q.eq("chatId", chat._id))
          .order("desc")
          .first();
        return {
          ...chat,
          myRole: m.role,
          myMembershipId: m._id,
          lastMessage: last
            ? {
                _id: last._id,
                body: last.deletedAt ? "" : last.body,
                authorName: last.authorName,
                _creationTime: last._creationTime,
                deletedAt: last.deletedAt,
              }
            : null,
        };
      }),
    );
    return chats.filter((c): c is NonNullable<typeof c> => Boolean(c));
  },
});

/** Public action: list chats a guest belongs to. Verifies token first. */
export const listForGuest = action({
  args: { eventId: v.id("events"), guestToken: v.string() },
  handler: async (ctx, { eventId, guestToken }): Promise<unknown> => {
    const payload = await ctx.runAction(
      internal.guestTokens.verifyGuestTokenInternal,
      { token: guestToken },
    );
    if (!payload.guestId) throw new Error("Token is not guest-bound");
    if (payload.eventId !== eventId) {
      throw new Error("Token does not match event");
    }
    return ctx.runQuery(internal.chats.listForGuestInternal, {
      eventId,
      guestId: payload.guestId as Id<"guests">,
    });
  },
});

/** Internal: read messages for a guest who's a verified member of chatId. */
export const listMessagesAsGuestInternal = internalQuery({
  args: {
    chatId: v.id("chats"),
    guestId: v.id("guests"),
    limit: v.optional(v.number()),
    beforeMs: v.optional(v.number()),
  },
  handler: async (ctx, { chatId, guestId, limit, beforeMs }) => {
    const me = await findGuestMembership(ctx, chatId, guestId);
    if (!me) throw new Error("Not a member of this chat");
    return readMessages(ctx, chatId, limit, beforeMs);
  },
});

export const listMessagesAsGuest = action({
  args: {
    chatId: v.id("chats"),
    guestToken: v.string(),
    limit: v.optional(v.number()),
    beforeMs: v.optional(v.number()),
  },
  handler: async (
    ctx,
    { chatId, guestToken, limit, beforeMs },
  ): Promise<unknown> => {
    const payload = await ctx.runAction(
      internal.guestTokens.verifyGuestTokenInternal,
      { token: guestToken },
    );
    if (!payload.guestId) throw new Error("Token is not guest-bound");
    return ctx.runQuery(internal.chats.listMessagesAsGuestInternal, {
      chatId,
      guestId: payload.guestId as Id<"guests">,
      limit,
      beforeMs,
    });
  },
});

// ───────────────────────────────────────────────────────────────────────────
// Mutations — host-side chat management
// ───────────────────────────────────────────────────────────────────────────

/**
 * Create a chat. Type drives initial membership:
 *   - "general": every guest on the event becomes a member
 *   - "admin":   only the creator (extended later via addMember)
 *   - "custom":  the supplied memberGuestIds + memberUserIds
 *
 * Creator is always added as `owner`.
 */
export const createChat = mutation({
  args: {
    eventId: v.id("events"),
    name: v.string(),
    type: v.union(
      v.literal("general"),
      v.literal("admin"),
      v.literal("custom"),
    ),
    memberGuestIds: v.optional(v.array(v.id("guests"))),
    memberUserIds: v.optional(v.array(v.id("users"))),
  },
  handler: async (
    ctx,
    { eventId, name, type, memberGuestIds, memberUserIds },
  ) => {
    const user = await requireUser(ctx);
    await requireOwnedEvent(ctx, eventId, user._id);

    const trimmed = name.trim();
    if (trimmed.length < 1 || trimmed.length > 80) {
      throw new Error("Chat name must be 1-80 characters");
    }

    const now = Date.now();
    const chatId = await ctx.db.insert("chats", {
      eventId,
      name: trimmed,
      type,
      createdBy: user._id,
      archived: false,
    });

    // Owner row for creator.
    await ctx.db.insert("chatMembers", {
      chatId,
      userId: user._id,
      role: "owner",
      joinedAt: now,
    });

    if (type === "general") {
      // Auto-include every guest on the event.
      const guests = await ctx.db
        .query("guests")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .collect();
      for (const g of guests) {
        await ctx.db.insert("chatMembers", {
          chatId,
          guestId: g._id,
          role: "member",
          joinedAt: now,
        });
      }
    } else if (type === "custom") {
      const seenGuests = new Set<string>();
      for (const gid of memberGuestIds ?? []) {
        if (seenGuests.has(gid)) continue;
        const g = await ctx.db.get(gid);
        if (!g || g.eventId !== eventId) continue; // IDOR guard
        seenGuests.add(gid);
        await ctx.db.insert("chatMembers", {
          chatId,
          guestId: gid,
          role: "member",
          joinedAt: now,
        });
      }
      const seenUsers = new Set<string>();
      seenUsers.add(user._id);
      for (const uid of memberUserIds ?? []) {
        if (seenUsers.has(uid)) continue;
        const u = await ctx.db.get(uid);
        if (!u) continue;
        seenUsers.add(uid);
        await ctx.db.insert("chatMembers", {
          chatId,
          userId: uid,
          role: "member",
          joinedAt: now,
        });
      }
    }
    // type === "admin": only creator added (host can extend via addMember).

    return { _id: chatId };
  },
});

/** Add a member. Owner OR admin can call. */
export const addMember = mutation({
  args: {
    chatId: v.id("chats"),
    userId: v.optional(v.id("users")),
    guestId: v.optional(v.id("guests")),
    role: v.optional(
      v.union(
        v.literal("admin"),
        v.literal("member"),
        v.literal("muted"),
      ),
    ),
  },
  handler: async (ctx, { chatId, userId, guestId, role }) => {
    if (!userId && !guestId) {
      throw new Error("Either userId or guestId is required");
    }
    if (userId && guestId) {
      throw new Error("Provide userId OR guestId, not both");
    }

    const me = await requireUser(ctx);
    const { chat, event } = await requireOwnedChat(ctx, chatId, me._id);
    // requireOwnedChat already asserts the host owns the event; that gives
    // implicit "owner" rights regardless of membership row presence. But we
    // must also allow non-host admins. If the caller is not the host, fall
    // back to checking their membership role.
    const isHost = event.hostId === me._id;
    if (!isHost) {
      const myMembership = await findUserMembership(ctx, chatId, me._id);
      if (!myMembership || (myMembership.role !== "owner" && myMembership.role !== "admin")) {
        throw new Error("Only owners and admins can add members");
      }
    }

    if (userId) {
      const existing = await findUserMembership(ctx, chatId, userId);
      if (existing) throw new Error("User is already a member");
      const u = await ctx.db.get(userId);
      if (!u) throw new Error("User not found");
    } else if (guestId) {
      const g = await ctx.db.get(guestId);
      if (!g || g.eventId !== chat.eventId) {
        throw new Error("Guest is not on this event");
      }
      const existing = await findGuestMembership(ctx, chatId, guestId);
      if (existing) throw new Error("Guest is already a member");
    }

    const now = Date.now();
    const memberId = await ctx.db.insert("chatMembers", {
      chatId,
      userId,
      guestId,
      role: role ?? "member",
      joinedAt: now,
    });
    return { _id: memberId };
  },
});

/** Remove a member. Owner/admin only. Cannot remove the owner. */
export const removeMember = mutation({
  args: {
    chatId: v.id("chats"),
    memberId: v.id("chatMembers"),
  },
  handler: async (ctx, { chatId, memberId }) => {
    const me = await requireUser(ctx);
    const { event } = await requireOwnedChat(ctx, chatId, me._id);

    const isHost = event.hostId === me._id;
    if (!isHost) {
      const myMembership = await findUserMembership(ctx, chatId, me._id);
      if (
        !myMembership ||
        (myMembership.role !== "owner" && myMembership.role !== "admin")
      ) {
        throw new Error("Only owners and admins can remove members");
      }
    }

    const target = await ctx.db.get(memberId);
    if (!target || target.chatId !== chatId) {
      throw new Error("Member not in this chat");
    }
    if (target.role === "owner") {
      throw new Error("Cannot remove the owner");
    }
    await ctx.db.delete(memberId);
    return { success: true };
  },
});

/**
 * Change a member's role. **Owner only** — per spec, only the main admin
 * (event host) can promote/demote. Owner cannot be demoted; their seat is
 * the seat that delegates everything else.
 */
export const changeMemberRole = mutation({
  args: {
    chatId: v.id("chats"),
    memberId: v.id("chatMembers"),
    role: v.union(
      v.literal("admin"),
      v.literal("member"),
      v.literal("muted"),
    ),
  },
  handler: async (ctx, { chatId, memberId, role }) => {
    const me = await requireUser(ctx);
    const { event } = await requireOwnedChat(ctx, chatId, me._id);

    // Host == owner of every chat they created. Non-host members never get
    // role-change rights, even if they're labelled "owner" on a chat (that
    // shouldn't happen in practice — owner is always the creator/host).
    if (event.hostId !== me._id) {
      throw new Error("Only the event host can change roles");
    }

    const target = await ctx.db.get(memberId);
    if (!target || target.chatId !== chatId) {
      throw new Error("Member not in this chat");
    }
    if (target.role === "owner") {
      throw new Error("Cannot change the owner's role");
    }
    await ctx.db.patch(memberId, { role });
    return { success: true };
  },
});

/** Archive a chat. Owner (host) only. Soft-hide; messages remain. */
export const archiveChat = mutation({
  args: { chatId: v.id("chats") },
  handler: async (ctx, { chatId }) => {
    const me = await requireUser(ctx);
    const { event } = await requireOwnedChat(ctx, chatId, me._id);
    if (event.hostId !== me._id) {
      throw new Error("Only the event host can archive a chat");
    }
    await ctx.db.patch(chatId, { archived: true });
    return { success: true };
  },
});

// ───────────────────────────────────────────────────────────────────────────
// Mutations — messaging (host + guest paths)
// ───────────────────────────────────────────────────────────────────────────

const POST_MESSAGE_BODY_MAX = 4000;

/** Post a message as a host (Stack Auth). */
export const postMessage = mutation({
  args: {
    chatId: v.id("chats"),
    body: v.string(),
    attachmentStorageId: v.optional(v.id("_storage")),
    replyToMessageId: v.optional(v.id("messages")),
  },
  handler: async (
    ctx,
    { chatId, body, attachmentStorageId, replyToMessageId },
  ) => {
    const me = await requireUser(ctx);
    const chat = await ctx.db.get(chatId);
    if (!chat || chat.archived) throw new Error("Chat not available");
    const event = await ctx.db.get(chat.eventId);
    if (!event) throw new Error("Event not found");

    const isHost = event.hostId === me._id;
    let myMembership = await findUserMembership(ctx, chatId, me._id);
    if (!myMembership && !isHost) {
      throw new Error("Not a member of this chat");
    }
    if (myMembership?.role === "muted") {
      throw new Error("You are muted in this chat");
    }

    return insertMessage(ctx, {
      chatId,
      authorUserId: me._id,
      authorName: me.name || me.email || "Host",
      body,
      attachmentStorageId,
      replyToMessageId,
    });
  },
});

/** Internal: same insert logic, used by guest path after token verification. */
export const postMessageAsGuestInternal = internalMutation({
  args: {
    chatId: v.id("chats"),
    guestId: v.id("guests"),
    body: v.string(),
    attachmentStorageId: v.optional(v.id("_storage")),
    replyToMessageId: v.optional(v.id("messages")),
  },
  handler: async (
    ctx,
    { chatId, guestId, body, attachmentStorageId, replyToMessageId },
  ) => {
    const chat = await ctx.db.get(chatId);
    if (!chat || chat.archived) throw new Error("Chat not available");

    const me = await findGuestMembership(ctx, chatId, guestId);
    if (!me) throw new Error("Not a member of this chat");
    if (me.role === "muted") throw new Error("You are muted in this chat");

    const guest = await ctx.db.get(guestId);
    if (!guest || guest.eventId !== chat.eventId) {
      throw new Error("Guest not on this event");
    }

    return insertMessage(ctx, {
      chatId,
      authorGuestId: guestId,
      authorName: guest.name || "Guest",
      body,
      attachmentStorageId,
      replyToMessageId,
    });
  },
});

/** Public action: verify guest token, then post. */
export const postMessageAsGuest = action({
  args: {
    chatId: v.id("chats"),
    guestToken: v.string(),
    body: v.string(),
    attachmentStorageId: v.optional(v.id("_storage")),
    replyToMessageId: v.optional(v.id("messages")),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const payload = await ctx.runAction(
      internal.guestTokens.verifyGuestTokenInternal,
      { token: args.guestToken },
    );
    if (!payload.guestId) throw new Error("Token is not guest-bound");
    return ctx.runMutation(internal.chats.postMessageAsGuestInternal, {
      chatId: args.chatId,
      guestId: payload.guestId as Id<"guests">,
      body: args.body,
      attachmentStorageId: args.attachmentStorageId,
      replyToMessageId: args.replyToMessageId,
    });
  },
});

async function insertMessage(
  ctx: MutationCtx,
  args: {
    chatId: Id<"chats">;
    authorUserId?: Id<"users">;
    authorGuestId?: Id<"guests">;
    authorName: string;
    body: string;
    attachmentStorageId?: Id<"_storage">;
    replyToMessageId?: Id<"messages">;
  },
) {
  const trimmed = args.body.trim();
  if (trimmed.length === 0 && !args.attachmentStorageId) {
    throw new Error("Message must have a body or an attachment");
  }
  if (trimmed.length > POST_MESSAGE_BODY_MAX) {
    throw new Error(`Message too long (max ${POST_MESSAGE_BODY_MAX})`);
  }

  if (args.replyToMessageId) {
    const reply = await ctx.db.get(args.replyToMessageId);
    if (!reply || reply.chatId !== args.chatId) {
      throw new Error("Reply target not in this chat");
    }
  }

  const id = await ctx.db.insert("messages", {
    chatId: args.chatId,
    authorUserId: args.authorUserId,
    authorGuestId: args.authorGuestId,
    authorName: args.authorName,
    body: trimmed,
    attachmentStorageId: args.attachmentStorageId,
    replyToMessageId: args.replyToMessageId,
  });
  return { _id: id };
}

/** Edit a message. Author only. */
export const editMessage = mutation({
  args: { messageId: v.id("messages"), body: v.string() },
  handler: async (ctx, { messageId, body }) => {
    const me = await requireUser(ctx);
    const msg = await ctx.db.get(messageId);
    if (!msg) throw new Error("Message not found");
    if (msg.deletedAt) throw new Error("Cannot edit a deleted message");
    if (msg.authorUserId !== me._id) {
      throw new Error("Only the author can edit");
    }
    const trimmed = body.trim();
    if (trimmed.length === 0) throw new Error("Body required");
    if (trimmed.length > POST_MESSAGE_BODY_MAX) {
      throw new Error(`Message too long (max ${POST_MESSAGE_BODY_MAX})`);
    }
    await ctx.db.patch(messageId, { body: trimmed, editedAt: Date.now() });
    return { success: true };
  },
});

/**
 * Delete (soft) a message. Author OR a chat owner/admin.
 * The host on the event acts as owner whether or not they have a
 * membership row (e.g. on a chat they created with type=admin).
 */
export const deleteMessage = mutation({
  args: { messageId: v.id("messages") },
  handler: async (ctx, { messageId }) => {
    const me = await requireUser(ctx);
    const msg = await ctx.db.get(messageId);
    if (!msg) throw new Error("Message not found");
    if (msg.deletedAt) return { success: true };

    const chat = await ctx.db.get(msg.chatId);
    if (!chat) throw new Error("Chat not found");
    const event = await ctx.db.get(chat.eventId);
    if (!event) throw new Error("Event not found");

    const isAuthor = msg.authorUserId === me._id;
    const isHost = event.hostId === me._id;
    let canModerate = isHost;
    if (!isHost) {
      const myMembership = await findUserMembership(ctx, msg.chatId, me._id);
      if (
        myMembership &&
        (myMembership.role === "owner" || myMembership.role === "admin")
      ) {
        canModerate = true;
      }
    }

    if (!isAuthor && !canModerate) {
      throw new Error("Not allowed to delete this message");
    }

    await ctx.db.patch(messageId, { deletedAt: Date.now() });
    return { success: true };
  },
});

/** Mark the chat read for the calling user. Updates `lastReadAt`. */
export const markRead = mutation({
  args: { chatId: v.id("chats") },
  handler: async (ctx, { chatId }) => {
    const me = await requireUser(ctx);
    const myMembership = await findUserMembership(ctx, chatId, me._id);
    if (!myMembership) {
      // Host without an explicit row — nothing to mark.
      return { success: true };
    }
    await ctx.db.patch(myMembership._id, { lastReadAt: Date.now() });
    return { success: true };
  },
});

/** Internal mark-read for guests. */
export const markReadAsGuestInternal = internalMutation({
  args: { chatId: v.id("chats"), guestId: v.id("guests") },
  handler: async (ctx, { chatId, guestId }) => {
    const me = await findGuestMembership(ctx, chatId, guestId);
    if (!me) return { success: true };
    await ctx.db.patch(me._id, { lastReadAt: Date.now() });
    return { success: true };
  },
});

export const markReadAsGuest = action({
  args: { chatId: v.id("chats"), guestToken: v.string() },
  handler: async (ctx, { chatId, guestToken }): Promise<unknown> => {
    const payload = await ctx.runAction(
      internal.guestTokens.verifyGuestTokenInternal,
      { token: guestToken },
    );
    if (!payload.guestId) throw new Error("Token is not guest-bound");
    return ctx.runMutation(internal.chats.markReadAsGuestInternal, {
      chatId,
      guestId: payload.guestId as Id<"guests">,
    });
  },
});

// ───────────────────────────────────────────────────────────────────────────
// Attachment upload — composer photo button piggybacks on Convex storage.
// Caller must already be a member; we don't gate the URL itself but the
// follow-up postMessage call will reject non-members, so the upload is
// effectively useless without membership.
// ───────────────────────────────────────────────────────────────────────────

export const generateAttachmentUploadUrl = mutation({
  args: { chatId: v.id("chats") },
  handler: async (ctx, { chatId }) => {
    const me = await requireUser(ctx);
    const chat = await ctx.db.get(chatId);
    if (!chat) throw new Error("Chat not found");
    const event = await ctx.db.get(chat.eventId);
    if (!event) throw new Error("Event not found");
    const isHost = event.hostId === me._id;
    if (!isHost) {
      const myMembership = await findUserMembership(ctx, chatId, me._id);
      if (!myMembership) throw new Error("Not a member of this chat");
      if (myMembership.role === "muted") {
        throw new Error("You are muted in this chat");
      }
    }
    return ctx.storage.generateUploadUrl();
  },
});
