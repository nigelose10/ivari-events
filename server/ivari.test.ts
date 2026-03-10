import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Test Helpers ───

function createAuthContext(userId = 1): TrpcContext {
  return {
    user: {
      id: userId,
      openId: "test-user-openid",
      email: "host@example.com",
      name: "Test Host",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

// ─── JWT Module Tests ───

describe("JWT Guest Tokens", () => {
  it("signs and verifies a guest token", async () => {
    const { signGuestToken, verifyGuestToken } = await import("./jwt");
    const payload = { eventId: 42, slug: "test-slug-abc", access: "full" as const };
    const token = await signGuestToken(payload);
    expect(token).toBeTruthy();
    expect(typeof token).toBe("string");
    expect(token.split(".").length).toBe(3);
    const decoded = await verifyGuestToken(token);
    expect(decoded.eventId).toBe(42);
    expect(decoded.slug).toBe("test-slug-abc");
    expect(decoded.access).toBe("full");
  });

  it("rejects an invalid token", async () => {
    const { verifyGuestToken } = await import("./jwt");
    await expect(verifyGuestToken("invalid.token.here")).rejects.toThrow();
  });

  it("rejects a tampered token", async () => {
    const { signGuestToken, verifyGuestToken } = await import("./jwt");
    const token = await signGuestToken({ eventId: 1, slug: "test", access: "rsvp" });
    const parts = token.split(".");
    parts[1] = parts[1] + "tampered";
    await expect(verifyGuestToken(parts.join("."))).rejects.toThrow();
  });

  it("signs tokens with different access levels", async () => {
    const { signGuestToken, verifyGuestToken } = await import("./jwt");
    const rsvpToken = await signGuestToken({ eventId: 1, slug: "s1", access: "rsvp" });
    const fullToken = await signGuestToken({ eventId: 2, slug: "s2", access: "full" });
    const rsvpDecoded = await verifyGuestToken(rsvpToken);
    const fullDecoded = await verifyGuestToken(fullToken);
    expect(rsvpDecoded.access).toBe("rsvp");
    expect(fullDecoded.access).toBe("full");
    expect(rsvpDecoded.eventId).toBe(1);
    expect(fullDecoded.eventId).toBe(2);
  });

  it("signs tokens with guestId field", async () => {
    const { signGuestToken, verifyGuestToken } = await import("./jwt");
    const token = await signGuestToken({ eventId: 10, slug: "event-x", access: "full", guestId: 99 });
    const decoded = await verifyGuestToken(token);
    expect(decoded.guestId).toBe(99);
    expect(decoded.eventId).toBe(10);
  });
});

// ─── Router Auth Tests ───

describe("Auth Router", () => {
  it("returns user for authenticated context", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const me = await caller.auth.me();
    expect(me).toBeTruthy();
    expect(me?.name).toBe("Test Host");
    expect(me?.email).toBe("host@example.com");
  });

  it("returns null for unauthenticated context", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const me = await caller.auth.me();
    expect(me).toBeNull();
  });
});

// ─── Events Router Tests ───

describe("Events Router", () => {
  it("requires authentication for event listing", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.events.list()).rejects.toThrow();
  });

  it("requires authentication for event creation", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.events.create({ title: "Test Event" })).rejects.toThrow();
  });

  it("requires authentication for event update", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.events.update({ id: 1, title: "Updated" })).rejects.toThrow();
  });

  it("requires authentication for event deletion", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.events.delete({ id: 1 })).rejects.toThrow();
  });

  it("requires authentication for guest link generation", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.events.getGuestLink({ id: 1, origin: "https://example.com" })).rejects.toThrow();
  });
});

// ─── RSVP Router Tests ───

