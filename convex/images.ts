/**
 * Image generation actions — port of `server/_core/imageGeneration.ts`.
 *
 * Talks to the Forge ImageService over HTTP, pulls a base64 PNG out of the
 * response, then persists it to Convex storage and returns the storageId +
 * a resolved URL. Must run as an action because mutations cannot make
 * external HTTP calls.
 *
 * Public host-facing wrappers live in `events.regenerateImage` and the
 * invitation-preview flow; this module just handles the heavy lifting.
 */
"use node";
import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

/** Glass-optimized prompt modifier reused across the AI image flows. */
export const NANO_BANANA_MODIFIER =
  "in the style of ethereal hyper-realism, cinematic lighting, 8k, bokeh, optimized for glass refraction overlays";

type GenerateInput = {
  prompt: string;
  originalImages?: Array<{
    url?: string;
    b64Json?: string;
    mimeType?: string;
  }>;
};

async function callForgeImageService(input: GenerateInput): Promise<{
  buffer: ArrayBuffer;
  mimeType: string;
}> {
  const baseUrl = process.env.BUILT_IN_FORGE_API_URL;
  const apiKey = process.env.BUILT_IN_FORGE_API_KEY;
  if (!baseUrl) throw new Error("BUILT_IN_FORGE_API_URL is not configured");
  if (!apiKey) throw new Error("BUILT_IN_FORGE_API_KEY is not configured");

  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const fullUrl = new URL(
    "images.v1.ImageService/GenerateImage",
    normalizedBase,
  ).toString();

  const response = await fetch(fullUrl, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "connect-protocol-version": "1",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      prompt: input.prompt,
      original_images: input.originalImages || [],
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Image generation failed (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`,
    );
  }

  const result = (await response.json()) as {
    image: { b64Json: string; mimeType: string };
  };
  const binary = Uint8Array.from(atob(result.image.b64Json), (c) =>
    c.charCodeAt(0),
  );
  return { buffer: binary.buffer, mimeType: result.image.mimeType };
}

/**
 * Generate an AI image and store it in Convex storage. Returns the storageId
 * and a public URL the client can use immediately.
 *
 * Use `applyNanoBananaModifier: true` to tack on the standard glass-refraction
 * modifier (matches the legacy nanoBanana.generate route).
 */
export const generateNanoBananaImage = action({
  args: {
    prompt: v.string(),
    applyNanoBananaModifier: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    { prompt, applyNanoBananaModifier },
  ): Promise<{ storageId: string; url: string; prompt: string }> => {
    const fullPrompt = applyNanoBananaModifier
      ? `${prompt} ${NANO_BANANA_MODIFIER}`
      : prompt;
    const { buffer, mimeType } = await callForgeImageService({
      prompt: fullPrompt,
    });
    const blob = new Blob([buffer], { type: mimeType });
    const storageId = await ctx.storage.store(blob);
    const url = await ctx.storage.getUrl(storageId);
    if (!url) throw new Error("Failed to resolve storage URL");
    return { storageId, url, prompt: fullPrompt };
  },
});

/** Internal variant — used by `events.regenerateImage` and other server flows. */
export const generateNanoBananaImageInternal = internalAction({
  args: {
    prompt: v.string(),
    applyNanoBananaModifier: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    { prompt, applyNanoBananaModifier },
  ): Promise<{ storageId: string; url: string; prompt: string }> => {
    const fullPrompt = applyNanoBananaModifier
      ? `${prompt} ${NANO_BANANA_MODIFIER}`
      : prompt;
    const { buffer, mimeType } = await callForgeImageService({
      prompt: fullPrompt,
    });
    const blob = new Blob([buffer], { type: mimeType });
    const storageId = await ctx.storage.store(blob);
    const url = await ctx.storage.getUrl(storageId);
    if (!url) throw new Error("Failed to resolve storage URL");
    return { storageId, url, prompt: fullPrompt };
  },
});

/**
 * Internal action chained from `events.regenerateImage` mutation. Generates
 * a new image, then patches the event row with the new URL via
 * `events.setImage`. The mutation returns immediately; the client just
 * subscribes to the event's `imageUrl` field and Convex re-fires the query
 * when the patch lands.
 */
export const runRegenerateImage = internalAction({
  args: {
    id: v.id("events"),
    subject: v.string(),
  },
  handler: async (ctx, { id, subject }) => {
    const fullPrompt = `${subject} ${NANO_BANANA_MODIFIER}`;
    const { buffer, mimeType } = await callForgeImageService({
      prompt: fullPrompt,
    });
    const blob = new Blob([buffer], { type: mimeType });
    const storageId = await ctx.storage.store(blob);
    const url = await ctx.storage.getUrl(storageId);
    if (!url) throw new Error("Failed to resolve storage URL");
    await ctx.runMutation(internal.events.setImage, {
      id,
      imageUrl: url,
      imagePrompt: fullPrompt,
    });
  },
});

/**
 * Generate an invitation-preview card. Wraps the prompt in our card-styling
 * blurb so the host gets a polished social-media-ready output.
 */
export const generateInvitationPreviewImage = action({
  args: {
    eventTitle: v.string(),
    eventDescription: v.optional(v.string()),
    eventDateMs: v.optional(v.number()),
    locationName: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { eventTitle, eventDescription, eventDateMs, locationName },
  ): Promise<{ storageId: string; url: string }> => {
    const dateStr = eventDateMs
      ? new Date(eventDateMs).toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : "";
    const prompt = `Create an elegant digital invitation card for "${eventTitle}". ${eventDescription ? `Theme: ${eventDescription}.` : ""} ${dateStr ? `Date: ${dateStr}.` : ""} ${locationName ? `Location: ${locationName}.` : ""} Style: premium glass-morphism design with frosted translucent panels, gold accents, cinematic lighting, elegant serif typography, 8k quality, social media ready aspect ratio`;
    const { buffer, mimeType } = await callForgeImageService({ prompt });
    const blob = new Blob([buffer], { type: mimeType });
    const storageId = await ctx.storage.store(blob);
    const url = await ctx.storage.getUrl(storageId);
    if (!url) throw new Error("Failed to resolve storage URL");
    return { storageId, url };
  },
});
