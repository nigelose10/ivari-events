import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { nanoid } from "nanoid";
import {
  createEvent, getEventById, getEventBySlug, getEventsByHost, updateEvent, deleteEvent,
  createRsvp, getRsvpsByEvent, getRsvpCountsByEvent,
  createPhoto, getPhotosByEvent, deletePhoto,
  createGuestsBulk, getGuestsByEvent, getGuestById, updateGuest, deleteGuest, updateGuestNotificationStatus,
  createNotification, getNotificationsByEvent,
  recordPortalView, getPortalAnalytics, getPhotoUploadTimeline,
  checkInGuest, uncheckInGuest, getCheckInStats,
} from "./db";
import { generateImage } from "./_core/imageGeneration";
import { invokeLLM } from "./_core/llm";
import { signGuestToken, verifyGuestToken } from "./jwt";
import { storagePut } from "./storage";
import { TRPCError } from "@trpc/server";
import { emitRsvpUpdate, emitPhotoAdded } from "./socket";
import { notifyOwner } from "./_core/notification";
import { EVENT_TEMPLATES, getTemplateById } from "../shared/templates";
import QRCode from "qrcode";
import crypto from "crypto";

/** The Nano Banana prompt modifier for glass-optimized imagery */
const NANO_BANANA_MODIFIER =
  "in the style of ethereal hyper-realism, cinematic lighting, 8k, bokeh, optimized for glass refraction overlays";

/** Valid status transitions */
const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ["active", "cancelled"],
  active: ["past", "cancelled"],
  past: ["active"],
  cancelled: ["draft", "active"],
};

