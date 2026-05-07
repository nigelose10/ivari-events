/* push-handlers.js — appended to the generated Workbox service worker via
 * VitePWA's workbox.importScripts option. Adds Web Push event listeners.
 *
 * Payload contract (server → SW):
 *   { title: string, body: string, url?: string }
 * Mirrors `convex/push.ts notifyUser` payload shape.
 */
/* eslint-disable */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = { title: "ivari", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "ivari";
  const body = data.body || "";
  const url = typeof data.url === "string" ? data.url : "/";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url },
      // Vibrate as a fallback signal on Android
      vibrate: [40, 20, 40],
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const all = await clients.matchAll({ type: "window", includeUncontrolled: true });
      // Focus an existing tab if it's already on our origin.
      for (const c of all) {
        if (c.url && c.url.indexOf(self.location.origin) === 0 && "focus" in c) {
          c.navigate ? c.navigate(target) : null;
          return c.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(target);
    })(),
  );
});
