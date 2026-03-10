import { eq, desc, and, inArray, sql, gte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users, events, rsvps, photos, guests, notifications, portalViews,
  type InsertEvent, type InsertRsvp, type InsertPhoto, type InsertGuest, type InsertNotification, type InsertPortalView
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Event Queries ───

export async function createEvent(data: InsertEvent) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(events).values(data);
  return result[0].insertId;
}

export async function getEventById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(events).where(eq(events.id, id)).limit(1);
  return result[0];
}

export async function getEventBySlug(slug: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(events).where(eq(events.slug, slug)).limit(1);
  return result[0];
}

export async function getEventsByHost(hostId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(events).where(eq(events.hostId, hostId)).orderBy(desc(events.createdAt));
}

export async function updateEvent(id: number, data: Partial<InsertEvent>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(events).set(data).where(eq(events.id, id));
}

export async function deleteEvent(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(portalViews).where(eq(portalViews.eventId, id));
  await db.delete(guests).where(eq(guests.eventId, id));
  await db.delete(notifications).where(eq(notifications.eventId, id));
  await db.delete(rsvps).where(eq(rsvps.eventId, id));
  await db.delete(photos).where(eq(photos.eventId, id));
  await db.delete(events).where(eq(events.id, id));
}

// ─── RSVP Queries ───

export async function createRsvp(data: InsertRsvp) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(rsvps).values(data);
  return result[0].insertId;
}

export async function getRsvpsByEvent(eventId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(rsvps).where(eq(rsvps.eventId, eventId)).orderBy(desc(rsvps.createdAt));
}

export async function getRsvpCountsByEvent(eventId: number) {
  const db = await getDb();
  if (!db) return { attending: 0, declined: 0, maybe: 0, total: 0 };
  const all = await db.select().from(rsvps).where(eq(rsvps.eventId, eventId));
  const attending = all.filter(r => r.status === "attending").length;
  const declined = all.filter(r => r.status === "declined").length;
  const maybe = all.filter(r => r.status === "maybe").length;
  return { attending, declined, maybe, total: all.length };
}

// ─── Photo Queries ───

export async function createPhoto(data: InsertPhoto) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(photos).values(data);
  return result[0].insertId;
}

export async function getPhotosByEvent(eventId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(photos).where(eq(photos.eventId, eventId)).orderBy(desc(photos.createdAt));
}

export async function deletePhoto(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(photos).where(eq(photos.id, id));
}

// ─── Guest Queries ───

export async function createGuest(data: InsertGuest) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(guests).values(data);
  return result[0].insertId;
}

export async function createGuestsBulk(guestList: InsertGuest[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (guestList.length === 0) return [];
  await db.insert(guests).values(guestList);
  const eventId = guestList[0].eventId;
  return db.select().from(guests).where(eq(guests.eventId, eventId)).orderBy(desc(guests.createdAt));
}

export async function getGuestsByEvent(eventId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(guests).where(eq(guests.eventId, eventId)).orderBy(desc(guests.createdAt));
}

export async function getGuestById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(guests).where(eq(guests.id, id)).limit(1);
  return result[0];
}

export async function updateGuest(id: number, data: Partial<InsertGuest>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(guests).set(data).where(eq(guests.id, id));
}

export async function updateGuestNotificationStatus(
  guestIds: number[],
  status: "pending" | "sent" | "failed" | "skipped",
  error?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (guestIds.length === 0) return;
  const updateData: Record<string, unknown> = {
    notificationStatus: status,
  };
  if (status === "sent") {
    updateData.notificationSentAt = new Date();
  }
  if (error) {
    updateData.notificationError = error;
  }
  await db.update(guests).set(updateData).where(inArray(guests.id, guestIds));
}

export async function deleteGuest(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(guests).where(eq(guests.id, id));
}

export async function deleteGuestsByEvent(eventId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(guests).where(eq(guests.eventId, eventId));
}

// ─── Notification Queries ───

export async function createNotification(data: InsertNotification) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(notifications).values(data);
  return result[0].insertId;
}

export async function getNotificationsByEvent(eventId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(notifications).where(eq(notifications.eventId, eventId)).orderBy(desc(notifications.createdAt));
}

// ─── Portal Analytics Queries ───

export async function recordPortalView(data: InsertPortalView) {
  const db = await getDb();
  if (!db) return;
  await db.insert(portalViews).values(data);
}

export async function getPortalViewsByEvent(eventId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(portalViews).where(eq(portalViews.eventId, eventId)).orderBy(desc(portalViews.createdAt));
}

export async function getPortalAnalytics(eventId: number) {
  const db = await getDb();
  if (!db) return { totalViews: 0, uniqueVisitors: 0, viewsByDay: [], viewsByPage: {} };

  const allViews = await db.select().from(portalViews).where(eq(portalViews.eventId, eventId));
  const totalViews = allViews.length;

  // Unique visitors by hash
  const uniqueHashes = new Set(allViews.map(v => v.visitorHash).filter(Boolean));
  const uniqueVisitors = uniqueHashes.size || totalViews;

  // Views by day (last 30 days)
  const viewsByDay: Array<{ date: string; views: number; unique: number }> = [];
  const dayMap = new Map<string, { views: number; hashes: Set<string> }>();

  for (const view of allViews) {
    const date = new Date(view.createdAt).toISOString().split("T")[0];
    if (!dayMap.has(date)) {
      dayMap.set(date, { views: 0, hashes: new Set() });
    }
    const entry = dayMap.get(date)!;
    entry.views++;
    if (view.visitorHash) entry.hashes.add(view.visitorHash);
  }

  // Sort by date
  const sortedDays = Array.from(dayMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [date, data] of sortedDays) {
    viewsByDay.push({ date, views: data.views, unique: data.hashes.size || data.views });
  }

  // Views by page
  const viewsByPage: Record<string, number> = {};
  for (const view of allViews) {
    const page = view.page || "portal";
    viewsByPage[page] = (viewsByPage[page] || 0) + 1;
  }

  return { totalViews, uniqueVisitors, viewsByDay, viewsByPage };
}

export async function getPhotoUploadTimeline(eventId: number) {
  const db = await getDb();
  if (!db) return [];
  const allPhotos = await db.select().from(photos).where(eq(photos.eventId, eventId)).orderBy(photos.createdAt);
  const dayMap = new Map<string, number>();
  for (const photo of allPhotos) {
    const date = new Date(photo.createdAt).toISOString().split("T")[0];
    dayMap.set(date, (dayMap.get(date) || 0) + 1);
  }
  return Array.from(dayMap.entries()).map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Check-In Queries ───

export async function checkInGuest(guestId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(guests).set({
    checkedIn: "1",
    checkedInAt: new Date(),
  }).where(eq(guests.id, guestId));
}

export async function uncheckInGuest(guestId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(guests).set({
    checkedIn: "0",
    checkedInAt: null,
  }).where(eq(guests.id, guestId));
}

export async function getCheckInStats(eventId: number) {
  const db = await getDb();
  if (!db) return { total: 0, checkedIn: 0, pending: 0 };
  const allGuests = await db.select().from(guests).where(eq(guests.eventId, eventId));
  const checkedIn = allGuests.filter(g => g.checkedIn === "1").length;
  return { total: allGuests.length, checkedIn, pending: allGuests.length - checkedIn };
}
