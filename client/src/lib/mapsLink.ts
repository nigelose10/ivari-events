/**
 * mapsLink — small helpers for opening a query in the user's preferred maps
 * application. Apple Maps for iOS / iPadOS / macOS, Google Maps elsewhere.
 */

export function appleMapsUrl(query: string): string {
  return `https://maps.apple.com/?q=${encodeURIComponent(query)}`;
}

export function googleMapsUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function isAppleDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  // Covers iPhone, iPad (incl. iPadOS-as-Mac UA), iPod, modern Macs.
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  // iPadOS 13+ pretends to be Mac — disambiguate via touch points.
  if (/Macintosh/.test(ua) && typeof navigator.maxTouchPoints === "number" && navigator.maxTouchPoints > 1) {
    return true;
  }
  // Plain desktop Safari on macOS opens https://maps.apple.com cleanly.
  if (/Macintosh/.test(ua)) return true;
  return false;
}

export function detectPlatformMapUrl(query: string): string {
  return isAppleDevice() ? appleMapsUrl(query) : googleMapsUrl(query);
}
