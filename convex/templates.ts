/**
 * Templates — thin Convex wrapper around the static template catalog in
 * `shared/templates.ts`. Could be consumed entirely client-side, but exposing
 * via Convex keeps a single source of truth alongside other RPCs.
 */
import { v } from "convex/values";
import { query } from "./_generated/server";
import { EVENT_TEMPLATES, getTemplateById } from "../shared/templates";

export const list = query({
  args: {},
  handler: async () => {
    return EVENT_TEMPLATES.map((t) => ({
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
  },
});

export const get = query({
  args: { id: v.string() },
  handler: async (_ctx, { id }) => {
    const template = getTemplateById(id);
    if (!template) throw new Error("Template not found");
    return template;
  },
});
