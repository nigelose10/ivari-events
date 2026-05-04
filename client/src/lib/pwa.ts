/**
 * PWA detection & install-prompt hooks.
 *
 * iOS Safari does not fire `beforeinstallprompt` and provides no programmatic
 * install API — installation requires the user to tap Share -> Add to Home Screen.
 * For iOS we surface a custom prompt; for Chromium-based browsers we capture the
 * native event and expose a `prompt()` trigger.
 */

import { useEffect, useState, useCallback } from "react";

// ─── BeforeInstallPromptEvent (not in lib.dom yet) ──────────────────────────
type BeforeInstallPromptEvent = Event & {
  readonly platforms: readonly string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt: () => Promise<void>;
};

// ─── useIsStandalone ────────────────────────────────────────────────────────
/**
 * `true` when the page is running as an installed PWA (home-screen launch on iOS,
 * or any `display: standalone` window on desktop / Android).
 */
export function useIsStandalone(): boolean {
  const [isStandalone, setIsStandalone] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return getStandaloneState();
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(display-mode: standalone)");
    const onChange = () => setIsStandalone(getStandaloneState());
    mql.addEventListener?.("change", onChange);
    // Older Safari
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mql as any).addListener?.(onChange);
    return () => {
      mql.removeEventListener?.("change", onChange);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mql as any).removeListener?.(onChange);
    };
  }, []);

  return isStandalone;
}

function getStandaloneState(): boolean {
  if (typeof window === "undefined") return false;
  // iOS Safari sets navigator.standalone
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const iosStandalone = (window.navigator as any).standalone === true;
  const mqStandalone = window.matchMedia?.("(display-mode: standalone)").matches ?? false;
  return iosStandalone || mqStandalone;
}

// ─── useIsIOS ───────────────────────────────────────────────────────────────
/**
 * Detects iOS Safari (iPhone/iPad). Excludes in-app browsers like FB/IG/Line
 * since those can't install PWAs anyway.
 */
export function useIsIOS(): boolean {
  const [isIOS, setIsIOS] = useState<boolean>(false);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const ua = navigator.userAgent;
    // iPad on iPadOS 13+ identifies as Mac, so check for touch points too.
    const iPadOS =
      navigator.platform === "MacIntel" &&
      typeof navigator.maxTouchPoints === "number" &&
      navigator.maxTouchPoints > 1;
    const iOSDevice = /iPhone|iPod/.test(ua) || iPadOS || /iPad/.test(ua);
    if (!iOSDevice) {
      setIsIOS(false);
      return;
    }
    // Filter out in-app browsers — they can't trigger Add to Home Screen.
    const inAppBrowser = /(FBAN|FBAV|Instagram|Line|Twitter|MicroMessenger)/i.test(ua);
    setIsIOS(!inAppBrowser);
  }, []);

  return isIOS;
}

// ─── useInstallPrompt ───────────────────────────────────────────────────────
/**
 * Captures the Chromium `beforeinstallprompt` event and exposes a trigger.
 * On iOS this returns `{ canPrompt: false, prompt: noop }` — UI should fall back
 * to instructional copy.
 */
export function useInstallPrompt(): {
  canPrompt: boolean;
  prompt: () => Promise<"accepted" | "dismissed" | "unavailable">;
} {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setDeferred(null);

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt as EventListener);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt as EventListener);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const prompt = useCallback(async () => {
    if (!deferred) return "unavailable" as const;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    setDeferred(null);
    return choice.outcome;
  }, [deferred]);

  return { canPrompt: deferred !== null, prompt };
}