/** Parse CSV text into guest rows */
function parseCSV(csvText: string): Array<{ name: string; email?: string; phone?: string }> {
  const lines = csvText.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return [];

  const firstLine = lines[0].toLowerCase();
  const hasHeader = firstLine.includes("name") || firstLine.includes("email") || firstLine.includes("phone");
  const dataLines = hasHeader ? lines.slice(1) : lines;

  let nameCol = 0, emailCol = 1, phoneCol = 2;
  if (hasHeader) {
    const headers = firstLine.split(/[,\t;|]/).map(h => h.trim().toLowerCase().replace(/"/g, ""));
    nameCol = headers.findIndex(h => h.includes("name"));
    emailCol = headers.findIndex(h => h.includes("email") || h.includes("mail"));
    phoneCol = headers.findIndex(h => h.includes("phone") || h.includes("mobile") || h.includes("cell") || h.includes("sms"));
    if (nameCol === -1) nameCol = 0;
    if (emailCol === -1) emailCol = 1;
    if (phoneCol === -1) phoneCol = 2;
  }

  return dataLines.map(line => {
    const cols = line.split(/[,\t;|]/).map(c => c.trim().replace(/^"|"$/g, ""));
    const name = cols[nameCol]?.trim();
    if (!name) return null;
    return {
      name,
      email: cols[emailCol]?.trim() || undefined,
      phone: cols[phoneCol]?.trim() || undefined,
    };
  }).filter(Boolean) as Array<{ name: string; email?: string; phone?: string }>;
}

/** Generate a visitor hash for analytics */
function hashVisitor(ip: string, ua: string): string {
  return crypto.createHash("sha256").update(`${ip}:${ua}`).digest("hex").slice(0, 16);
}

export const appRouter = router({
  system: systemRouter,
  // TODO(stack-auth): DELETE the auth.me and auth.logout routes.
  // Stack Auth handles session lookup via useUser() on the client and
  // sign-out via currentUser.signOut() (or the /handler/sign-out route).
  // The hook in client/src/_core/hooks/useAuth.ts no longer calls these.
  // Once nothing references trpc.auth.* anywhere, remove this whole block
  // and drop COOKIE_NAME / getSessionCookieOptions imports above.
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── Templates ───
  templates: router({
    list: publicProcedure.query(() => {
      return EVENT_TEMPLATES.map(t => ({
        id: t.id,
        name: t.name,
        tagline: t.tagline,
        description: t.description,
        emoji: t.emoji,
        gradientFrom: t.gradientFrom,
        gradientTo: t.gradientTo,
        accentColor: t.accentColor,
        titlePlaceholder: t.titlePlaceholder,
      }));
    }),

    get: publicProcedure
      .input(z.object({ id: z.string() }))
      .query(({ input }) => {
        const template = getTemplateById(input.id);
        if (!template) throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });
        return template;
      }),
  }),

  // ─── Events (The Forge / The Ledger) ───
  events: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const eventList = await getEventsByHost(ctx.user.id);
      const enriched = await Promise.all(eventList.map(async (evt) => {
        const guestList = await getGuestsByEvent(evt.id);
        const rsvpCounts = await getRsvpCountsByEvent(evt.id);
        return { ...evt, guestCount: guestList.length, rsvpCounts };
      }));
      return enriched;
    }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const event = await getEventById(input.id);
        if (!event || event.hostId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
        }
        return event;
      }),

    getBySlug: publicProcedure
      .input(z.object({ slug: z.string() }))
      .query(async ({ input }) => {
        const event = await getEventBySlug(input.slug);
        if (!event) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
        }
        return {
          id: event.id,
          slug: event.slug,
          title: event.title,
          description: event.description,
          imageUrl: event.imageUrl,
          eventDate: event.eventDate,
          locationName: event.locationName,
          locationLat: event.locationLat,
          locationLng: event.locationLng,
          status: event.status,
          memoryWallEnabled: event.memoryWallEnabled,
          maxGuests: event.maxGuests,
          maxCapacity: event.maxCapacity,
          rsvpDeadline: event.rsvpDeadline,
          surveyConfig: event.surveyConfig,
          themeColor: event.themeColor,
          themeColorSecondary: event.themeColorSecondary,
          language: event.language,
        };
      }),

    create: protectedProcedure
      .input(
        z.object({
          title: z.string().min(1).max(500),
          description: z.string().optional(),
          eventDate: z.number().optional(),
          locationName: z.string().optional(),
          locationLat: z.string().optional(),
          locationLng: z.string().optional(),
          locationPlaceId: z.string().optional(),
          imageUrl: z.string().optional(),
          imagePrompt: z.string().optional(),
          maxGuests: z.number().optional(),
          maxCapacity: z.number().min(0).optional(),
          rsvpDeadline: z.number().optional(),
          status: z.enum(["draft", "active", "past", "cancelled"]).optional(),
          surveyConfig: z.unknown().optional(),
          templateId: z.string().optional(),
      themeColor: z.string().max(32).optional(),
        themeColorSecondary: z.string().max(32).optional(),
        language: z.string().max(10).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const slug = nanoid(12);        const guestTokenSalt = nanoid(32);
        const eventId = await createEvent({
          ...input,
          slug,
          hostId: ctx.user.id,
          guestTokenSalt,
          status: input.status || "active",
        });

        const token = await signGuestToken({
          eventId: eventId,
          slug,
          access: "full",
        });

        return { id: eventId, slug, guestToken: token };
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          title: z.string().min(1).max(500).optional(),
          description: z.string().optional(),
          eventDate: z.number().optional(),
          locationName: z.string().optional(),
          locationLat: z.string().optional(),
          locationLng: z.string().optional(),
          locationPlaceId: z.string().optional(),
          imageUrl: z.string().optional(),
          imagePrompt: z.string().optional(),
          maxGuests: z.number().optional(),
          maxCapacity: z.number().min(0).optional(),
          rsvpDeadline: z.number().nullable().optional(),
          status: z.enum(["draft", "active", "past", "cancelled"]).optional(),
          memoryWallEnabled: z.enum(["0", "1"]).optional(),
          smsBroadcastEnabled: z.enum(["0", "1"]).optional(),
          surveyConfig: z.unknown().optional(),
          themeColor: z.string().nullable().optional(),
          themeColorSecondary: z.string().nullable().optional(),
          language: z.string().max(10).nullable().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const event = await getEventById(input.id);
        if (!event || event.hostId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
        }
        const { id, ...data } = input;
        await updateEvent(id, data);
        return { success: true };
      }),

    changeStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        newStatus: z.enum(["draft", "active", "past", "cancelled"]),
        origin: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const event = await getEventById(input.id);
        if (!event || event.hostId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
        }

        const currentStatus = event.status;
        const allowed = VALID_TRANSITIONS[currentStatus] || [];
        if (!allowed.includes(input.newStatus)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Cannot transition from "${currentStatus}" to "${input.newStatus}". Allowed: ${allowed.join(", ")}`,
          });
        }

        await updateEvent(input.id, { status: input.newStatus });

        const guestList = await getGuestsByEvent(input.id);

        if (input.newStatus === "active" && guestList.length > 0) {
          const pendingGuests = guestList.filter(g => g.notificationStatus === "pending");
          let sentCount = 0;
          let failedCount = 0;
          const sentIds: number[] = [];
          const failedIds: number[] = [];

          for (const guest of pendingGuests) {
            try {
              const portalUrl = `${input.origin}/portal/${event.slug}?token=${guest.portalToken}`;
              await notifyOwner({
                title: `Invitation auto-sent to ${guest.name}`,
                content: `Event "${event.title}" is now ACTIVE.\nGuest: ${guest.name}\nPortal: ${portalUrl}`,
              });
              sentIds.push(guest.id);
              sentCount++;
            } catch {
              failedIds.push(guest.id);
              failedCount++;
            }
          }

          if (sentIds.length > 0) await updateGuestNotificationStatus(sentIds, "sent");
          if (failedIds.length > 0) await updateGuestNotificationStatus(failedIds, "failed", "Auto-send failed");

          if (pendingGuests.length > 0) {
            await createNotification({
              eventId: input.id,
              type: "invitation",
              subject: `Auto-invitations for ${event.title}`,
              body: `Event activated — ${sentCount} invitations sent, ${failedCount} failed`,
              recipientCount: pendingGuests.length,
              sentCount,
              failedCount,
              triggeredBy: "system",
            });
          }
        }

        if (input.newStatus === "cancelled" && guestList.length > 0) {
          try {
            await notifyOwner({
              title: `Event "${event.title}" cancelled`,
              content: `${guestList.length} guests were on the list. The guest portal is now closed.`,
            });
            await createNotification({
              eventId: input.id,
              type: "update",
              subject: `Event "${event.title}" cancelled`,
              body: `Event cancelled by host. ${guestList.length} guests affected.`,
              recipientCount: guestList.length,
              sentCount: guestList.length,
              failedCount: 0,
              triggeredBy: "system",
            });
          } catch {
            // Non-critical
          }
        }

        return { success: true, previousStatus: currentStatus, newStatus: input.newStatus };
      }),

    duplicate: protectedProcedure
      .input(z.object({
        id: z.number(),
        includeGuests: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const event = await getEventById(input.id);
        if (!event || event.hostId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
        }

        const newSlug = nanoid(12);
        const guestTokenSalt = nanoid(32);
        const newEventId = await createEvent({
          slug: newSlug,
          hostId: ctx.user.id,
          title: `${event.title} (Copy)`,
          description: event.description,
          imagePrompt: event.imagePrompt,
          imageUrl: event.imageUrl,
          eventDate: null,
          locationName: event.locationName,
          locationLat: event.locationLat,
          locationLng: event.locationLng,
          locationPlaceId: event.locationPlaceId,
          surveyConfig: event.surveyConfig,
          status: "draft",
          guestTokenSalt,
          maxGuests: event.maxGuests,
          maxCapacity: event.maxCapacity,
          rsvpDeadline: null,
          memoryWallEnabled: event.memoryWallEnabled,
          smsBroadcastEnabled: event.smsBroadcastEnabled,
          templateId: event.templateId,
          themeColor: event.themeColor,
          themeColorSecondary: event.themeColorSecondary,
          language: event.language,
        });

        if (input.includeGuests) {
          const originalGuests = await getGuestsByEvent(input.id);
          if (originalGuests.length > 0) {
            const guestInserts = await Promise.all(originalGuests.map(async (g) => {
              const token = await signGuestToken({
                eventId: newEventId,
                slug: newSlug,
                access: "full",
              });
              return {
                eventId: newEventId,
                name: g.name,
                email: g.email || null,
                phone: g.phone || null,
                portalToken: token,
                notificationStatus: "pending" as const,
              };
            }));
            await createGuestsBulk(guestInserts);
          }
        }

        const token = await signGuestToken({
          eventId: newEventId,
          slug: newSlug,
          access: "full",
        });

        return { id: newEventId, slug: newSlug, guestToken: token };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const event = await getEventById(input.id);
        if (!event || event.hostId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
        }
        await deleteEvent(input.id);
        return { success: true };
      }),

    getGuestLink: protectedProcedure
      .input(z.object({ id: z.number(), origin: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const event = await getEventById(input.id);
        if (!event || event.hostId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
        }
        const token = await signGuestToken({
          eventId: event.id,
          slug: event.slug,
          access: "full",
        });
        return { url: `${input.origin}/portal/${event.slug}?token=${token}` };
      }),
  }),

  // ─── Nano Banana (AI Image Generation) ───
  nanoBanana: router({
    generate: protectedProcedure
      .input(z.object({ subject: z.string().min(1) }))
      .mutation(async ({ input }) => {
        const fullPrompt = `${input.subject} ${NANO_BANANA_MODIFIER}`;
        const result = await generateImage({ prompt: fullPrompt });
        return { imageUrl: result.url, prompt: fullPrompt };
      }),
  }),

  // ─── RSVPs (The Pulse / The Portal) ───
  rsvps: router({
    list: protectedProcedure
      .input(z.object({ eventId: z.number() }))
      .query(async ({ ctx, input }) => {
        const event = await getEventById(input.eventId);
        if (!event || event.hostId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
        }
        return getRsvpsByEvent(input.eventId);
      }),

    counts: protectedProcedure
      .input(z.object({ eventId: z.number() }))
      .query(async ({ ctx, input }) => {
        const event = await getEventById(input.eventId);
        if (!event || event.hostId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
        }
        return getRsvpCountsByEvent(input.eventId);
      }),

    submit: publicProcedure
      .input(
        z.object({
          token: z.string(),
          guestName: z.string().min(1).max(300),
          guestEmail: z.string().email().optional(),
          guestPhone: z.string().optional(),
          status: z.enum(["attending", "declined", "maybe"]),
          plusOnes: z.number().min(0).max(10).optional(),
          message: z.string().max(2000).optional(),
          surveyResponses: z.unknown().optional(),
        })
      )
      .mutation(async ({ input }) => {
        let tokenPayload;
        try {
          tokenPayload = await verifyGuestToken(input.token);
        } catch {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid or expired invitation link" });
        }

        const event = await getEventById(tokenPayload.eventId);
        if (!event) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
        }

        if (event.status !== "active") {
          throw new TRPCError({ code: "FORBIDDEN", message: "This event is not currently accepting RSVPs" });
        }

        if (event.rsvpDeadline && Date.now() > event.rsvpDeadline) {
          throw new TRPCError({ code: "FORBIDDEN", message: "The RSVP deadline for this event has passed" });
        }

        if (input.status === "attending" && event.maxCapacity && event.maxCapacity > 0) {
          const counts = await getRsvpCountsByEvent(event.id);
          if (counts.attending >= event.maxCapacity) {
            throw new TRPCError({ code: "FORBIDDEN", message: "This event has reached its capacity limit" });
          }
        }

        const rsvpId = await createRsvp({
          eventId: event.id,
          guestName: input.guestName,
          guestEmail: input.guestEmail,
          guestPhone: input.guestPhone,
          status: input.status,
          plusOnes: input.plusOnes || 0,
          message: input.message,
          surveyResponses: input.surveyResponses,
        });

        const counts = await getRsvpCountsByEvent(event.id);
        emitRsvpUpdate(event.slug, {
          ...counts,
          latestRsvp: { guestName: input.guestName, status: input.status },
        });

        return { id: rsvpId, success: true };
      }),

    publicCounts: publicProcedure
      .input(z.object({ slug: z.string() }))
      .query(async ({ input }) => {
        const event = await getEventBySlug(input.slug);
        if (!event) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
        }
        return getRsvpCountsByEvent(event.id);
      }),
  }),

  // ─── Photos (The Memory Wall) ───
  photos: router({
    list: publicProcedure
      .input(z.object({ slug: z.string() }))
      .query(async ({ input }) => {
        const event = await getEventBySlug(input.slug);
        if (!event) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
        }
        return getPhotosByEvent(event.id);
      }),

    upload: publicProcedure
      .input(
        z.object({
          token: z.string(),
          uploaderName: z.string().max(300).optional(),
          caption: z.string().max(1000).optional(),
          imageBase64: z.string().max(15_000_000), // ~10MB base64 limit
          mimeType: z.string().default("image/jpeg"),
        })
      )
      .mutation(async ({ input }) => {
        let tokenPayload;
        try {
          tokenPayload = await verifyGuestToken(input.token);
        } catch {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid or expired link" });
        }

        const event = await getEventById(tokenPayload.eventId);
        if (!event || event.memoryWallEnabled !== "1") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Photo uploads not enabled" });
        }

        const buffer = Buffer.from(input.imageBase64, "base64");
        const fileKey = `memories/${event.slug}/${nanoid(16)}.${input.mimeType === "image/png" ? "png" : "jpg"}`;
        const { url } = await storagePut(fileKey, buffer, input.mimeType);

        const photoId = await createPhoto({
          eventId: event.id,
          uploaderName: input.uploaderName || "Anonymous",
          imageUrl: url,
          fileKey,
          caption: input.caption,
        });

        emitPhotoAdded(event.slug, {
          id: photoId,
          imageUrl: url,
          caption: input.caption || null,
          uploaderName: input.uploaderName || null,
        });

        return { id: photoId, imageUrl: url };
      }),

    delete: protectedProcedure
      .input(z.object({ photoId: z.number(), eventId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const event = await getEventById(input.eventId);
        if (!event || event.hostId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
        }
        // IDOR fix: verify photo belongs to this event
        const eventPhotos = await getPhotosByEvent(input.eventId);
        const photoExists = eventPhotos.some(p => p.id === input.photoId);
        if (!photoExists) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Photo not found in this event" });
        }
        await deletePhoto(input.photoId);
        return { success: true };
      }),
  }),

  // ─── Guests (Guest List Management) ───
  guests: router({
    list: protectedProcedure
      .input(z.object({ eventId: z.number() }))
      .query(async ({ ctx, input }) => {
        const event = await getEventById(input.eventId);
        if (!event || event.hostId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
        }
        return getGuestsByEvent(input.eventId);
      }),

    importCSV: protectedProcedure
      .input(z.object({
        eventId: z.number(),
        csvText: z.string().min(1),
        origin: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const event = await getEventById(input.eventId);
        if (!event || event.hostId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
        }

        const parsed = parseCSV(input.csvText);
        if (parsed.length === 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "No valid guest entries found in CSV" });
        }

        const guestInserts = await Promise.all(parsed.map(async (g) => {
          const token = await signGuestToken({
            eventId: event.id,
            slug: event.slug,
            access: "full",
          });
          return {
            eventId: event.id,
            name: g.name,
            email: g.email || null,
            phone: g.phone || null,
            portalToken: token,
            notificationStatus: "pending" as const,
          };
        }));

        const newGuests = await createGuestsBulk(guestInserts);
        return { imported: parsed.length, guests: newGuests };
      }),

    add: protectedProcedure
      .input(z.object({
        eventId: z.number(),
        name: z.string().min(1).max(300),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        origin: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const event = await getEventById(input.eventId);
        if (!event || event.hostId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
        }

        const token = await signGuestToken({
          eventId: event.id,
          slug: event.slug,
          access: "full",
        });

        const guestInserts = [{
          eventId: event.id,
          name: input.name,
          email: input.email || null,
          phone: input.phone || null,
          portalToken: token,
          notificationStatus: "pending" as const,
        }];

        const newGuests = await createGuestsBulk(guestInserts);
        return { guest: newGuests[newGuests.length - 1] };
      }),

    remove: protectedProcedure
      .input(z.object({ guestId: z.number(), eventId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const event = await getEventById(input.eventId);
        if (!event || event.hostId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
        }
        // IDOR fix: verify guest belongs to this event
        const guest = await getGuestById(input.guestId);
        if (!guest || guest.eventId !== input.eventId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Guest not found in this event" });
        }
        await deleteGuest(input.guestId);
        return { success: true };
      }),

    getLink: protectedProcedure
      .input(z.object({ guestId: z.number(), eventId: z.number(), origin: z.string() }))
      .query(async ({ ctx, input }) => {
        const event = await getEventById(input.eventId);
        if (!event || event.hostId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
        }
        const guest = await getGuestById(input.guestId);
        if (!guest || guest.eventId !== input.eventId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Guest not found" });
        }
        return { url: `${input.origin}/portal/${event.slug}?token=${guest.portalToken}` };
      }),

    /** Social Oracle — AI-powered guest suggestions */
    suggest: protectedProcedure
      .input(z.object({
        eventId: z.number(),
        eventTitle: z.string(),
        eventDescription: z.string().optional(),
        existingGuests: z.array(z.string()),
      }))
      .mutation(async ({ ctx, input }) => {
        const event = await getEventById(input.eventId);
        if (!event || event.hostId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
        }

        const existingNames = input.existingGuests.join(", ") || "none yet";

        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are the Social Oracle, an AI that suggests ideal guests for events. You analyze the event's vibe and existing guest list to suggest people who would elevate the experience. Return JSON only.`,
            },
            {
              role: "user",
              content: `Event: "${input.eventTitle}"
Description: ${input.eventDescription || "No description"}
Current guests: ${existingNames}

Suggest 5 types of people who would be perfect additions to this event. For each, provide:
- A suggested role/type (e.g., "The Storyteller", "The Connector")
- Why they'd be a great fit
- A conversation starter they could use

Return as JSON array: [{ "role": string, "reason": string, "icebreaker": string }]`,
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "guest_suggestions",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  suggestions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        role: { type: "string", description: "The archetype name" },
                        reason: { type: "string", description: "Why they'd fit this event" },
                        icebreaker: { type: "string", description: "A conversation starter" },
                      },
                      required: ["role", "reason", "icebreaker"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["suggestions"],
                additionalProperties: false,
              },
            },
          },
        });

        try {
          const rawContent = response.choices[0].message.content;
          const contentStr = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
          const parsed = JSON.parse(contentStr || "{}");
          return { suggestions: parsed.suggestions || [] };
        } catch {
          return { suggestions: [] };
        }
      }),
  }),

  // ─── Notifications ───
  notifications: router({
    list: protectedProcedure
      .input(z.object({ eventId: z.number() }))
      .query(async ({ ctx, input }) => {
        const event = await getEventById(input.eventId);
        if (!event || event.hostId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
        }
        return getNotificationsByEvent(input.eventId);
      }),

    sendBlast: protectedProcedure
      .input(z.object({
        eventId: z.number(),
        origin: z.string(),
        customMessage: z.string().max(2000).optional(),
        type: z.enum(["invitation", "update", "reminder", "broadcast"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const event = await getEventById(input.eventId);
        if (!event || event.hostId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
        }

        const guestList = await getGuestsByEvent(input.eventId);
        const pendingGuests = guestList.filter(g =>
          g.notificationStatus === "pending" || g.notificationStatus === "failed"
        );

        if (pendingGuests.length === 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "No pending guests to notify" });
        }

        const notificationType = input.type || "invitation";
        let sentCount = 0;
        let failedCount = 0;
        const sentIds: number[] = [];
        const failedIds: number[] = [];

        for (const guest of pendingGuests) {
          try {
            const portalUrl = `${input.origin}/portal/${event.slug}?token=${guest.portalToken}`;
            await notifyOwner({
              title: `Invitation sent to ${guest.name}`,
              content: `Guest: ${guest.name}\nEmail: ${guest.email || "N/A"}\nPhone: ${guest.phone || "N/A"}\nPortal: ${portalUrl}`,
            });

            sentIds.push(guest.id);
            sentCount++;
          } catch (err) {
            failedIds.push(guest.id);
            failedCount++;
          }
        }

        if (sentIds.length > 0) await updateGuestNotificationStatus(sentIds, "sent");
        if (failedIds.length > 0) await updateGuestNotificationStatus(failedIds, "failed", "Notification delivery failed");

        await createNotification({
          eventId: input.eventId,
          type: notificationType,
          subject: `${notificationType === "invitation" ? "Invitation" : "Broadcast"} for ${event.title}`,
          body: input.customMessage || `Invitation to ${event.title}`,
          recipientCount: pendingGuests.length,
          sentCount,
          failedCount,
          triggeredBy: "host",
        });

        return { sent: sentCount, failed: failedCount, total: pendingGuests.length };
      }),

    resendFailed: protectedProcedure
      .input(z.object({ eventId: z.number(), origin: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const event = await getEventById(input.eventId);
        if (!event || event.hostId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
        }

        const guestList = await getGuestsByEvent(input.eventId);
        const failedGuests = guestList.filter(g => g.notificationStatus === "failed");

        if (failedGuests.length === 0) {
          return { sent: 0, failed: 0, total: 0 };
        }

        await updateGuestNotificationStatus(failedGuests.map(g => g.id), "pending");
        return { reset: failedGuests.length };
      }),
  }),

  // ─── Analytics ───
  analytics: router({
    trackView: publicProcedure
      .input(z.object({
        slug: z.string(),
        page: z.string().optional(),
        referrer: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const event = await getEventBySlug(input.slug);
        if (!event) return { tracked: false };

        const ip = ctx.req.headers["x-forwarded-for"] as string || ctx.req.ip || "unknown";
        const ua = ctx.req.headers["user-agent"] as string || "unknown";
        const visitorHash = hashVisitor(ip, ua);

        await recordPortalView({
          eventId: event.id,
          visitorHash,
          page: input.page || "portal",
          referrer: input.referrer || null,
        });

        return { tracked: true };
      }),

    getStats: protectedProcedure
      .input(z.object({ eventId: z.number() }))
      .query(async ({ ctx, input }) => {
        const event = await getEventById(input.eventId);
        if (!event || event.hostId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
        }

        const [portalStats, rsvpCounts, photoTimeline, guestList] = await Promise.all([
          getPortalAnalytics(input.eventId),
          getRsvpCountsByEvent(input.eventId),
          getPhotoUploadTimeline(input.eventId),
          getGuestsByEvent(input.eventId),
        ]);

        const conversionRate = portalStats.uniqueVisitors > 0
          ? Math.round((rsvpCounts.total / portalStats.uniqueVisitors) * 100)
          : 0;

        return {
          portal: portalStats,
          rsvp: rsvpCounts,
          photoTimeline,
          conversionRate,
          guestStats: {
            total: guestList.length,
            sent: guestList.filter(g => g.notificationStatus === "sent").length,
            pending: guestList.filter(g => g.notificationStatus === "pending").length,
            failed: guestList.filter(g => g.notificationStatus === "failed").length,
          },
        };
      }),
  }),

  // ─── QR Code Generation ───
  qrcode: router({
    generate: protectedProcedure
      .input(z.object({
        eventId: z.number(),
        origin: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const event = await getEventById(input.eventId);
        if (!event || event.hostId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
        }

        const token = await signGuestToken({
          eventId: event.id,
          slug: event.slug,
          access: "full",
        });

        const portalUrl = `${input.origin}/portal/${event.slug}?token=${token}`;

        // Generate QR code as data URL
        const qrDataUrl = await QRCode.toDataURL(portalUrl, {
          width: 512,
          margin: 2,
          color: {
            dark: "#F5F0E8",
            light: "#00000000",
          },
          errorCorrectionLevel: "H",
        });

        // Also generate as PNG buffer for download
        const qrBuffer = await QRCode.toBuffer(portalUrl, {
          width: 1024,
          margin: 3,
          color: {
            dark: "#1a1a1a",
            light: "#FFFFFF",
          },
          errorCorrectionLevel: "H",
        });

        // Upload to S3 for download
        const fileKey = `qrcodes/${event.slug}-${nanoid(8)}.png`;
        const { url: downloadUrl } = await storagePut(fileKey, qrBuffer, "image/png");

        return {
          dataUrl: qrDataUrl,
          downloadUrl,
          portalUrl,
        };
      }),
  }),

  // ─── Check-In Routes ───
  checkin: router({
    /** Get check-in stats and guest list for an event */
    getStats: protectedProcedure
      .input(z.object({ eventId: z.number() }))
      .query(async ({ ctx, input }) => {
        const event = await getEventById(input.eventId);
        if (!event || event.hostId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        const stats = await getCheckInStats(input.eventId);
        const guestList = await getGuestsByEvent(input.eventId);
        const rsvpList = await getRsvpsByEvent(input.eventId);
        return { stats, guests: guestList, rsvps: rsvpList, event };
      }),

    /** Check in a guest */
    checkIn: protectedProcedure
      .input(z.object({ eventId: z.number(), guestId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const event = await getEventById(input.eventId);
        if (!event || event.hostId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        const guest = await getGuestById(input.guestId);
        if (!guest || guest.eventId !== input.eventId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Guest not found in this event" });
        }
        await checkInGuest(input.guestId);
        return { success: true };
      }),

    /** Uncheck a guest */
    uncheckIn: protectedProcedure
      .input(z.object({ eventId: z.number(), guestId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const event = await getEventById(input.eventId);
        if (!event || event.hostId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        const guest = await getGuestById(input.guestId);
        if (!guest || guest.eventId !== input.eventId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Guest not found in this event" });
        }
        await uncheckInGuest(input.guestId);
        return { success: true };
      }),
  }),

  // ─── Invitation Preview ───
  invitationPreview: router({
    /** Generate a shareable invitation card image using AI */
    generate: protectedProcedure
      .input(z.object({ eventId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const event = await getEventById(input.eventId);
        if (!event || event.hostId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }

        // Generate a stylized invitation card prompt
        const dateStr = event.eventDate ? new Date(event.eventDate).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }) : "";
        const prompt = `Create an elegant digital invitation card for "${event.title}". ${event.description ? `Theme: ${event.description}.` : ""} ${dateStr ? `Date: ${dateStr}.` : ""} ${event.locationName ? `Location: ${event.locationName}.` : ""} Style: premium glass-morphism design with frosted translucent panels, gold accents, cinematic lighting, elegant serif typography, 8k quality, social media ready aspect ratio`;

        const result = await generateImage({ prompt });
        if (!result?.url) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to generate invitation preview" });

        // Upload to S3 for persistence
        const response = await fetch(result.url);
        const buffer = Buffer.from(await response.arrayBuffer());
        const fileKey = `invitation-previews/${event.slug}-${nanoid(8)}.png`;
        const { url: permanentUrl } = await storagePut(fileKey, buffer, "image/png");

        return { url: permanentUrl };
      }),
  }),
});

export type AppRouter = typeof appRouter;
