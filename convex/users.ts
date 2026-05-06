/**
 * Users — Stack Auth → Convex identity bootstrap.
 *
 * Stack Auth signs JWTs and Convex verifies them (see auth.config.ts), but
 * Convex doesn't auto-create a row in the `users` table. The frontend must
 * call `ensureUser` once after sign-in (idempotent — safe to call on every
 * page load) to upsert the row by `tokenIdentifier`.
 *
 * Once the row exists, every other module's `requireUser()` helper succeeds.
 */
import { v } from "convex/values";
import { mutation, query, internalQuery } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

/**
 * Upsert the current authenticated user into the `users` table.
 *
 * - Pulls identity from `ctx.auth.getUserIdentity()` (verified Stack JWT).
 * - Looks up by `tokenIdentifier` (the canonical Convex identity key).
 * - If the row exists: patches name/email/lastSignedIn (non-destructive).
 * - If not: inserts a new row with role "user".
 *
 * Idempotent — frontend calls this on every mount of the auth-aware tree.
 * Throws if the JWT can't be verified (no auth) — caller should only invoke
 * after Stack Auth reports `isAuthenticated`.
 */
export const ensureUser = mutation({
  args: {},
  returns: v.object({
    _id: v.id("users"),
    tokenIdentifier: v.string(),
    role: v.union(v.literal("user"), v.literal("admin")),
  }),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized — no JWT");

    // Convex constructs tokenIdentifier as `${issuer}|${subject}`.
    const tokenIdentifier = identity.tokenIdentifier;
    const now = Date.now();

    // Stack Auth claim names: standard OIDC `email`, `name`/`given_name`.
    // Fall back to the subject if no name is available.
    const email = identity.email ?? undefined;
    const name =
      (identity.name as string | undefined) ??
      (identity.givenName as string | undefined) ??
      identity.email ??
      undefined;

    const existing = await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) =>
        q.eq("tokenIdentifier", tokenIdentifier),
      )
      .unique();

    if (existing) {
      // Non-destructive patch — keep existing role, refresh name/email/lastSignedIn.
      await ctx.db.patch(existing._id, {
        name: name ?? existing.name,
        email: email ?? existing.email,
        updatedAt: now,
        lastSignedIn: now,
      });
      return {
        _id: existing._id,
        tokenIdentifier: existing.tokenIdentifier,
        role: existing.role,
      };
    }

    const newId = await ctx.db.insert("users", {
      tokenIdentifier,
      name,
      email,
      loginMethod: "stack-auth",
      role: "user",
      updatedAt: now,
      lastSignedIn: now,
    });

    return {
      _id: newId,
      tokenIdentifier,
      role: "user" as const,
    };
  },
});

/** Read the current user row (returns null if not bootstrapped yet). */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
    return user;
  },
});

/** Internal helper — used by other modules' actions to look up a user by JWT subject. */
export const getCurrentUser = internalQuery({
  args: { tokenIdentifier: v.string() },
  handler: async (ctx, { tokenIdentifier }): Promise<Doc<"users"> | null> => {
    return await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) =>
        q.eq("tokenIdentifier", tokenIdentifier),
      )
      .unique();
  },
});
