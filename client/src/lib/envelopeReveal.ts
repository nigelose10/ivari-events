/**
 * envelopeReveal — first-visit storage helper for the wax-seal Portal reveal.
 *
 * The reveal animation plays once per (slug, browser). After it completes we
 * persist a marker in localStorage so a return visit on the same device skips
 * straight to the portal content.
 */
const KEY = "ivari:portal-revealed:";

export function hasSeenReveal(slug: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(KEY + slug) === "1";
  } catch {
    // localStorage can throw in private mode / quota — degrade to "seen" so
    // the user is never trapped behind a non-persistent animation loop.
    return true;
  }
}

export function markRevealSeen(slug: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY + slug, "1");
  } catch {
    /* ignore — see hasSeenReveal */
  }
}
