/**
 * AI — Gemma 4 via Vercel AI Gateway.
 *
 * Why this stack:
 *   - Gemma 4 (released April 2026) is Google's open-weight successor to
 *     Gemma 3. The 31B Dense and 26B MoE variants are first-class citizens
 *     on Vercel's AI Gateway — no separate provider key, no Ollama runtime
 *     (Ollama can't run inside Convex/Vercel anyway), no rate-limit infra.
 *   - The Vercel AI SDK (`ai` + `@ai-sdk/gateway`) gives us a streaming-first
 *     interface. We expose two host-facing helpers from this module:
 *       1) generateEventCopy — given event title/seed, draft a description
 *       2) suggestMemoryCaption — given an upload caption, polish it
 *
 * Auth: every action requires a Stack-auth user. No anon access — Gemma is
 * not free at scale and we want a name on every call for abuse-tracking.
 *
 * Streaming model: actions cannot stream back to the client mid-call (Convex
 * actions are request/response). We collect the full text and return it. For
 * a streaming UI later, swap to a Convex HTTP route with SSE.
 */
"use node";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { generateText } from "ai";
import { gateway } from "@ai-sdk/gateway";

/** The model id we ask Vercel AI Gateway to route to. Default is the 31B
 *  dense Gemma 4 instruct model — best general quality. The 26B MoE variant
 *  is faster for chatty UX; switch via env if needed. */
const MODEL_ID = process.env.IVARI_GEMMA_MODEL ?? "google/gemma-4-31b-it";

/** Soft per-call timeout. Vercel functions have their own ceiling (~10s on
 *  hobby), so don't bother beyond that here. */
const MAX_TOKENS = 600;

async function requireAuthedUserName(ctx: any): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthorized");
  const me = await ctx.runQuery(internal.users.getCurrentUser, {
    tokenIdentifier: identity.tokenIdentifier,
  });
  if (!me) throw new Error("User row missing — sign in again");
  return me.name || me.username || "ivari user";
}

/**
 * Draft a 1–2 paragraph event description from a seed (title + optional
 * theme/audience hints). Used by Forge to scaffold copy for hosts who paste
 * a title and stare at the description box.
 */
export const generateEventCopy = action({
  args: {
    title: v.string(),
    audience: v.optional(v.string()),
    vibe: v.optional(v.string()),
  },
  handler: async (ctx, { title, audience, vibe }): Promise<{ text: string }> => {
    await requireAuthedUserName(ctx);
    if (!title.trim()) throw new Error("Title is required");

    const system =
      "You write short, warm event invitation descriptions. Two paragraphs max. " +
      "No emojis. No filler clichés like 'join us for'. Concrete and specific. " +
      "Match the vibe given but never overhype.";
    const prompt = [
      `Title: ${title.trim()}`,
      audience ? `Audience: ${audience.trim()}` : null,
      vibe ? `Vibe: ${vibe.trim()}` : null,
      "",
      "Write the description.",
    ]
      .filter(Boolean)
      .join("\n");

    const { text } = await generateText({
      model: gateway(MODEL_ID),
      system,
      prompt,
      maxOutputTokens: MAX_TOKENS,
    });
    return { text: text.trim() };
  },
});

/**
 * Polish a Memory Wall caption — keep the user's voice, fix typos and
 * obvious grammar, never invent details. Returns the polished caption only.
 */
export const polishMemoryCaption = action({
  args: { caption: v.string() },
  handler: async (ctx, { caption }): Promise<{ text: string }> => {
    await requireAuthedUserName(ctx);
    const trimmed = caption.trim();
    if (!trimmed) return { text: "" };
    if (trimmed.length > 600) {
      throw new Error("Caption is too long to polish");
    }

    const { text } = await generateText({
      model: gateway(MODEL_ID),
      system:
        "You lightly edit photo captions. Preserve the writer's voice and any specifics. " +
        "Fix typos and obvious grammar errors. Never add information that isn't already there. " +
        "Return only the edited caption — no quotes, no preamble.",
      prompt: trimmed,
      maxOutputTokens: 200,
    });
    return { text: text.trim() };
  },
});

/**
 * Free-form ivari assistant — used by an in-app chat for hosts asking
 * questions like "how do I add a co-host" or "what does the QR claim flow do".
 * The system prompt scopes the model to ivari product knowledge.
 */
export const ask = action({
  args: { question: v.string() },
  handler: async (ctx, { question }): Promise<{ text: string }> => {
    const userName = await requireAuthedUserName(ctx);
    const trimmed = question.trim();
    if (!trimmed) throw new Error("Question is required");
    if (trimmed.length > 1500) throw new Error("Question is too long");

    const { text } = await generateText({
      model: gateway(MODEL_ID),
      system:
        `You are the ivari events in-app assistant. You are speaking to ${userName}. ` +
        "ivari is an event-hosting app: hosts create events (Forge), share " +
        "per-guest invitation links, run a Live Mode photo wall, and invite " +
        "ivari friends directly as guests. Keep answers concrete and short " +
        "(under 120 words). Do not invent features. If unsure, say so.",
      prompt: trimmed,
      maxOutputTokens: MAX_TOKENS,
    });
    return { text: text.trim() };
  },
});