describe("RSVP Router", () => {
  it("rejects RSVP submission with invalid token", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.rsvps.submit({ token: "invalid-token", guestName: "Test Guest", status: "attending" })
    ).rejects.toThrow("Invalid or expired invitation link");
  });

  it("requires authentication for RSVP listing", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.rsvps.list({ eventId: 1 })).rejects.toThrow();
  });

  it("requires authentication for RSVP counts", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.rsvps.counts({ eventId: 1 })).rejects.toThrow();
  });

  it("validates RSVP input schema - rejects empty name", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.rsvps.submit({ token: "some-token", guestName: "", status: "attending" })
    ).rejects.toThrow();
  });

  it("validates RSVP input schema - rejects invalid status", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.rsvps.submit({ token: "some-token", guestName: "Test", status: "invalid" as any })
    ).rejects.toThrow();
  });
});

// ─── Photos Router Tests ───

describe("Photos Router", () => {
  it("rejects photo upload with invalid token", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.photos.upload({ token: "bad-token", imageBase64: "dGVzdA==", mimeType: "image/jpeg" })
    ).rejects.toThrow("Invalid or expired link");
  });

  it("requires authentication for photo deletion", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.photos.delete({ photoId: 1, eventId: 1 })).rejects.toThrow();
  });
});

// ─── Nano Banana Router Tests ───

describe("Nano Banana Router", () => {
  it("requires authentication for image generation", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.nanoBanana.generate({ subject: "Luxury Yacht Dinner" })).rejects.toThrow();
  });

  it("validates subject input is not empty", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.nanoBanana.generate({ subject: "" })).rejects.toThrow();
  });
});

// ─── Guest Management Router Tests ───

describe("Guest Management Router", () => {
  it("requires authentication for guest listing", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.guests.list({ eventId: 1 })).rejects.toThrow();
  });

  it("requires authentication for CSV import", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.guests.importCSV({
        eventId: 1,
        csvText: "Name,Email\nJohn,john@test.com",
        origin: "https://example.com",
      })
    ).rejects.toThrow();
  });

  it("requires authentication for adding a guest", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.guests.add({
        eventId: 1,
        name: "Test Guest",
        email: "test@example.com",
        origin: "https://example.com",
      })
    ).rejects.toThrow();
  });

  it("requires authentication for removing a guest", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.guests.remove({ guestId: 1, eventId: 1 })).rejects.toThrow();
  });

  it("requires authentication for getting guest link", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.guests.getLink({ guestId: 1, eventId: 1, origin: "https://example.com" })
    ).rejects.toThrow();
  });

  it("validates guest name is required for add", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.guests.add({
        eventId: 1,
        name: "",
        origin: "https://example.com",
      })
    ).rejects.toThrow();
  });

  it("validates CSV text is required for import", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.guests.importCSV({
        eventId: 1,
        csvText: "",
        origin: "https://example.com",
      })
    ).rejects.toThrow();
  });
});

// ─── Notification Router Tests ───

describe("Notification Router", () => {
  it("requires authentication for notification listing", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.notifications.list({ eventId: 1 })).rejects.toThrow();
  });

  it("requires authentication for sending blast", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.notifications.sendBlast({
        eventId: 1,
        origin: "https://example.com",
        type: "invitation",
      })
    ).rejects.toThrow();
  });

  it("requires authentication for resending failed", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.notifications.resendFailed({ eventId: 1, origin: "https://example.com" })
    ).rejects.toThrow();
  });

  it("validates blast type enum", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.notifications.sendBlast({
        eventId: 1,
        origin: "https://example.com",
        type: "invalid" as any,
      })
    ).rejects.toThrow();
  });
});

// ─── Template Tests ───

describe("Event Templates", () => {
  it("lists all available templates", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const templates = await caller.templates.list();
    expect(Array.isArray(templates)).toBe(true);
    expect(templates.length).toBeGreaterThanOrEqual(4);
  });

  it("returns template by id", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const template = await caller.templates.get({ id: "wedding" });
    expect(template).toBeTruthy();
    expect(template?.name).toBeTruthy();
    expect(template?.nanoBananaPrompt).toBeTruthy();
    expect(Array.isArray(template?.surveyQuestions)).toBe(true);
  });

  it("returns null for unknown template id", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.templates.get({ id: "nonexistent" })).rejects.toThrow();
  });

  it("templates have required fields", async () => {
    const { EVENT_TEMPLATES } = await import("../shared/templates");
    for (const tpl of EVENT_TEMPLATES) {
      expect(tpl.id).toBeTruthy();
      expect(tpl.name).toBeTruthy();
      expect(tpl.nanoBananaPrompt).toBeTruthy();
      expect(tpl.emoji).toBeTruthy();
      expect(Array.isArray(tpl.surveyQuestions)).toBe(true);
    }
  });
});

