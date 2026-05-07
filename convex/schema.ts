import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Convex schema for IVARI events app.
 *
 * Ported from drizzle/schema.ts. Conventions:
 * - Convex auto-provides `_id` and `_creationTime`, so the manual `id` and
 *   `createdAt` columns from Drizzle are dropped.
 * - Drizzle `updatedAt` (timestamp w/ onUpdateNow) becomes `v.number()` (ms);
 *   mutations must set this manually.
 * - Foreign keys (`eventId`, `hostId`, `rsvpId`) are typed via `v.id(...)`.
 * - `mysqlEnum(["0","1"])` boolean-like columns are kept as string literal
 *   unions to preserve parity with existing data exports.
 * - `json` columns (`surveyConfig`, `surveyResponses`) use `v.any()` because
 *   their structure is intentionally flexible per-event/per-response.
 * - `users.openId` (Stack Auth JWT subject) is renamed to `tokenIdentifier`
 *   to match Stack Auth conventions; a by-tokenIdentifier index replaces the
 *   MySQL unique constraint.
 */
export default defineSchema({
  // ───────────────────────────────────────────────────────────────────────
  // users — backs the auth flow; populated from Stack Auth JWT subject.
  // ───────────────────────────────────────────────────────────────────────
  users: defineTable({
    tokenIdentifier: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    loginMethod: v.optional(v.string()),
    role: v.union(v.literal("user"), v.literal("admin")),
    /** Public handle shown on Memory Wall posts and friend search.
     *  Distinct from `name` (legal/display name from Stack Auth profile);
     *  this is what appears next to user-generated content. */
    username: v.optional(v.string()),
    /** Avatar image URL — sourced from Stack Auth profile on bootstrap and
     *  refreshed on every sign-in. Memory Wall posts denormalize this
     *  into the photo row at upload time so old posts don't change face. */
    avatarUrl: v.optional(v.string()),
    /** Optional one-line tagline / bio surfaced on the user's profile. */
    tagline: v.optional(v.string()),
    updatedAt: v.number(),
    lastSignedIn: v.number(),
  })
    .index("by_tokenIdentifier", ["tokenIdentifier"])
    .index("by_email", ["email"])
    .index("by_username", ["username"]),

  // ───────────────────────────────────────────────────────────────────────
  // friends — bidirectional friend graph. Two rows per accepted pair (one
  // owned by each user) so list/queries are O(N) by indexed `ownerId`.
  // `status: "pending"` = inbound request from `friendUserId`. The accept
  // mutation flips both rows to "accepted".
  // ───────────────────────────────────────────────────────────────────────
  friends: defineTable({
    ownerId: v.id("users"),
    friendUserId: v.id("users"),
    status: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("blocked"),
    ),
    createdAt: v.number(),
  })
    .index("by_ownerId", ["ownerId"])
    .index("by_pair", ["ownerId", "friendUserId"]),

  // ───────────────────────────────────────────────────────────────────────
  // events — the core entity. Host-uploaded cover image, location, scheduling.
  // ───────────────────────────────────────────────────────────────────────
  events: defineTable({
    slug: v.string(),
    hostId: v.id("users"),
    title: v.string(),
    description: v.optional(v.string()),
    /** @deprecated Legacy AI-prompt field. Schema-only for back-compat; new
     *  writes do not populate this. Safe to drop in a future migration. */
    imagePrompt: v.optional(v.string()),
    /** Legacy hosted image URL (S3-era / pre-Convex-storage). Reads still
     *  surface this so old events render. New writes go through
     *  `imageStorageId` instead. */
    imageUrl: v.optional(v.string()),
    /** Convex storage ID for a host-uploaded cover image. The canonical
     *  source of truth for new events. Queries resolve this to a URL on
     *  read and return it as `imageUrl` for the client. */
    imageStorageId: v.optional(v.id("_storage")),
    eventDate: v.optional(v.number()),
    locationName: v.optional(v.string()),
    locationLat: v.optional(v.string()),
    locationLng: v.optional(v.string()),
    locationPlaceId: v.optional(v.string()),
    /** Auto-geocoded latitude (decimal degrees) from `locationName` via Open-Meteo. */
    latitude: v.optional(v.number()),
    /** Auto-geocoded longitude (decimal degrees) from `locationName` via Open-Meteo. */
    longitude: v.optional(v.number()),
    /** Tracks the locationName we geocoded; bust if it changes. */
    geocodedFrom: v.optional(v.string()),
    surveyConfig: v.optional(v.any()),
    status: v.union(
      v.literal("draft"),
      v.literal("active"),
      v.literal("past"),
      v.literal("cancelled"),
    ),
    guestTokenSalt: v.optional(v.string()),
    maxGuests: v.optional(v.number()),
    /** Max capacity for RSVPs (0 = unlimited) */
    maxCapacity: v.optional(v.number()),
    /** RSVP deadline as UTC timestamp in milliseconds (null = no deadline) */
    rsvpDeadline: v.optional(v.number()),
    memoryWallEnabled: v.union(v.literal("0"), v.literal("1")),
    smsBroadcastEnabled: v.union(v.literal("0"), v.literal("1")),
    /** Template ID used to create this event (if any) */
    templateId: v.optional(v.string()),
    /** Custom accent color for this event (hex format, e.g. #FF6B35) */
    themeColor: v.optional(v.string()),
    /** Secondary theme color for gradient (hex format) */
    themeColorSecondary: v.optional(v.string()),
    /** Portal language code (e.g. en, es, fr, de, it, pt, ja, zh, ko, ar) */
    language: v.optional(v.string()),
    /** Whether this event is publicly discoverable. When `true`, the event
     *  surfaces in the Home search box for any signed-in user; they can
     *  one-tap join via `events.joinPublicEvent`. Defaults to false (existing
     *  events stay private — invitation-only). */
    isPublic: v.optional(v.boolean()),
    /**
     * V10 seating chart — host-defined table layout for the event. Each
     * entry has a stable string id (referenced by guests.tableNumber) plus
     * a human label, optional capacity, and optional shape for the canvas.
     * Optional so legacy events that pre-date the seating feature still
     * validate on read.
     */
    tablesConfig: v.optional(
      v.array(
        v.object({
          id: v.string(),
          label: v.string(),
          capacity: v.optional(v.number()),
          shape: v.optional(
            v.union(
              v.literal("round"),
              v.literal("rect"),
              v.literal("oval"),
            ),
          ),
        }),
      ),
    ),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_hostId", ["hostId"])
    // Public-event discovery — Convex full-text search on title, filtered
    // to public + active so the index doesn't surface drafts or cancelled.
    .searchIndex("search_title_public", {
      searchField: "title",
      filterFields: ["isPublic", "status"],
    }),

  // ───────────────────────────────────────────────────────────────────────
  // rsvps — guest responses to event invitations.
  // ───────────────────────────────────────────────────────────────────────
  rsvps: defineTable({
    eventId: v.id("events"),
    guestName: v.string(),
    guestEmail: v.optional(v.string()),
    guestPhone: v.optional(v.string()),
    status: v.union(
      v.literal("attending"),
      v.literal("declined"),
      v.literal("maybe"),
    ),
    plusOnes: v.optional(v.number()),
    surveyResponses: v.optional(v.any()),
    message: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_eventId", ["eventId"]),

  // ───────────────────────────────────────────────────────────────────────
  // photos — guest-uploaded images for the Memory Wall + moderated Gallery.
  //
  // Moderation model:
  //   - Guest uploads land as `status: "pending"`. Hidden from public lists
  //     until a host approves them. Hosts see them in the Pending tab of the
  //     moderation panel.
  //   - Host uploads bypass review (`status: "approved"` immediately).
  //   - `featured` lifts a photo to the top of the public gallery in a
  //     larger frame — the "hero set".
  //
  // Backwards-compat (V1 migration): existing rows pre-dating the moderation
  // schema have no `status` field. Convex doesn't allow schema-level defaults,
  // so the listApproved query treats `status === undefined` as approved
  // (legacy data is grandfathered in). New writes always set status.
  // ───────────────────────────────────────────────────────────────────────
  photos: defineTable({
    eventId: v.id("events"),
    uploaderName: v.optional(v.string()),
    /** Optional Stack-auth user ID of the uploader. Set when a signed-in
     *  ivari user posts (host or claimed guest); null for token-only guest
     *  uploads. Lets the Memory Wall render the user's avatar/username. */
    uploaderUserId: v.optional(v.id("users")),
    /** Snapshot of the uploader's avatar URL at upload time. Denormalized
     *  so old posts stay visually stable even if the user changes their
     *  Stack profile photo later. */
    uploaderAvatarUrl: v.optional(v.string()),
    imageUrl: v.string(),
    fileKey: v.optional(v.string()),
    caption: v.optional(v.string()),
    /** Moderation state. Optional for legacy rows (treated as "approved"). */
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("approved"),
        v.literal("rejected"),
      ),
    ),
    /** Host who approved/rejected. */
    moderatedBy: v.optional(v.id("users")),
    /** Decision timestamp (ms). */
    moderatedAt: v.optional(v.number()),
    /** Optional free-text reason captured on reject. */
    moderationNote: v.optional(v.string()),
    /** Whether this photo is highlighted as part of the hero set. */
    featured: v.optional(v.boolean()),
  })
    .index("by_eventId", ["eventId"])
    // Compound index for fast public-feed queries by approval state.
    .index("by_event_status", ["eventId", "status"]),

  // ───────────────────────────────────────────────────────────────────────
  // guests — imported guest list with individual tracking.
  // ───────────────────────────────────────────────────────────────────────
  guests: defineTable({
    eventId: v.id("events"),
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    portalToken: v.optional(v.string()),
    notificationStatus: v.union(
      v.literal("pending"),
      v.literal("sent"),
      v.literal("failed"),
      v.literal("skipped"),
    ),
    notificationSentAt: v.optional(v.number()),
    notificationError: v.optional(v.string()),
    rsvpId: v.optional(v.id("rsvps")),
    /** Whether the guest has checked in at the event */
    checkedIn: v.union(v.literal("0"), v.literal("1")),
    /** Timestamp when guest checked in */
    checkedInAt: v.optional(v.number()),
    // Wedding-tier: per-guest seating + notes (V10).
    tableNumber: v.optional(v.string()), // "Table 7", "Bridal", "VIP Lounge"
    seatNumber: v.optional(v.string()), // "Seat 4" or just "12"
    dietaryNotes: v.optional(v.string()), // "Vegan, no nuts"
    hostNotes: v.optional(v.string()), // private — never returned to guests
    guestNotes: v.optional(v.string()), // shown to guest in personalized portal
    /** Stack Auth user who claimed this guest record on first sign-in via a
     *  per-guest invitation link. Once set, the event sticks to the user's
     *  profile and shows up in their "I'm Attending" list. */
    claimedByUserId: v.optional(v.id("users")),
    /** Timestamp of the claim (ms). */
    claimedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_eventId", ["eventId"])
    .index("by_claimedByUserId", ["claimedByUserId"])
    .searchIndex("search_name_for_event", {
      searchField: "name",
      filterFields: ["eventId"],
    }),

  // ───────────────────────────────────────────────────────────────────────
  // notifications — log of all notifications sent for an event.
  // ───────────────────────────────────────────────────────────────────────
  notifications: defineTable({
    eventId: v.id("events"),
    type: v.union(
      v.literal("invitation"),
      v.literal("update"),
      v.literal("reminder"),
      v.literal("broadcast"),
    ),
    subject: v.optional(v.string()),
    body: v.optional(v.string()),
    recipientCount: v.optional(v.number()),
    sentCount: v.optional(v.number()),
    failedCount: v.optional(v.number()),
    triggeredBy: v.union(v.literal("host"), v.literal("system")),
  }).index("by_eventId", ["eventId"]),

  // ───────────────────────────────────────────────────────────────────────
  // chats — per-event group chats. Multiple chats per event; types are:
  //   "general" — auto-includes every guest on the event
  //   "admin"   — restricted to admins/co-hosts
  //   "custom"  — host hand-picks members (e.g. bridal party, vendors)
  // The `archived` flag is a soft-hide so chat history isn't lost when a
  // host wraps an event.
  // ───────────────────────────────────────────────────────────────────────
  chats: defineTable({
    eventId: v.id("events"),
    name: v.string(),
    type: v.union(
      v.literal("general"),
      v.literal("admin"),
      v.literal("custom"),
    ),
    createdBy: v.id("users"),
    archived: v.boolean(),
  }).index("by_eventId", ["eventId"]),

  // ───────────────────────────────────────────────────────────────────────
  // chatMembers — membership + per-chat role. A member is EITHER a Stack
  // Auth user (host/co-host) OR a guest record (token-holder). Roles:
  //   owner  — the event host who created the chat. Sole role-changer.
  //   admin  — co-host or chat admin. Can moderate, add/remove members.
  //   member — regular participant.
  //   muted  — read-only (moderation tier).
  // `lastReadAt` powers the unread badge.
  // ───────────────────────────────────────────────────────────────────────
  chatMembers: defineTable({
    chatId: v.id("chats"),
    userId: v.optional(v.id("users")),
    guestId: v.optional(v.id("guests")),
    role: v.union(
      v.literal("owner"),
      v.literal("admin"),
      v.literal("member"),
      v.literal("muted"),
    ),
    joinedAt: v.number(),
    lastReadAt: v.optional(v.number()),
  })
    .index("by_chatId", ["chatId"])
    .index("by_userId", ["userId"])
    .index("by_guestId", ["guestId"])
    .index("by_chat_user", ["chatId", "userId"])
    .index("by_chat_guest", ["chatId", "guestId"]),

  // ───────────────────────────────────────────────────────────────────────
  // messages — per-chat ordered messages. `_creationTime` is the canonical
  // ordering key; pagination uses `beforeMs` cursors against that. Author
  // is denormalized via `authorName` for display speed (avoids a roundtrip
  // for every bubble). Attachments piggyback on Convex storage; see
  // `photos.ts` for the upload pattern. Soft-deletes preserve thread
  // structure (replies, quotes) — render as "[message removed]".
  // ───────────────────────────────────────────────────────────────────────
  messages: defineTable({
    chatId: v.id("chats"),
    authorUserId: v.optional(v.id("users")),
    authorGuestId: v.optional(v.id("guests")),
    authorName: v.string(),
    body: v.string(),
    attachmentStorageId: v.optional(v.id("_storage")),
    replyToMessageId: v.optional(v.id("messages")),
    editedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
  }).index("by_chatId", ["chatId"]),

  // ───────────────────────────────────────────────────────────────────────
  // portalViews — tracks views and interactions on guest portals.
  // ───────────────────────────────────────────────────────────────────────
  portalViews: defineTable({
    eventId: v.id("events"),
    /** Visitor fingerprint (hashed IP + UA) for unique counting */
    visitorHash: v.optional(v.string()),
    /** Page visited: portal, memory_wall */
    page: v.string(),
    /** Referrer URL */
    referrer: v.optional(v.string()),
  })
    .index("by_eventId", ["eventId"])
    .index("by_eventId_visitorHash", ["eventId", "visitorHash"]),

  // ───────────────────────────────────────────────────────────────────────
  // pushSubscriptions — Web Push subscriptions per user. One row per
  // device/browser; the same Stack user signed in on three devices has
  // three rows. `endpoint` is unique (it's the canonical subscription id
  // returned by the browser's PushManager).
  // ───────────────────────────────────────────────────────────────────────
  pushSubscriptions: defineTable({
    userId: v.id("users"),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    /** Optional device hint for surfacing in account settings. */
    userAgent: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_endpoint", ["endpoint"]),

  // ───────────────────────────────────────────────────────────────────────
  // weatherCache — cached Open-Meteo forecast slices keyed by lat/lon/date.
  // Refreshed every ~6h by the weather action. Pure cache, safe to truncate.
  // ───────────────────────────────────────────────────────────────────────
  weatherCache: defineTable({
    cacheKey: v.string(), // format: "${lat.toFixed(2)},${lon.toFixed(2)},${dateISO}"
    forecastJson: v.string(), // serialized response slice
    fetchedAt: v.number(),
  }).index("by_cacheKey", ["cacheKey"]),
});
