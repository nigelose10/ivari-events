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
    updatedAt: v.number(),
    lastSignedIn: v.number(),
  })
    .index("by_tokenIdentifier", ["tokenIdentifier"])
    .index("by_email", ["email"]),

  // ───────────────────────────────────────────────────────────────────────
  // events — the core entity. AI-generated art, location, scheduling.
  // ───────────────────────────────────────────────────────────────────────
  events: defineTable({
    slug: v.string(),
    hostId: v.id("users"),
    title: v.string(),
    description: v.optional(v.string()),
    imagePrompt: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    eventDate: v.optional(v.number()),
    locationName: v.optional(v.string()),
    locationLat: v.optional(v.string()),
    locationLng: v.optional(v.string()),
    locationPlaceId: v.optional(v.string()),
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
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_hostId", ["hostId"]),

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
  // photos — guest-uploaded images for the Memory Wall.
  // ───────────────────────────────────────────────────────────────────────
  photos: defineTable({
    eventId: v.id("events"),
    uploaderName: v.optional(v.string()),
    imageUrl: v.string(),
    fileKey: v.optional(v.string()),
    caption: v.optional(v.string()),
  }).index("by_eventId", ["eventId"]),

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
    updatedAt: v.number(),
  }).index("by_eventId", ["eventId"]),

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
});
