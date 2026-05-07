/**
 * Web Push subscription helper — runs in the browser, talks to the
 * service worker registered by VitePWA, persists the subscription to
 * Convex via api.pushData.subscribe.
 *
 * Public API:
 *   - registerForPush(stackUserId, convexClient): one-shot, idempotent
 *   - unregisterFromPush(convexClient)
 *   - getPushPermissionState(): "granted" | "denied" | "default" | "unsupported"
 *
 * VAPID public key:
 *   Read from `import.meta.env.VITE_PUSH_VAPID_PUBLIC_KEY`. Set this in
 *   .env / Vercel project env. The matching private key lives only on
 *   Convex (PUSH_VAPID_PRIVATE_KEY) and is used by `convex/push.ts`.
 */
import type { ConvexReactClient } from "convex/react";
import { api } from "../../../convex/_generated/api";

export type PushPermissionState = "granted" | "denied" | "default" | "unsupported";

export function getPushPermissionState(): PushPermissionState {
  if (typeof window === "undefined") return "unsupported";
  if (!("Notification" in window)) return "unsupported";
  if (!("serviceWorker" in navigator)) return "unsupported";
  if (!("PushManager" in window)) return "unsupported";
  return Notification.permission as PushPermissionState;
}

/** RFC 8291 — VAPID public key encoded as a URL-safe base64 string. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Idempotently register the current device for push. Safe to call on every
 * sign-in — re-subscribing returns the same endpoint and the server upsert
 * is a no-op patch. Returns the resulting state, never throws on user-denied.
 */
export async function registerForPush(
  convex: ConvexReactClient,
): Promise<{ state: "subscribed" | "denied" | "unsupported" }> {
  if (getPushPermissionState() === "unsupported") return { state: "unsupported" };
  const vapidPublic = import.meta.env.VITE_PUSH_VAPID_PUBLIC_KEY as
    | string
    | undefined;
  if (!vapidPublic) {
    // eslint-disable-next-line no-console
    console.warn("[push] VITE_PUSH_VAPID_PUBLIC_KEY not set; skipping subscribe");
    return { state: "unsupported" };
  }

  if (Notification.permission === "default") {
    const result = await Notification.requestPermission();
    if (result !== "granted") return { state: "denied" };
  } else if (Notification.permission === "denied") {
    return { state: "denied" };
  }

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      // Cast — Uint8Array<ArrayBufferLike> is structurally a BufferSource but
      // Node 20+ types narrow ArrayBufferLike too aggressively for this lib.
      applicationServerKey: urlBase64ToUint8Array(vapidPublic) as BufferSource,
    });
  }

  // PushSubscription.toJSON() returns a structure with keys we can persist.
  const json = sub.toJSON() as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  const endpoint = json.endpoint ?? sub.endpoint;
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    return { state: "unsupported" };
  }

  await convex.mutation(api.pushData.subscribe, {
    endpoint,
    p256dh,
    auth,
    userAgent: navigator.userAgent,
  });
  return { state: "subscribed" };
}

export async function unregisterFromPush(convex: ConvexReactClient): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await sub.unsubscribe().catch(() => undefined);
  await convex
    .mutation(api.pushData.unsubscribe, { endpoint: sub.endpoint })
    .catch(() => undefined);
}
