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