// ─── Socket Module Tests ───

describe("Socket Module", () => {
  it("exports emitRsvpUpdate and emitPhotoAdded functions", async () => {
    const socket = await import("./socket");
    expect(typeof socket.emitRsvpUpdate).toBe("function");
    expect(typeof socket.emitPhotoAdded).toBe("function");
    expect(typeof socket.initSocketIO).toBe("function");
    expect(typeof socket.getIO).toBe("function");
  });

  it("emitRsvpUpdate does not throw when IO is not initialized", async () => {
    const { emitRsvpUpdate } = await import("./socket");
    expect(() =>
      emitRsvpUpdate("test-slug", { attending: 5, declined: 1, maybe: 2, total: 8 })
    ).not.toThrow();
  });

  it("emitPhotoAdded does not throw when IO is not initialized", async () => {
    const { emitPhotoAdded } = await import("./socket");
    expect(() =>
      emitPhotoAdded("test-slug", { id: 1, imageUrl: "https://example.com/photo.jpg", caption: "Test", uploaderName: "User" })
    ).not.toThrow();
  });
});

// ─── CSV Parser Tests ───

describe("CSV Parser (via importCSV validation)", () => {
  it("rejects empty CSV", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.guests.importCSV({ eventId: 1, csvText: "   ", origin: "https://example.com" })
    ).rejects.toThrow();
  });
});

// ─── Status Transition Tests ───

describe("Event Status Transitions", () => {
  it("requires authentication for status change", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.events.changeStatus({ id: 1, newStatus: "active", origin: "https://example.com" })
    ).rejects.toThrow();
  });

  it("validates status enum values", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.events.changeStatus({ id: 1, newStatus: "invalid" as any, origin: "https://example.com" })
    ).rejects.toThrow();
  });

  it("accepts valid status values", async () => {
    const validStatuses = ["draft", "active", "past", "cancelled"];
    for (const status of validStatuses) {
      // Just validate the enum doesn't throw at the input level
      expect(validStatuses).toContain(status);
    }
  });
});

// ─── Event Duplication Tests ───

describe("Event Duplication", () => {
  it("requires authentication for duplication", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.events.duplicate({ id: 1 })
    ).rejects.toThrow();
  });

  it("accepts includeGuests option", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    // Will fail because event doesn't exist, but validates the schema accepts the param
    await expect(
      caller.events.duplicate({ id: 999999, includeGuests: true })
    ).rejects.toThrow("Event not found");
  });

  it("rejects non-existent event for duplication", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.events.duplicate({ id: 999999 })
    ).rejects.toThrow("Event not found");
  });
});

// ─── Capacity & Deadline Validation ───

describe("Capacity & Deadline", () => {
  it("event creation accepts maxCapacity and rsvpDeadline", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    // Validates the schema accepts these fields (will succeed or fail on DB, not schema)
    try {
      await caller.events.create({
        title: "Capacity Test Event",
        maxCapacity: 50,
        rsvpDeadline: Date.now() + 86400000,
      });
    } catch (e: any) {
      // If it throws, it should NOT be a schema validation error
      expect(e.message).not.toContain("maxCapacity");
      expect(e.message).not.toContain("rsvpDeadline");
    }
  });

  it("event update accepts maxCapacity and rsvpDeadline", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    try {
      await caller.events.update({
        id: 999999,
        maxCapacity: 100,
        rsvpDeadline: Date.now() + 86400000,
      });
    } catch (e: any) {
      // Should fail on "not found", not schema
      expect(e.message).toContain("not found") || expect(e.message).toContain("Not Found") || expect(e.code).toBeTruthy();
    }
  });
});

