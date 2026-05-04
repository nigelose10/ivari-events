/**
 * Convex HTTP router — exposes REST-style endpoints for things that can't
 * be expressed as queries/mutations.
 *
 * Currently:
 *   GET /qrcode?slug=<slug>&token=<jwt>&size=<px>
 *     Streams a PNG QR code linking to the guest portal at
 *     `<origin>/portal/<slug>?token=<jwt>`.
 *     Auth: the JWT must verify and its `slug` must match the URL slug.
 *     Stack Auth not required — anyone holding a valid guest token can
 *     render the QR.
 *
 * The `qrcode` package needs Node built-ins, so the actual rendering lives
 * in `qrcode.ts` (a `"use node"` action). This file just routes + decodes.
 */
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

http.route({
  path: "/qrcode",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const slug = url.searchParams.get("slug");
    const token = url.searchParams.get("token");
    const sizeRaw = url.searchParams.get("size") || "1024";
    const size = Math.min(Math.max(parseInt(sizeRaw, 10) || 1024, 128), 2048);

    if (!slug || !token) {
      return new Response("Missing slug or token", { status: 400 });
    }

    // Verify the JWT — same trust model as the rest of the guest portal.
    try {
      const payload = await ctx.runAction(
        internal.guestTokens.verifyGuestTokenInternal,
        { token },
      );
      if (payload.slug !== slug) {
        return new Response("Token does not match slug", { status: 401 });
      }
    } catch {
      return new Response("Invalid or expired token", { status: 401 });
    }

    const portalOrigin = `${url.protocol}//${url.host}`;
    const portalUrl = `${portalOrigin}/portal/${slug}?token=${token}`;

    const { base64, mimeType } = await ctx.runAction(
      internal.qrcode.renderInternal,
      {
        portalUrl,
        width: size,
        margin: 3,
        preset: "print",
      },
    );

    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    return new Response(bytes, {
      status: 200,
      headers: {
        "content-type": mimeType,
        "cache-control": "public, max-age=300",
      },
    });
  }),
});

export default http;
