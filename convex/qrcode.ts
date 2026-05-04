/**
 * QR code generation — Node action.
 *
 * The `qrcode` npm package depends on Node built-ins (Buffer, stream), so it
 * must run inside a `"use node"` Convex action. The HTTP route in `http.ts`
 * delegates to this action to produce the PNG bytes, then streams them back.
 *
 * Also exposes a host-only convenience action `generateAndStore` that
 * persists the PNG to Convex storage and returns a permanent URL — replaces
 * the legacy `qrcode.generate` route's "downloadUrl" output.
 */
"use node";
import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
// eslint-disable-next-line @typescript-eslint/no-var-requires
import QRCode from "qrcode";
import type { Id } from "./_generated/dataModel";

export type QrColors = {
  dark: string;
  light: string;
};

const DARK_PRESET: QrColors = {
  dark: "#F5F0E8",
  light: "#00000000",
};

const PRINT_PRESET: QrColors = {
  dark: "#1a1a1a",
  light: "#FFFFFF",
};

/**
 * Render a QR PNG for a portal URL. Returns base64 (the HTTP route decodes
 * before streaming; client callers can decode themselves).
 *
 * Internal — used by `http.ts` after JWT verification.
 */
export const renderInternal = internalAction({
  args: {
    portalUrl: v.string(),
    width: v.optional(v.number()),
    margin: v.optional(v.number()),
    preset: v.optional(v.union(v.literal("dark"), v.literal("print"))),
  },
  handler: async (
    _ctx,
    { portalUrl, width, margin, preset },
  ): Promise<{ base64: string; mimeType: string }> => {
    const colors = preset === "print" ? PRINT_PRESET : DARK_PRESET;
    const buffer = await QRCode.toBuffer(portalUrl, {
      width: width ?? 1024,
      margin: margin ?? 3,
      color: colors,
      errorCorrectionLevel: "H",
    });
    return {
      base64: buffer.toString("base64"),
      mimeType: "image/png",
    };
  },
});

/**
 * Public host action: generate a QR code AND persist it to Convex storage.
 * Returns both the inline data URL (for instant display) and a Convex storage
 * URL (for download). Replaces the legacy `qrcode.generate` mutation.
 *
 * Ownership check: re-validates the host owns the event via an internal query
 * on the matching token identifier — same pattern as `notificationActions`.
 */
export const generateAndStore = action({
  args: {
    eventId: v.id("events"),
    origin: v.string(),
    portalToken: v.string(),
  },
  handler: async (
    ctx,
    { eventId, origin, portalToken },
  ): Promise<{ dataUrl: string; downloadUrl: string; portalUrl: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const event = await ctx.runQuery(
      internal.notifications.getEventForOwnerCheck,
      { eventId, tokenIdentifier: identity.tokenIdentifier },
    );
    if (!event) throw new Error("Event not found");

    const portalUrl = `${origin}/portal/${event.slug}?token=${portalToken}`;

    // Render display QR (transparent dark) as data URL for inline preview.
    const dataUrl = await QRCode.toDataURL(portalUrl, {
      width: 512,
      margin: 2,
      color: {
        dark: "#F5F0E8",
        light: "#00000000",
      },
      errorCorrectionLevel: "H",
    });

    // Render high-res print QR and stash in Convex storage for download.
    const printBuffer = await QRCode.toBuffer(portalUrl, {
      width: 1024,
      margin: 3,
      color: PRINT_PRESET,
      errorCorrectionLevel: "H",
    });
    const blob = new Blob([printBuffer], { type: "image/png" });
    const storageId = await ctx.storage.store(blob);
    const downloadUrl = await ctx.storage.getUrl(storageId);
    if (!downloadUrl) throw new Error("Failed to resolve QR storage URL");

    return { dataUrl, downloadUrl, portalUrl };
  },
});