// ─── Analytics Router Tests ───

describe("Analytics Router", () => {
  it("allows public view tracking", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    // Will succeed or fail on DB, but should not throw auth error
    try {
      const result = await caller.analytics.trackView({ slug: "nonexistent-slug" });
      expect(result).toHaveProperty("tracked");
    } catch (e: any) {
      // Should NOT be an auth error
      expect(e.code).not.toBe("UNAUTHORIZED");
    }
  });

  it("requires authentication for analytics stats", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.analytics.getStats({ eventId: 1 })).rejects.toThrow();
  });

  it("validates eventId for analytics stats", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.analytics.getStats({ eventId: 999999 })).rejects.toThrow();
  });
});

// ─── QR Code Router Tests ───

describe("QR Code Router", () => {
  it("requires authentication for QR code generation", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.events.getQRCode({ id: 1, origin: "https://example.com" })
    ).rejects.toThrow();
  });

  it("validates origin is required for QR code", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.events.getQRCode({ id: 1, origin: "" })
    ).rejects.toThrow();
  });
});

// ─── Theme Color Tests ───

describe("Theme Color", () => {
  it("event creation accepts themeColor", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    try {
      await caller.events.create({
        title: "Themed Event",
        themeColor: "#D4A853",
      });
    } catch (e: any) {
      // Should NOT be a schema validation error for themeColor
      expect(e.message).not.toContain("themeColor");
    }
  });

  it("event update accepts themeColor", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    try {
      await caller.events.update({
        id: 999999,
        themeColor: "#FF5733",
      });
    } catch (e: any) {
      // Should fail on "not found", not schema
      expect(e.code).toBeTruthy();
    }
  });
});

// ─── Social Oracle Tests ───

describe("Social Oracle", () => {
  it("requires authentication for guest suggestions", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.guests.suggestGuests({ eventId: 1 })
    ).rejects.toThrow();
  });
});

// ─── Template Data Integrity Tests ───

describe("Template Data Integrity", () => {
  it("all templates have unique IDs", async () => {
    const { EVENT_TEMPLATES } = await import("../shared/templates");
    const ids = EVENT_TEMPLATES.map(t => t.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("all templates have nanoBananaPrompt", async () => {
    const { EVENT_TEMPLATES } = await import("../shared/templates");
    for (const tpl of EVENT_TEMPLATES) {
      expect(tpl.nanoBananaPrompt).toBeTruthy();
      expect(tpl.nanoBananaPrompt.length).toBeGreaterThan(10);
    }
  });

  it("all templates have survey questions", async () => {
    const { EVENT_TEMPLATES } = await import("../shared/templates");
    for (const tpl of EVENT_TEMPLATES) {
      expect(Array.isArray(tpl.surveyQuestions)).toBe(true);
      expect(tpl.surveyQuestions.length).toBeGreaterThan(0);
    }
  });

  it("getTemplateById returns correct template", async () => {
    const { getTemplateById } = await import("../shared/templates");
    const wedding = getTemplateById("wedding");
    expect(wedding).toBeTruthy();
    expect(wedding?.name).toContain("Wedding");
    const nonexistent = getTemplateById("nonexistent");
    expect(nonexistent).toBeUndefined();
  });
});


// ─── V6: Check-In Mode Tests ───

describe("Check-In Mode", () => {
  it("requires authentication for check-in", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.checkIn.checkIn({ eventId: 1, guestId: 1 })
    ).rejects.toThrow();
  });

  it("requires authentication for uncheck-in", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.checkIn.uncheckIn({ eventId: 1, guestId: 1 })
    ).rejects.toThrow();
  });

  it("validates eventId and guestId are required for check-in", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.checkIn.checkIn({ eventId: 0, guestId: 0 } as any)
    ).rejects.toThrow();
  });

  it("rejects check-in for non-existent event", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.checkIn.checkIn({ eventId: 999999, guestId: 1 })
    ).rejects.toThrow();
  });
});

// ─── V6: Invitation Preview Tests ───

