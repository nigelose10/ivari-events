/**
 * deviceKey — a random per-browser identifier used by the anonymous claim
 * flow on public events. Stored in localStorage under `ivari.deviceKey`.
 *
 * Generated lazily on first use; no privacy fingerprint, just a random UUID.
 * Cleared if the user signs in (we promote the claim to claimedByUserId).
 */

const KEY = "ivari.deviceKey";

function uuid(): string {
  // Prefer crypto.randomUUID when available (modern browsers); fall back
  // to a random hex string with the same shape so the server doesn't care.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex
    .slice(6, 8)
    .join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}

export function getDeviceKey(): string {
  if (typeof window === "undefined") return "";
  let key = window.localStorage.getItem(KEY);
  if (!key) {
    key = uuid();
    window.localStorage.setItem(KEY, key);
  }
  return key;
}

export function clearDeviceKey(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}
