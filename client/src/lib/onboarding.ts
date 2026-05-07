/**
 * Onboarding tour — driver.js powered.
 *
 * driver.js (MIT, ~5KB gzipped, TS-native) overlays a tour on top of any
 * existing UI without React-specific glue. We keep the tour copy here so
 * pages stay lean — they just call `runHomeTour()` when the user lands
 * on Home for the first time.
 *
 * Gating: localStorage key `ivari.tour.home.v1` — bumping the version (v2,
 * v3) lets us replay a refreshed tour after major UI changes.
 */
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
// Glass/dark token override — keep AFTER the default import so our rules win.
import "./onboarding.css";

const HOME_TOUR_KEY = "ivari.tour.home.v1";

export function shouldRunHomeTour(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(HOME_TOUR_KEY) !== "done";
}

export function markHomeTourDone(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(HOME_TOUR_KEY, "done");
}

/** Force-replay (e.g. user clicks "Show me around" in the help drawer). */
export function resetHomeTour(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(HOME_TOUR_KEY);
}

export function runHomeTour(): void {
  // Bail if the user has already seen the v1 tour.
  if (!shouldRunHomeTour()) return;

  const tour = driver({
    showProgress: true,
    overlayOpacity: 0.6,
    smoothScroll: true,
    allowClose: true,
    nextBtnText: "Next",
    prevBtnText: "Back",
    doneBtnText: "Got it",
    onDestroyStarted: () => {
      markHomeTourDone();
      tour.destroy();
    },
    steps: [
      {
        popover: {
          title: "Welcome to ivari ✨",
          description:
            "ivari helps you host events, share invitations, and run a live photo wall. Quick walkthrough — under a minute.",
        },
      },
      {
        element: '[data-tour="home-events-section"]',
        popover: {
          title: "Your events",
          description:
            "Every event you host or are attending shows up here. Tap a card to open it.",
          side: "bottom",
        },
      },
      {
        element: '[data-tour="bottom-forge"]',
        popover: {
          title: "Create with Forge",
          description:
            "The big plus button takes you to Forge — three-step event creation with a guest preview before you publish.",
          side: "top",
        },
      },
      {
        element: '[data-tour="bottom-gallery"]',
        popover: {
          title: "Memory Wall",
          description:
            "All your event photos live here. Posts from your account auto-tag with your username and avatar.",
          side: "top",
        },
      },
      {
        element: '[data-tour="bottom-you"]',
        popover: {
          title: "Profile & friends",
          description:
            "Add friends on ivari, then invite them to events with one tap — no QR claim needed.",
          side: "top",
        },
      },
    ],
  });

  // Defer so the DOM has the data-tour anchors painted.
  // eslint-disable-next-line no-restricted-globals
  setTimeout(() => tour.drive(), 200);
}