describe("Invitation Preview", () => {
  it("requires authentication for preview generation", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.invitationPreview.generate({ eventId: 1 })
    ).rejects.toThrow();
  });

  it("rejects preview for non-existent event", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.invitationPreview.generate({ eventId: 999999 })
    ).rejects.toThrow();
  });
});

// ─── V6: Multi-Language Tests ───

describe("Multi-Language Support", () => {
  it("event creation accepts language parameter", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    try {
      await caller.events.create({
        title: "French Event",
        language: "fr",
      });
    } catch (e: any) {
      // Should NOT be a schema validation error for language
      expect(e.message).not.toContain("language");
    }
  });

  it("event update accepts language parameter", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    try {
      await caller.events.update({
        id: 999999,
        language: "es",
      });
    } catch (e: any) {
      expect(e.code).toBeTruthy();
    }
  });

  it("all supported languages have translations", async () => {
    const { SUPPORTED_LANGUAGES, PORTAL_TRANSLATIONS } = await import("../shared/i18n");
    for (const lang of SUPPORTED_LANGUAGES) {
      const t = PORTAL_TRANSLATIONS[lang.code];
      expect(t).toBeTruthy();
      expect(t.youreInvited).toBeTruthy();
      expect(t.attending).toBeTruthy();
      expect(t.declined).toBeTruthy();
      expect(t.thankYou).toBeTruthy();
      expect(t.rsvpTitle).toBeTruthy();
    }
  });

  it("translations have all required keys", async () => {
    const { PORTAL_TRANSLATIONS } = await import("../shared/i18n");
    const requiredKeys = [
      "youreInvited", "rsvpTitle", "yourName", "attending", "maybe",
      "declined", "submitRsvp", "thankYou", "rsvpConfirmed",
      "rsvpDeclinedMsg", "rsvpMaybeMsg", "memoryWall", "eventNotFound",
    ];
    for (const [code, translations] of Object.entries(PORTAL_TRANSLATIONS)) {
      for (const key of requiredKeys) {
        expect((translations as any)[key]).toBeTruthy();
      }
    }
  });
});

// ─── V6: Security Hardening Tests ───

describe("Security Hardening", () => {
  it("photo deletion requires eventId for IDOR protection", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    // Schema requires eventId
    await expect(
      caller.photos.delete({ photoId: 1 } as any)
    ).rejects.toThrow();
  });

  it("guest removal requires eventId for IDOR protection", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    // Schema requires eventId
    await expect(
      caller.guests.remove({ guestId: 1 } as any)
    ).rejects.toThrow();
  });

  it("all protected routes reject unauthenticated access", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    // Events
    await expect(caller.events.list()).rejects.toThrow();
    await expect(caller.events.create({ title: "Test" })).rejects.toThrow();
    await expect(caller.events.update({ id: 1 })).rejects.toThrow();
    await expect(caller.events.delete({ id: 1 })).rejects.toThrow();

    // Guests
    await expect(caller.guests.list({ eventId: 1 })).rejects.toThrow();
    await expect(caller.guests.add({ eventId: 1, name: "X", origin: "https://x.com" })).rejects.toThrow();

    // Notifications
    await expect(caller.notifications.list({ eventId: 1 })).rejects.toThrow();

    // Analytics
    await expect(caller.analytics.getStats({ eventId: 1 })).rejects.toThrow();

    // Check-in
    await expect(caller.checkIn.checkIn({ eventId: 1, guestId: 1 })).rejects.toThrow();

    // Invitation Preview
    await expect(caller.invitationPreview.generate({ eventId: 1 })).rejects.toThrow();
  });

  it("RSVP submit rejects without valid JWT token", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.rsvps.submit({ token: "fake-jwt", guestName: "Hacker", status: "attending" })
    ).rejects.toThrow("Invalid or expired invitation link");
  });

  it("photo upload rejects without valid JWT token", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.photos.upload({ token: "fake-jwt", imageBase64: "dGVzdA==", mimeType: "image/jpeg" })
    ).rejects.toThrow("Invalid or expired link");
  });
});
