import * as jose from "jose";
import { ENV } from "./_core/env";

const ALGORITHM = "HS256";

export interface GuestTokenPayload {
  eventId: number;
  slug: string;
  /** "rsvp" for RSVP access, "memory" for memory wall access */
  access: "rsvp" | "memory" | "full";
  /** Optional: links this token to a specific guest record */
  guestId?: number;
}

function getSecret() {
  const secret = ENV.cookieSecret;
  if (!secret) throw new Error("JWT_SECRET is not configured");
  return new TextEncoder().encode(secret);
}

/**
 * Sign a guest portal JWT. These tokens are embedded in shareable URLs
 * and require zero authentication from the guest.
 */
export async function signGuestToken(payload: GuestTokenPayload): Promise<string> {
  const secret = getSecret();
  return new jose.SignJWT({ ...payload })
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuedAt()
    .setExpirationTime("90d")
    .sign(secret);
}

/**
 * Verify and decode a guest portal JWT.
 */
export async function verifyGuestToken(token: string): Promise<GuestTokenPayload> {
  const secret = getSecret();
  const { payload } = await jose.jwtVerify(token, secret);
  const result: GuestTokenPayload = {
    eventId: payload.eventId as number,
    slug: payload.slug as string,
    access: ((payload.access as string) || "full") as GuestTokenPayload["access"],
  };
  if (payload.guestId != null) {
    result.guestId = payload.guestId as number;
  }
  return result;
}
