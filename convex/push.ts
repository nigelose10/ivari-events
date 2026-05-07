/**
 * Web Push notifications — VAPID send action (Node-runtime only).
 *
 * Subscription mutations and queries live in `pushData.ts` (V8 runtime);
 * Convex disallows mutations/queries inside `"use node"` files.
 *
 * Required env vars (set on Convex deployment):
 *   - PUSH_VAPID_PUBLIC_KEY   (also exposed to client as VITE_PUSH_VAPID_PUBLIC_KEY)
 *   - PUSH_VAPID_PRIVATE_KEY  (server only — never ship to the browser)
 *   - PUSH_VAPID_SUBJECT      ("mailto:hello@ivari.events" — required by spec)
 *
 * Generate the keypair with `npx web-push generate-vapid-keys` and paste
 * into the Convex env console.
 */
"use node";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import webpush from "web-push";

function configureVapid(): boolean {
  const pub = process.env.PUSH_VAPID_PUBLIC_KEY;
  const priv = process.env.PUSH_VAPID_PRIVATE_KEY;
  const subject = process.env.PUSH_VAPID_SUBJECT ?? "mailto:hello@ivari.events";
  if (!pub || !priv) return false;
  webpush.setVapidDetails(subject, pub, priv);
  return true;
}

/**
 * Push a notification to every device the user is subscribed on.
 * Stale subscriptions (404/410) get auto-pruned.
 */
export const notifyUser = action({
  args: {
    userId: v.id("users"),
    title: v.string(),
    body: v.string(),
    url: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { userId, title, body, url },
  ): Promise<{ delivered: number; pruned: number }> => {
    if (!configureVapid()) {
      // No VAPID keys = soft-disable; logged once so failures are visible.
      // eslint-disable-next-line no-console
      console.warn("[push] VAPID env not configured; skipping notifyUser");
      return { delivered: 0, pruned: 0 };
    }

    const subs = await ctx.runQuery(internal.pushData.subsForUser, { userId });
    if (subs.length === 0) return { delivered: 0, pruned: 0 };

    const payload = JSON.stringify({ title, body, url });
    let delivered = 0;
    let pruned = 0;

    for (const s of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        );
        delivered += 1;
      } catch (err: any) {
        const code = err?.statusCode ?? 0;
        if (code === 404 || code === 410) {
          await ctx.runMutation(internal.pushData.deleteSubByEndpoint, {
            endpoint: s.endpoint,
          });
          pruned += 1;
        } else {
          // eslint-disable-next-line no-console
          console.error("[push] sendNotification failed", err);
        }
      }
    }
    return { delivered, pruned };
  },
});
