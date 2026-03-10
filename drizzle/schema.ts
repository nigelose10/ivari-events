import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, json, bigint } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Events — the core entity. Each event has AI-generated art, location, and scheduling data.
 */
export const events = mysqlTable("events", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  hostId: int("hostId").notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  imagePrompt: text("imagePrompt"),
  imageUrl: text("imageUrl"),
  eventDate: bigint("eventDate", { mode: "number" }),
  locationName: varchar("locationName", { length: 500 }),
  locationLat: text("locationLat"),
  locationLng: text("locationLng"),
  locationPlaceId: varchar("locationPlaceId", { length: 300 }),
  surveyConfig: json("surveyConfig"),
  status: mysqlEnum("status", ["draft", "active", "past", "cancelled"]).default("draft").notNull(),
  guestTokenSalt: varchar("guestTokenSalt", { length: 128 }),
  maxGuests: int("maxGuests").default(0),
  /** Max capacity for RSVPs (0 = unlimited) */
  maxCapacity: int("maxCapacity").default(0),
  /** RSVP deadline as UTC timestamp in milliseconds (null = no deadline) */
  rsvpDeadline: bigint("rsvpDeadline", { mode: "number" }),
  memoryWallEnabled: mysqlEnum("memoryWallEnabled", ["0", "1"]).default("1").notNull(),
  smsBroadcastEnabled: mysqlEnum("smsBroadcastEnabled", ["0", "1"]).default("0").notNull(),
  /** Template ID used to create this event (if any) */
  templateId: varchar("templateId", { length: 64 }),
  /** Custom accent color for this event (hex format, e.g. #FF6B35) */
  themeColor: varchar("themeColor", { length: 32 }),
  /** Secondary theme color for gradient (hex format) */
  themeColorSecondary: varchar("themeColorSecondary", { length: 32 }),
  /** Portal language code (e.g. en, es, fr, de, it, pt, ja, zh, ko, ar) */
  language: varchar("language", { length: 10 }).default("en"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Event = typeof events.$inferSelect;
export type InsertEvent = typeof events.$inferInsert;

/**
 * RSVPs — guest responses to event invitations.
 */
export const rsvps = mysqlTable("rsvps", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId").notNull(),
  guestName: varchar("guestName", { length: 300 }).notNull(),
  guestEmail: varchar("guestEmail", { length: 320 }),
  guestPhone: varchar("guestPhone", { length: 30 }),
  status: mysqlEnum("status", ["attending", "declined", "maybe"]).default("attending").notNull(),
  plusOnes: int("plusOnes").default(0),
  surveyResponses: json("surveyResponses"),
  message: text("message"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Rsvp = typeof rsvps.$inferSelect;
export type InsertRsvp = typeof rsvps.$inferInsert;

/**
 * Photos — guest-uploaded images for the Memory Wall.
 */
export const photos = mysqlTable("photos", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId").notNull(),
  uploaderName: varchar("uploaderName", { length: 300 }),
  imageUrl: text("imageUrl").notNull(),
  fileKey: varchar("fileKey", { length: 500 }),
  caption: text("caption"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Photo = typeof photos.$inferSelect;
export type InsertPhoto = typeof photos.$inferInsert;

/**
 * Guests — imported guest list with individual tracking.
 */
export const guests = mysqlTable("guests", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId").notNull(),
  name: varchar("name", { length: 300 }).notNull(),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 30 }),
  portalToken: text("portalToken"),
  notificationStatus: mysqlEnum("notificationStatus", ["pending", "sent", "failed", "skipped"]).default("pending").notNull(),
  notificationSentAt: timestamp("notificationSentAt"),
  notificationError: text("notificationError"),
  rsvpId: int("rsvpId"),
  /** Whether the guest has checked in at the event */
  checkedIn: mysqlEnum("checkedIn", ["0", "1"]).default("0").notNull(),
  /** Timestamp when guest checked in */
  checkedInAt: timestamp("checkedInAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Guest = typeof guests.$inferSelect;
export type InsertGuest = typeof guests.$inferInsert;

/**
 * Notifications — log of all notifications sent for an event.
 */
export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId").notNull(),
  type: mysqlEnum("type", ["invitation", "update", "reminder", "broadcast"]).default("invitation").notNull(),
  subject: varchar("subject", { length: 500 }),
  body: text("body"),
  recipientCount: int("recipientCount").default(0),
  sentCount: int("sentCount").default(0),
  failedCount: int("failedCount").default(0),
  triggeredBy: mysqlEnum("triggeredBy", ["host", "system"]).default("host").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

/**
 * Portal Analytics — tracks views and interactions on guest portals.
 */
export const portalViews = mysqlTable("portalViews", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId").notNull(),
  /** Visitor fingerprint (hashed IP + UA) for unique counting */
  visitorHash: varchar("visitorHash", { length: 64 }),
  /** Page visited: portal, memory_wall */
  page: varchar("page", { length: 64 }).default("portal").notNull(),
  /** Referrer URL */
  referrer: text("referrer"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PortalView = typeof portalViews.$inferSelect;
export type InsertPortalView = typeof portalViews.$inferInsert;
