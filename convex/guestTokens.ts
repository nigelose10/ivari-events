/**
 * Guest Token Actions — port of `server/jwt.ts`.
 *
 * Guest portal JWTs let unauthenticated visitors RSVP and upload memory-wall
 * photos. The token is HS256-signed with the JWT_SECRET env and embedded in
 * shareable URLs (`/portal/<slug>?token=<jwt>`).
 *
 * Lives as an action (not mutation) because `jose` resolves dynamically and we
 * want the Node runtime so we can reuse the same `jose` package the rest of
 * the codebase depends on. Convex mutations run inside a sandboxed V8 with no
 * Node built-ins, so cryptographic JWT signing belongs in an action.
 *
 * Mutations that need to verify a guest token (RSVP submit, photo upload, etc)
 * call `verifyGuestTokenInternal` directly via internal actions. Mutations
 * MUST NOT call ctx.auth — that's only for Stack Auth users (hosts).
 */
"use node";
import { v } from "convex/values";
import * as jose from "jose";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";

const ALGORITHM = "HS256";

export interface GuestTokenPayload {
  eventId: string;
  slug: string;
  /** "rsvp" — RSVP only. "memory" — memory wall only. "full" — both. */
  access: "rsvp" | "memory" | "full";
  /** Optional: links this token to a specific guest record. */
  guestId?: string;
}

function getSecret() {
  const secret = process.env.JWT_SECRET || process.env.COOKIE_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not configured");
  return new TextEncoder().encode(secret);
}

const tokenPayloadValidator = v.object({
  eventId: v.string(),
  slug: v.string(),
  access: v.union(v.literal("rsvp"), v.literal("memory"), v.literal("full")),
  guestId: v.optional(v.string()),
});

/** Public action: signs a guest token. Called by host-side mutations after
 *  ownership has been established (see events.create, events.duplicate, etc). */
export const signGuestToken = action({
  args: { payload: tokenPayloadValidator },
  handler: async (_ctx, { payload }): Promise<string> => {
    const secret = getSecret();
    return new jose.SignJWT({ ...payload })
      .setProtectedHeader({ alg: ALGORITHM })
      .setIssuedAt()
      .setExpirationTime("90d")
      .sign(secret);
  },
});

/** Internal sign — called from other actions (e.g. bulk guest invite flow). */
export const signGuestTokenInternal = internalAction({
  args: { payload: tokenPayloadValidator },
  handler: async (_ctx, { payload }): Promise<string> => {
    const secret = getSecret();
    return new jose.SignJWT({ ...payload })
      .setProtectedHeader({ alg: ALGORITHM })
      .setIssuedAt()
      .setExpirationTime("90d")
      .sign(secret);
  },
});

/** Public action: verifies a guest token. Throws on invalid/expired. */
export const verifyGuestToken = action({
  args: { token: v.string() },
  handler: async (_ctx, { token }): Promise<GuestTokenPayload> => {
    const secret = getSecret();
    const { payload } = await jose.jwtVerify(token, secret);
    const result: GuestTokenPayload = {
      eventId: payload.eventId as string,
      slug: payload.slug as string,
      access: ((payload.access as string) || "full") as GuestTokenPayload["access"],
    };
    if (payload.guestId != null) {
      result.guestId = payload.guestId as string;
    }
    return result;
  },
});

export const verifyGuestTokenInternal = internalAction({
  args: { token: v.string() },
  handler: async (_ctx, { token }): Promise<GuestTokenPayload> => {
    const secret = getSecret();
    const { payload } = await jose.jwtVerify(token, secret);
    const result: GuestTokenPayload = {
      eventId: payload.eventId as string,
      slug: payload.slug as string,
      access: ((payload.access as string) || "full") as GuestTokenPayload["access"],
    };
    if (payload.guestId != null) {
      result.guestId = payload.guestId as string;
    }
    return result;
  },
});

/**
 * Public action: mint a per-guest tracked invitation URL.
 *
 * Called from Pulse's guest-list "Copy Link" button. End-to-end:
 *   1. Verify Stack Auth identity (host must be signed in).
 *   2. Load guest + event via internal queries (actions can't db.get directly).
 *   3. Confirm the caller is the event host (IDOR guard).
 *   4. Sign a 90d HS256 JWT carrying { eventId, guestId, slug, access:"full" }
 *      so the portal can pre-fill the RSVP form and mark the notification as
 *      delivered when the guest opens the link.
 *   5. Return `${origin}/portal/${slug}?gt=<jwt>`.
 *
 * The `gt=` query param is intentionally distinct from the legacy `token=`
 * shared-portal param so the portal can branch behavior (per-guest vs
 * anonymous shared link).
 */
export const mintGuestLink = action({
  args: { guestId: v.id("guests"), origin: v.string() },
  handler: async (ctx, { guestId, origin }): Promise<{ url: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const guest: Doc<"guests"> | null = await ctx.runQuery(
      internal.guests.getGuestForOwnerCheck,
      { guestId },
    );
    if (!guest) throw new Error("Guest not found");

    const event: Doc<"events"> | null = await ctx.runQuery(
      internal.events.getEventForOwnerCheck,
      { eventId: guest.eventId as Id<"events"> },
    );
    if (!event) throw new Error("Event not found");

    const user: Doc<"users"> | null = await ctx.runQuery(
      internal.events.getUserByTokenIdentifier,
      { tokenIdentifier: identity.tokenIdentifier },
    );
    if (!user || event.hostId !== user._id) {
      throw new Error("Forbidden");
    }

    const secret = getSecret();
    const token = await new jose.SignJWT({
      eventId: event._id,
      slug: event.slug,
      access: "full",
      guestId,
    })
      .setProtectedHeader({ alg: ALGORITHM })
      .setIssuedAt()
      .setExpirationTime("90d")
      .sign(secret);

    return { url: `${origin}/portal/${event.slug}?gt=${token}` };
  },
});
