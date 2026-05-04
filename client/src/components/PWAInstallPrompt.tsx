import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useIsIOS, useIsStandalone, useInstallPrompt } from "@/lib/pwa";

const DISMISS_KEY = "ivari:pwa-prompt-dismissed-at";
const DISMISS_TTL_MS = 1000 * 60 * 60 * 24 * 7; // re-show after 7 days
const SHOW_DELAY_MS = 4000; // let the page settle before nudging

/**
 * Floating glassmorphic install prompt.
 *
 * - iOS Safari: custom "Add to Home Screen" instructions (the only way on iOS).
 * - Chromium (Android / desktop): native install via captured beforeinstallprompt.
 * - Hidden when already installed (display-mode: standalone / navigator.standalone).
 * - Dismissals persist for 7 days via localStorage.
 */
export function PWAInstallPrompt() {
  const isStandalone = useIsStandalone();
  const isIOS = useIsIOS();
  const { canPrompt, prompt } = useInstallPrompt();
  const [visible, setVisible] = useState(false);

  // Decide whether to show
  useEffect(() => {
    if (isStandalone) {
      setVisible(false);
      return;
    }
    // Only show if we have something useful to offer
    const eligible = isIOS || canPrompt;
    if (!eligible) {
      setVisible(false);
      return;
    }
    // Honor dismissals
    try {
      const dismissedAtRaw = localStorage.getItem(DISMISS_KEY);
      if (dismissedAtRaw) {
        const dismissedAt = Number(dismissedAtRaw);
        if (Number.isFinite(dismissedAt) && Date.now() - dismissedAt < DISMISS_TTL_MS) {
          return;
        }
      }
    } catch {
      // ignore storage errors (private mode, etc.)
    }
    const t = window.setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [isIOS, canPrompt, isStandalone]);

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // ignore
    }
  };

  const handleInstall = async () => {
    if (canPrompt) {
      const outcome = await prompt();
      if (outcome === "accepted" || outcome === "dismissed") {
        setVisible(false);
        if (outcome === "dismissed") {
          try {
            localStorage.setItem(DISMISS_KEY, String(Date.now()));
          } catch {
            // ignore
          }
        }
      }
    }
  };

  if (isStandalone) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.96 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="pwa-install-prompt fixed left-1/2 -translate-x-1/2 z-50 max-w-sm w-[calc(100%-2rem)] rounded-3xl glass-strong"
          style={{
            bottom: "calc(env(safe-area-inset-bottom, 0px) + 1.25rem)",
            padding: "1.25rem 1.25rem 1.25rem 1.25rem",
          }}
          role="dialog"
          aria-label="Install IVARI"
        >
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss install prompt"
            className="absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center text-[oklch(0.7_0.02_75)] hover:text-[oklch(0.93_0.015_75)] transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path
                d="M1 1L13 13M1 13L13 1"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>

          <div className="flex items-start gap-3">
            <div className="shrink-0 w-11 h-11 rounded-2xl bg-gradient-to-br from-[oklch(0.78_0.12_255)] via-[oklch(0.68_0.18_290)] to-[oklch(0.6_0.16_320)] flex items-center justify-center text-white font-extrabold tracking-tight text-sm shadow-lg">
              IV
            </div>
            <div className="flex-1 min-w-0 pr-6">
              <h3 className="text-[oklch(0.93_0.015_75)] font-semibold text-base tracking-[-0.01em] leading-tight">
                Install IVARI
              </h3>
              <p className="text-[oklch(0.65_0.02_75)] text-sm leading-snug mt-1">
                {isIOS
                  ? "Add to your Home Screen for the full experience."
                  : "Get a native-app feel — full-screen, instant launch."}
              </p>
            </div>
          </div>

          {isIOS ? (
            <div className="mt-4 space-y-2 text-sm text-[oklch(0.78_0.02_75)]">
              <Step n={1}>
                Tap the <ShareIcon /> Share icon in Safari's toolbar.
              </Step>
              <Step n={2}>
                Choose <strong className="text-[oklch(0.93_0.015_75)] font-medium">Add to Home Screen</strong>.
              </Step>
              <Step n={3}>
                Tap <strong className="text-[oklch(0.93_0.015_75)] font-medium">Add</strong> in the top-right corner.
              </Step>
            </div>
          ) : (
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={handleInstall}
                disabled={!canPrompt}
                className="liquid-btn flex-1 rounded-2xl px-4 py-2.5 text-sm font-medium bg-[oklch(0.93_0.015_75)] text-[oklch(0.04_0.01_280)] disabled:opacity-50 transition-opacity"
              >
                Install
              </button>
              <button
                type="button"
                onClick={dismiss}
                className="rounded-2xl px-4 py-2.5 text-sm font-medium text-[oklch(0.7_0.02_75)] hover:text-[oklch(0.93_0.015_75)] transition-colors"
              >
                Not now
              </button>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="shrink-0 w-5 h-5 rounded-full bg-[oklch(1_0_0/8%)] border border-[oklch(1_0_0/10%)] text-[11px] font-medium text-[oklch(0.93_0.015_75)] flex items-center justify-center mt-0.5">
        {n}
      </span>
      <span className="leading-snug">{children}</span>
    </div>
  );
}

// iOS Share icon — square with arrow up
function ShareIcon() {
  return (
    <svg
      width="14"
      height="16"
      viewBox="0 0 14 16"
      fill="none"
      aria-hidden="true"
      className="inline-block align-text-bottom mx-0.5 text-[oklch(0.78_0.14_65)]"
    >
      <path
        d="M7 10.5V1.5M7 1.5L3.5 5M7 1.5L10.5 5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2 7V13.5C2 14.0523 2.44772 14.5 3 14.5H11C11.5523 14.5 12 14.0523 12 13.5V7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default PWAInstallPrompt;
