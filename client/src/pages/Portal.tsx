/**
 * Portal — guest-facing invitation surface (gold-standard rewrite).
 *
 * Design notes:
 * - Cinematic hero: full-bleed AI art with a left→right linear-gradient mask
 *   that fades from event accent to transparent so the headline has contrast
 *   without an opaque centered overlay.
 * - LEFT-aligned hero (TASTE rule — centered hero is the #1 AI tell).
 * - Glass invitation block floats on the right above the fold.
 * - RSVP is the climax — slow scroll-fade reveal, oversized CTA at the bottom.
 * - Mobile: hero stacks vertically, RSVP becomes near-fullscreen panel.
 * - Tokens only — no inline oklch tuples beyond the per-status hue lookup,
 *   which now uses static class strings instead of runtime template literals.
 *
 * V7 additions:
 * - M1 Wax-Seal Envelope Reveal: first-time guests get a cinematic letter
 *   opening before the portal fades in. Persisted per-slug in localStorage.
 * - M3 RSVP Cinematic Climax: replaces the static "submitted" card with a
 *   full-screen confirmation including calendar/maps CTAs.
 *
 * No business logic touched: tRPC calls, mutations, hooks all preserved.
 */
import { useState, useCallback, useMemo, useEffect } from "react";
import { useQuery, useAction, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import type { Id } from "../../../convex/_generated/dataModel";
import { GlassCard } from "@/components/GlassCard";
import { LiquidButton } from "@/components/LiquidButton";
import { AmbientBackground } from "@/components/AmbientBackground";
import { WeatherWidget } from "@/components/WeatherWidget";
import { EnvelopeReveal } from "@/components/EnvelopeReveal";
import { RSVPClimax } from "@/components/RSVPClimax";
import { hasSeenReveal, markRevealSeen } from "@/lib/envelopeReveal";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar, MapPin, Users, Check, Heart, X, HelpCircle,
  ChevronDown, Image as ImageIcon, Sparkles,
} from "lucide-react";
import { useParams, useLocation } from "wouter";
import { toast } from "sonner";
import { format } from "date-fns";
import { PORTAL_TRANSLATIONS } from "../../../shared/i18n";

const EASE = [0.22, 1, 0.36, 1] as const;
const t = { duration: 0.6, ease: EASE };

type RsvpStatus = "attending" | "declined" | "maybe";

interface SurveyQuestion {
  id: string;
  type: "text" | "select" | "multiselect";
  label: string;
  options?: string[];
  required: boolean;
}

/**
 * Static class lookup for RSVP option styles. We DON'T do dynamic Tailwind
 * arbitrary-value template literals because Tailwind v4 JIT only sees strings
 * present at build time, so `bg-[oklch(0.5_0.15_${hue}/15%)]` would silently
 * fall through to nothing.
 */
const RSVP_OPTION_STYLES: Record<RsvpStatus, {
  iconActive: string;
  bgActive: string;
  borderActive: string;
  shadowActive: string;
  underline: string;
}> = {
  attending: {
    iconActive: "text-[oklch(0.72_0.14_155)]",
    bgActive: "bg-[oklch(0.72_0.14_155/14%)]",
    borderActive: "border-[oklch(0.72_0.14_155/32%)]",
    shadowActive: "shadow-[0_0_30px_oklch(0.72_0.14_155/16%)]",
    underline: "bg-[oklch(0.72_0.14_155)]",
  },
  maybe: {
    iconActive: "text-[oklch(0.78_0.13_80)]",
    bgActive: "bg-[oklch(0.78_0.13_80/14%)]",
    borderActive: "border-[oklch(0.78_0.13_80/32%)]",
    shadowActive: "shadow-[0_0_30px_oklch(0.78_0.13_80/16%)]",
    underline: "bg-[oklch(0.78_0.13_80)]",
  },
  declined: {
    iconActive: "text-[oklch(0.66_0.20_28)]",
    bgActive: "bg-[oklch(0.66_0.20_28/14%)]",
    borderActive: "border-[oklch(0.66_0.20_28/32%)]",
    shadowActive: "shadow-[0_0_30px_oklch(0.66_0.20_28/16%)]",
    underline: "bg-[oklch(0.66_0.20_28)]",
  },
};

function useTranslations(lang: string | undefined | null) {
  return useMemo(() => {
    const code = lang || "en";
    return PORTAL_TRANSLATIONS[code] || PORTAL_TRANSLATIONS["en"];
  }, [lang]);
}

export default function Portal() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug || "";
  const [, navigate] = useLocation();

  const searchStr = typeof window !== "undefined" ? window.location.search : "";
  // V11 — three URL shapes Portal must handle:
  //   ?token=<jwt>         shared anonymous link from Pulse "Copy Portal Link"
  //   ?gt=<jwt>            per-guest tracked link from `mintGuestLink` (carries guestId)
  //   ?guest=<guestId>     bare guestId from QR scans (no JWT — used post-claim)
  // Sign-in claim flow keys off `gt` (decoded server-side) OR `guest`.
  const { gt, guestParam, anonToken } = useMemo(() => {
    const p = new URLSearchParams(searchStr);
    return {
      gt: p.get("gt") || "",
      guestParam: p.get("guest") || "",
      anonToken: p.get("token") || "",
    };
  }, [searchStr]);
  // The token we pass to RSVP submit — prefer per-guest gt, fall back to shared anon token.
  const token = gt || anonToken;

  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  // V10 wedding-tier: "find your name" lookup. Lets a guest who arrived
  // without a per-guest QR/token (e.g. shared portal link) type their name
  // and see THEIR personalized table/seat/host notes before RSVP. The
  // server-side `findByNameInEvent` query strips private fields (hostNotes,
  // email, phone) before returning.
  type GuestMatch = {
    _id: string;
    name: string;
    tableNumber?: string;
    seatNumber?: string;
    dietaryNotes?: string;
    guestNotes?: string;
  };
  const [nameQuery, setNameQuery] = useState("");
  const [pickedGuest, setPickedGuest] = useState<GuestMatch | null>(null);
  const [status, setStatus] = useState<RsvpStatus>("attending");
  const [plusOnes, setPlusOnes] = useState(0);
  const [message, setMessage] = useState("");
  const [surveyAnswers, setSurveyAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // V7-M1: envelope reveal state. `revealed` flips after the wax-seal animation
  // completes; we also pre-check localStorage so returning guests skip it.
  const [revealed, setRevealed] = useState<boolean>(() =>
    slug ? hasSeenReveal(slug) : true
  );

  // V7-M3: cinematic climax state. Set by handleSubmit on success.
  const [rsvpClimax, setRsvpClimax] = useState<{ status: RsvpStatus } | null>(null);

  // Convex reactive queries — auto-update when underlying data changes.
  const eventData = useQuery(api.events.getBySlug, slug ? { slug } : "skip");
  const countsData = useQuery(api.rsvps.publicCounts, slug ? { slug } : "skip");
  // V10 wedding-tier — public name search (server strips hostNotes etc).
  // Only fires once the typed query is at least 2 chars.
  const nameMatches = useQuery(
    api.guests.findByNameInEvent,
    slug && nameQuery.trim().length >= 2
      ? { eventSlug: slug, nameQuery: nameQuery.trim() }
      : "skip",
  );
  const eventQuery = { data: eventData, isLoading: !!slug && eventData === undefined };
  const countsQuery = { data: countsData, refetch: () => {} /* no-op: Convex auto-refetches */ };

  // RSVP submit goes through an action (it verifies the guest JWT internally).
  const submitWithToken = useAction(api.rsvps.submitWithToken);
  const decodeGuestToken = useAction(api.guestTokens.decodeGuestToken);
  const claimGuestRecord = useMutation(api.users.claimGuestRecord);
  const ensureUser = useMutation(api.users.ensureUser);

  // V11 — auth + claim wiring.
  const { isAuthenticated, loading: authLoading } = useAuth();

  // Resolved guestId — either from server-decoded `gt` JWT (preferred) or
  // direct `?guest=` param (set after a claim, when the token has been used).
  const [resolvedGuestId, setResolvedGuestId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (guestParam) {
      setResolvedGuestId(guestParam);
      return;
    }
    if (gt) {
      decodeGuestToken({ token: gt })
        .then((res) => {
          if (cancelled) return;
          setResolvedGuestId(res?.guestId ?? null);
        })
        .catch(() => {
          if (!cancelled) setResolvedGuestId(null);
        });
    } else {
      setResolvedGuestId(null);
    }
    return () => {
      cancelled = true;
    };
  }, [gt, guestParam, decodeGuestToken]);

  // Once signed in AND we have a guestId resolved, claim the record. This
  // runs idempotently — claimGuestRecord no-ops if already-yours.
  const [claimAttempted, setClaimAttempted] = useState(false);
  useEffect(() => {
    if (claimAttempted) return;
    if (!isAuthenticated || authLoading) return;
    if (!slug || !resolvedGuestId) return;
    setClaimAttempted(true);
    // Bootstrap the users row first (idempotent), then claim. Without
    // ensureUser the mutation throws "User row missing".
    (async () => {
      try {
        await ensureUser({});
        await claimGuestRecord({
          eventSlug: slug,
          guestId: resolvedGuestId as Id<"guests">,
        });
      } catch (err) {
        // Silent — claim is best-effort. RSVP flow continues regardless.
        console.warn("[portal] claimGuestRecord failed", err);
      }
    })();
  }, [isAuthenticated, authLoading, slug, resolvedGuestId, claimAttempted, ensureUser, claimGuestRecord]);

  // Personalized data — only fetched when signed in. Powers the "Welcome
  // back, {name}" greeting + table assignment line.
  const myClaimed = useQuery(
    api.users.myClaimedGuestForEvent,
    isAuthenticated && slug ? { eventSlug: slug } : "skip",
  );
  // V11 — once we resolve the user's claimed guest record, prefill name so
  // returning visitors don't have to retype it. Only seeds when blank to
  // respect any in-progress edits.
  useEffect(() => {
    if (myClaimed?.name && !guestName) {
      setGuestName(myClaimed.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myClaimed?.name]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitMutation = {
    isPending: isSubmitting,
    mutate: async (input: any) => {
      setIsSubmitting(true);
      try {
        await submitWithToken(input);
        setSubmitted(true);
        // V7-M3: trigger the cinematic climax overlay on success.
        setRsvpClimax({ status: input.status as RsvpStatus });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Submit failed");
      } finally {
        setIsSubmitting(false);
      }
    },
  };

  const event = eventData;
  const counts = countsData;
  const i18n = useTranslations(event?.language);

  // Apply event's custom theme color to the cascade
  useEffect(() => {
    if (event?.themeColor) {
      document.documentElement.style.setProperty("--event-accent", event.themeColor);
    }
    return () => {
      document.documentElement.style.removeProperty("--event-accent");
    };
  }, [event?.themeColor]);

  // Track portal view for analytics
  const recordPortalView = useMutation(api.analytics.recordPortalView);
  useEffect(() => {
    if (slug) {
      recordPortalView({ slug, page: "portal" } as any).catch(() => {
        /* analytics is fire-and-forget; ignore failures */
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const isDeadlinePassed = event?.rsvpDeadline
    ? new Date(event.rsvpDeadline).getTime() < Date.now()
    : false;
  const isCapacityFull =
    event?.maxCapacity && event.maxCapacity > 0 && counts
      ? counts.attending >= event.maxCapacity
      : false;
  const isEventClosed = event?.status === "cancelled" || event?.status === "past";
  const isRsvpClosed = isDeadlinePassed || isCapacityFull || isEventClosed;

  const surveyConfig = useMemo((): SurveyQuestion[] => {
    if (!event?.surveyConfig) return [];
    try {
      return Array.isArray(event.surveyConfig) ? (event.surveyConfig as SurveyQuestion[]) : [];
    } catch { return []; }
  }, [event?.surveyConfig]);

  const handleSubmit = useCallback(() => {
    if (!guestName.trim()) { toast.error("Please enter your name"); return; }
    if (!token) { toast.error("Invalid invitation link"); return; }

    // V11 — sign-in gate on "Attending". If the guest is on a per-guest link
    // (gt= present) but not signed in, route to Stack Auth's sign-in page
    // first so the event can stick to their profile. Anonymous shared
    // links (?token= only, no resolvedGuestId) skip this — they keep working
    // as before.
    if (
      status === "attending" &&
      resolvedGuestId &&
      !authLoading &&
      !isAuthenticated &&
      typeof window !== "undefined"
    ) {
      const returnTo =
        window.location.pathname + window.location.search + window.location.hash;
      const url = `${getLoginUrl()}?after_auth_return_to=${encodeURIComponent(returnTo)}`;
      window.location.href = url;
      return;
    }

    // Apple HIG haptic confirmation on RSVP submit (mobile only)
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(10);
    }
    submitMutation.mutate({
      token,
      guestName: guestName.trim(),
      guestEmail: guestEmail.trim() || undefined,
      status,
      plusOnes,
      message: message.trim() || undefined,
      surveyResponses: Object.keys(surveyAnswers).length > 0 ? surveyAnswers : undefined,
    });
  }, [token, guestName, guestEmail, status, plusOnes, message, surveyAnswers, submitMutation, resolvedGuestId, authLoading, isAuthenticated]);

  // ─── Loading ───
  if (eventQuery.isLoading) {
    return (
      <div className="min-h-[100dvh] relative flex items-center justify-center">
        <AmbientBackground />
        <motion.div
          className="flex flex-col items-center gap-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={t}
        >
          <motion.div
            className="w-12 h-12 rounded-full border-2 border-[var(--primary)] border-t-transparent"
            animate={{ rotate: 360 }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
          />
        </motion.div>
      </div>
    );
  }

  // ─── Not found ───
  if (!event) {
    return (
      <div className="min-h-[100dvh] relative flex items-center justify-center px-6">
        <AmbientBackground />
        <GlassCard className="p-10 text-center max-w-sm">
          <div className="w-14 h-14 rounded-2xl bg-[oklch(0.66_0.20_28/14%)] flex items-center justify-center mx-auto mb-5">
            <X className="w-7 h-7 text-[oklch(0.7_0.15_25)]" />
          </div>
          <h2 className="font-display text-2xl font-bold tracking-tight mb-2">
            {i18n.eventNotFound}
          </h2>
          <p className="text-sm text-[var(--text-tertiary)] leading-relaxed">
            This link may have expired or the event was removed.
          </p>
        </GlassCard>
      </div>
    );
  }

  // ─── Submitted (success) ───
  // The cinematic <RSVPClimax> overlay is the primary post-submit surface.
  // We keep this static fallback for when the overlay has been dismissed
  // (so reload-state and screenshots still read sensibly) and when the
  // memory wall CTA is configured.
  if (submitted && !rsvpClimax) {
    const thankMsg =
      status === "attending" ? i18n.rsvpConfirmed
      : status === "maybe" ? i18n.rsvpMaybeMsg
      : i18n.rsvpDeclinedMsg;
    return (
      <div className="min-h-[100dvh] relative flex items-center justify-center px-6">
        <AmbientBackground />
        {event.imageUrl && (
          <div className="absolute inset-0">
            <img src={event.imageUrl} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-[oklch(0.04_0.005_75/86%)] backdrop-blur-2xl" />
          </div>
        )}
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.9, ease: EASE }}
          className="relative z-10 w-full max-w-md"
        >
          <GlassCard variant="elevated" className="p-12 sm:p-14 text-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.3, type: "spring", stiffness: 200, damping: 16 }}
              className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-8 ${
                status === "attending"
                  ? "bg-[oklch(0.72_0.14_155/16%)]"
                  : status === "maybe"
                  ? "bg-[oklch(0.78_0.13_80/16%)]"
                  : "bg-[oklch(0.66_0.20_28/16%)]"
              }`}
            >
              {status === "attending" ? (
                <Heart className="w-9 h-9 text-[oklch(0.72_0.14_155)]" />
              ) : status === "maybe" ? (
                <HelpCircle className="w-9 h-9 text-[oklch(0.78_0.13_80)]" />
              ) : (
                <X className="w-9 h-9 text-[oklch(0.66_0.20_28)]" />
              )}
            </motion.div>
            <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight mb-4 leading-[1.05]">
              {i18n.thankYou}
            </h2>
            <p className="text-[var(--text-secondary)] leading-relaxed mb-8 text-[0.9375rem]">
              {thankMsg}
            </p>
            {event.memoryWallEnabled === "1" && (
              <LiquidButton
                onClick={() => navigate(`/memory/${event.slug}?token=${token}`)}
                variant="glass"
                className="gap-2"
              >
                <ImageIcon className="w-4 h-4" />
                {i18n.memoryWall}
              </LiquidButton>
            )}
          </GlassCard>
        </motion.div>
      </div>
    );
  }

  // ─── Main portal ───
  // V7-M1 gate: until the wax-seal reveal completes, we still render the
  // AmbientBackground beneath the EnvelopeReveal overlay so the curtain
  // open transitions into a real surface, not a flash of empty black.
  const showMainContent = revealed;

  return (
    <div className="min-h-[100dvh] relative">
      <AmbientBackground />

      {/* V7-M1: wax-seal reveal — first-time guests only */}
      {slug && !revealed && eventData && (
        <EnvelopeReveal
          eventTitle={eventData.title}
          themeColor={eventData.themeColor || "oklch(0.75 0.15 55)"}
          onComplete={() => {
            markRevealSeen(slug);
            setRevealed(true);
          }}
        />
      )}

      {/* V7-M3: cinematic climax — overlays the page after RSVP submit */}
      {rsvpClimax && eventData && (
        <RSVPClimax
          event={{
            title: eventData.title,
            eventDate: eventData.eventDate,
            locationName: eventData.locationName ?? undefined,
            description: eventData.description ?? undefined,
            themeColor: eventData.themeColor ?? undefined,
          }}
          rsvpStatus={rsvpClimax.status}
          onClose={() => setRsvpClimax(null)}
        />
      )}

      {/* Main content — hidden until reveal completes so the curtain pulls
          back onto a clean composition, not a half-mounted hero. */}
      <div
        style={{
          opacity: showMainContent ? 1 : 0,
          transition: "opacity 600ms cubic-bezier(0.22, 1, 0.36, 1)",
          pointerEvents: showMainContent ? "auto" : "none",
        }}
      >

      {/* ============================================================
          CINEMATIC HERO — full-bleed AI art, left-aligned headline,
          accent gradient mask. Mobile collapses to stacked.
          ============================================================ */}
      <section className="relative min-h-[88vh] sm:min-h-[92vh] flex items-end overflow-hidden">
        {event.imageUrl ? (
          <>
            <motion.img
              src={event.imageUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              initial={{ scale: 1.12 }}
              animate={{ scale: 1 }}
              transition={{ duration: 1.8, ease: EASE }}
            />
            {/* Bottom-up vignette so headline has contrast */}
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--background)] via-[oklch(0.04_0.005_75/55%)] to-[oklch(0.04_0.005_75/15%)]" />
            {/* Left-edge accent gradient — bleeds event color into the corner */}
            <div
              className="absolute inset-y-0 left-0 w-2/3 pointer-events-none"
              style={{
                background:
                  "linear-gradient(105deg, var(--event-accent-soft, oklch(0.78 0.14 65 / 18%)) 0%, transparent 60%)",
              }}
            />
          </>
        ) : (
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(135deg, var(--event-accent-soft, oklch(0.78 0.14 65 / 22%)) 0%, var(--background) 60%)",
            }}
          />
        )}

        {/* Hero content — LEFT aligned, max-width controlled, generous bottom pad */}
        <div className="relative z-10 w-full">
          <div className="max-w-[1280px] mx-auto px-6 sm:px-10 lg:px-16 pb-16 sm:pb-24 lg:pb-32">
            <div className="max-w-[42rem]">
              <motion.p
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...t, delay: 0.25 }}
                className="eyebrow eyebrow-accent mb-6"
              >
                {i18n.youreInvited}
              </motion.p>

              <motion.h1
                initial={{ opacity: 0, y: 28 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1.0, ease: EASE, delay: 0.4 }}
                className="font-display font-extrabold tracking-[-0.045em] leading-[1.0] mb-7"
                style={{
                  fontSize: "clamp(2.75rem, 7.5vw, 6rem)",
                  textWrap: "balance",
                }}
              >
                {event.title}
              </motion.h1>

              {event.description && (
                <motion.p
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...t, delay: 0.6 }}
                  className="text-[var(--text-secondary)] font-light leading-[1.55] max-w-[36rem]"
                  style={{ fontSize: "clamp(1.0625rem, 1.4vw, 1.25rem)" }}
                >
                  {event.description}
                </motion.p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================
          INVITATION DETAILS — glass card overlap into hero
          ============================================================ */}
      <motion.section
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...t, delay: 0.75 }}
        className="relative z-10 px-6 sm:px-10 lg:px-16 -mt-12 sm:-mt-16"
      >
        <div className="max-w-[1280px] mx-auto">
          <GlassCard variant="elevated" className="p-6 sm:p-10">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8 sm:divide-x sm:divide-[var(--border)]">
              {event.eventDate && (
                <div className="sm:px-2 first:sm:pl-0 first:sm:pr-8">
                  <p className="eyebrow mb-3">When</p>
                  <p className="font-display text-xl sm:text-2xl font-semibold tracking-tight leading-[1.15] mb-1">
                    {format(new Date(event.eventDate), "EEEE, MMM d")}
                  </p>
                  <p className="text-sm text-[var(--text-tertiary)]">
                    {format(new Date(event.eventDate), "h:mm a")}
                  </p>
                  {/* V7-W4 — forecast pill for events ≤7 days out */}
                  {(() => {
                    const lat =
                      typeof (event as any).latitude === "number"
                        ? ((event as any).latitude as number)
                        : (event as any).locationLat
                        ? parseFloat((event as any).locationLat)
                        : undefined;
                    const lon =
                      typeof (event as any).longitude === "number"
                        ? ((event as any).longitude as number)
                        : (event as any).locationLng
                        ? parseFloat((event as any).locationLng)
                        : undefined;
                    if (
                      lat === undefined ||
                      lon === undefined ||
                      !Number.isFinite(lat) ||
                      !Number.isFinite(lon)
                    )
                      return null;
                    return (
                      <div className="mt-3">
                        <WeatherWidget
                          eventId={(event as any)._id}
                          latitude={lat}
                          longitude={lon}
                          eventDateMs={event.eventDate as number}
                        />
                      </div>
                    );
                  })()}
                </div>
              )}
              {event.locationName && (
                <div className="sm:px-8">
                  <p className="eyebrow mb-3">Where</p>
                  <p className="font-display text-xl sm:text-2xl font-semibold tracking-tight leading-[1.15] mb-1 line-clamp-1">
                    {event.locationName}
                  </p>
                  <p className="text-sm text-[var(--text-tertiary)] flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 opacity-60" />
                    Tap for directions
                  </p>
                </div>
              )}
              {counts && (
                <div className="sm:px-8 last:sm:pr-0">
                  <p className="eyebrow mb-3">Who</p>
                  <p className="font-display text-xl sm:text-2xl font-semibold tracking-tight leading-[1.15] mb-1">
                    {counts.attending} {i18n.attending}
                  </p>
                  <p className="text-sm text-[var(--text-tertiary)] flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 opacity-60" />
                    {counts.total} responded
                  </p>
                </div>
              )}
            </div>
          </GlassCard>
        </div>
      </motion.section>

      {/* ============================================================
          V10 WEDDING-TIER — FIND YOUR NAME
          Lets a guest who arrived via the shared portal link (no per-guest
          token, no claim) type their name and reveal THEIR personalized
          table / seat / host-shared notes. Hidden once a match is picked
          OR the visitor is already a claimed/signed-in guest.
          ============================================================ */}
      {!myClaimed && !isEventClosed && (
        <motion.section
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...t, delay: 0.85 }}
          className="relative z-10 px-6 sm:px-10 lg:px-16 py-12 sm:py-16"
        >
          <div className="max-w-[640px] mx-auto space-y-5">
            {!pickedGuest && (
              <>
                <div className="text-center space-y-2">
                  <p className="eyebrow eyebrow-accent">Find your details</p>
                  <h3 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight leading-[1.1]">
                    Type your name to see your table
                  </h3>
                </div>
                <input
                  type="text"
                  value={nameQuery}
                  onChange={(e) => setNameQuery(e.target.value)}
                  placeholder="Your name..."
                  className="glass-input w-full"
                  aria-label="Find your name"
                />
                {nameQuery.trim().length >= 2 && nameMatches && nameMatches.length > 0 && (
                  <GlassCard className="divide-y divide-[var(--border-hairline,oklch(1_0_0/8%))]">
                    {nameMatches.map((m) => (
                      <button
                        key={m._id}
                        onClick={() => {
                          setPickedGuest(m as GuestMatch);
                          // Prefill the RSVP name field too — saves a step.
                          if (!guestName) setGuestName(m.name);
                        }}
                        className="w-full text-left px-5 py-3 hover:bg-[oklch(1_0_0/4%)] transition-colors"
                      >
                        <p className="font-medium text-[var(--text-primary)]">{m.name}</p>
                        {m.tableNumber && (
                          <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                            Table {m.tableNumber}
                            {m.seatNumber ? ` · Seat ${m.seatNumber}` : ""}
                          </p>
                        )}
                      </button>
                    ))}
                  </GlassCard>
                )}
                {nameQuery.trim().length >= 2 && nameMatches && nameMatches.length === 0 && (
                  <p className="text-xs text-[var(--text-tertiary)] text-center">
                    No matches yet — keep typing or skip ahead to RSVP below.
                  </p>
                )}
              </>
            )}

            {pickedGuest && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: EASE }}
              >
                <GlassCard variant="elevated" className="p-6 sm:p-8 space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <p className="eyebrow">Welcome</p>
                      <p className="font-display text-2xl font-semibold tracking-tight">
                        {pickedGuest.name}
                      </p>
                    </div>
                    <button
                      onClick={() => { setPickedGuest(null); setNameQuery(""); }}
                      className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                      aria-label="Not me"
                    >
                      Not me
                    </button>
                  </div>
                  {pickedGuest.tableNumber && (
                    <p className="text-sm text-[var(--text-secondary)]">
                      Your table:{" "}
                      <span className="text-[var(--event-accent,var(--primary))] font-medium">
                        {pickedGuest.tableNumber}
                        {pickedGuest.seatNumber ? ` · Seat ${pickedGuest.seatNumber}` : ""}
                      </span>
                    </p>
                  )}
                  {pickedGuest.dietaryNotes && (
                    <p className="text-xs text-[var(--text-tertiary)]">
                      Dietary: {pickedGuest.dietaryNotes}
                    </p>
                  )}
                  {pickedGuest.guestNotes && (
                    <p className="text-sm text-[var(--text-secondary)] italic border-l-2 border-[var(--event-accent,var(--primary))] pl-3 mt-3">
                      From the host: {pickedGuest.guestNotes}
                    </p>
                  )}
                </GlassCard>
              </motion.div>
            )}
          </div>
        </motion.section>
      )}

      {/* ============================================================
          RSVP CLOSED NOTICE
          ============================================================ */}
      {isRsvpClosed && (
        <motion.section
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...t, delay: 0.9 }}
          className="relative z-10 px-6 sm:px-10 lg:px-16 py-24"
        >
          <div className="max-w-[640px] mx-auto">
            <GlassCard variant="elevated" className="p-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-[oklch(0.78_0.13_80/14%)] flex items-center justify-center mx-auto mb-6">
                <X className="w-8 h-8 text-[oklch(0.78_0.13_80)]" />
              </div>
              <h2 className="font-display text-3xl font-bold tracking-tight mb-4 leading-[1.1]">
                {isEventClosed ? i18n.rsvpClosed : isCapacityFull ? i18n.eventFull : i18n.rsvpDeadlinePassed}
              </h2>
              <p className="text-[var(--text-secondary)] leading-relaxed">
                {isEventClosed
                  ? (event?.status === "cancelled" ? i18n.cancelledMessage : i18n.eventNotActive)
                  : isCapacityFull
                  ? i18n.eventFull
                  : i18n.rsvpDeadlinePassed}
              </p>
            </GlassCard>
          </div>
        </motion.section>
      )}

      {/* ============================================================
          RSVP — THE CLIMAX
          ============================================================ */}
      {!isRsvpClosed && (
        <motion.section
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...t, delay: 0.9 }}
          className="relative z-10 px-6 sm:px-10 lg:px-16 py-24 sm:py-32"
        >
          <div className="max-w-[640px] mx-auto space-y-10">
            {/* V11 — personalized greeting for signed-in returning guests.
                Sits above the RSVP eyebrow so the page reads "Welcome back,
                Sarah. Your table: 7" before asking the question. */}
            {myClaimed && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: EASE }}
                className="text-center"
              >
                <GlassCard className="px-6 py-5 inline-block">
                  <p className="font-display text-lg sm:text-xl font-semibold tracking-tight">
                    Welcome back, {myClaimed.name}
                  </p>
                  {myClaimed.tableNumber && (
                    <p className="text-sm text-[var(--text-secondary)] mt-1">
                      Your table:{" "}
                      <span className="text-[var(--event-accent,var(--primary))] font-medium">
                        {myClaimed.tableNumber}
                        {myClaimed.seatNumber ? ` · Seat ${myClaimed.seatNumber}` : ""}
                      </span>
                    </p>
                  )}
                  {myClaimed.guestNotes && (
                    <p className="text-xs text-[var(--text-tertiary)] mt-2 max-w-sm">
                      {myClaimed.guestNotes}
                    </p>
                  )}
                </GlassCard>
              </motion.div>
            )}
            {/* Section eyebrow */}
            <div className="text-center space-y-4">
              <p className="eyebrow eyebrow-accent">{i18n.rsvpTitle}</p>
              <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-[-0.04em] leading-[1.05]">
                Will you be there?
              </h2>
            </div>

            {/* Capacity / deadline strip */}
            {((event?.maxCapacity && event.maxCapacity > 0) || event?.rsvpDeadline) && (
              <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-[var(--text-tertiary)]">
                {event?.maxCapacity && event.maxCapacity > 0 && counts && (
                  <span className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-[var(--event-accent,var(--primary))]" />
                    {event.maxCapacity - counts.attending} {i18n.spotsRemaining}
                  </span>
                )}
                {event?.rsvpDeadline && (
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-[var(--event-accent,var(--primary))]" />
                    {i18n.deadline} {format(new Date(event.rsvpDeadline), "MMM d 'at' h:mm a")}
                  </span>
                )}
              </div>
            )}

            {/* Status selection — the three big choices */}
            <div className="flex justify-center gap-3 sm:gap-4">
              {([
                { value: "attending" as const, icon: Heart, label: i18n.attending },
                { value: "maybe" as const, icon: HelpCircle, label: i18n.maybe },
                { value: "declined" as const, icon: X, label: i18n.declined },
              ]).map(({ value, icon: Icon, label }) => {
                const active = status === value;
                const styles = RSVP_OPTION_STYLES[value];
                return (
                  <button
                    key={value}
                    onClick={() => setStatus(value)}
                    className={`relative flex flex-col items-center gap-2.5 px-5 sm:px-7 py-5 rounded-2xl border-2 transition-all duration-[600ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
                      active
                        ? `${styles.bgActive} ${styles.borderActive} ${styles.shadowActive}`
                        : "bg-[oklch(1_0_0/3%)] border-transparent hover:bg-[oklch(1_0_0/6%)]"
                    }`}
                    aria-pressed={active}
                  >
                    <Icon
                      className={`w-6 h-6 transition-colors duration-[200ms] ${
                        active ? styles.iconActive : "text-[var(--text-muted)]"
                      }`}
                    />
                    <span
                      className={`text-xs font-semibold tracking-wide transition-colors duration-[200ms] ${
                        active ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)]"
                      }`}
                    >
                      {label}
                    </span>
                    {active && (
                      <motion.div
                        layoutId="rsvp-indicator"
                        className={`absolute -bottom-1 w-8 h-1 rounded-full ${styles.underline}`}
                        transition={{ type: "spring", stiffness: 300, damping: 25 }}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Name + email */}
            <GlassCard className="p-8 space-y-5">
              <div>
                <label className="eyebrow block mb-3" htmlFor="guest-name">
                  {i18n.yourName} <span className="text-[var(--event-accent,var(--primary))]">*</span>
                </label>
                <input
                  id="guest-name"
                  type="text"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder={i18n.yourName}
                  className="glass-input text-lg"
                  autoFocus
                />
              </div>
              <div>
                <label className="eyebrow block mb-3" htmlFor="guest-email">
                  {i18n.yourEmail}
                </label>
                <input
                  id="guest-email"
                  type="email"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="glass-input"
                />
              </div>
            </GlassCard>

            {/* Plus-ones + message (collapsed by default) */}
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="w-full flex items-center justify-between px-5 py-4 rounded-2xl bg-[oklch(1_0_0/3%)] border border-[var(--border)] text-sm text-[var(--text-tertiary)] hover:bg-[oklch(1_0_0/5%)] hover:text-[var(--text-secondary)] transition-colors duration-[200ms]"
            >
              <span>{i18n.plusOnes} & {i18n.message}</span>
              <motion.div
                animate={{ rotate: showDetails ? 180 : 0 }}
                transition={{ duration: 0.3, ease: EASE }}
              >
                <ChevronDown className="w-4 h-4" />
              </motion.div>
            </button>

            <AnimatePresence>
              {showDetails && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={t}
                  className="overflow-hidden"
                >
                  <GlassCard className="p-8 space-y-5">
                    <div>
                      <label className="eyebrow block mb-3">{i18n.plusOnes}</label>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setPlusOnes(Math.max(0, plusOnes - 1))}
                          className="w-11 h-11 rounded-xl bg-[oklch(1_0_0/4%)] border border-[var(--border)] flex items-center justify-center text-lg hover:bg-[oklch(1_0_0/8%)] transition-colors duration-[200ms]"
                          aria-label="Decrease plus-ones"
                        >
                          −
                        </button>
                        <span className="font-display text-2xl font-semibold w-10 text-center tabular-nums">
                          {plusOnes}
                        </span>
                        <button
                          onClick={() => setPlusOnes(Math.min(10, plusOnes + 1))}
                          className="w-11 h-11 rounded-xl bg-[oklch(1_0_0/4%)] border border-[var(--border)] flex items-center justify-center text-lg hover:bg-[oklch(1_0_0/8%)] transition-colors duration-[200ms]"
                          aria-label="Increase plus-ones"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="eyebrow block mb-3">{i18n.message}</label>
                      <textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder={i18n.messagePlaceholder}
                        rows={3}
                        className="glass-input resize-none"
                      />
                    </div>
                  </GlassCard>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Survey questions */}
            {surveyConfig.length > 0 && (
              <GlassCard className="p-8 space-y-6">
                <p className="eyebrow flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-[var(--event-accent,var(--primary))]" />
                  Questions from your host
                </p>
                {surveyConfig.map((q) => (
                  <div key={q.id}>
                    <label className="text-sm font-medium mb-3 block">
                      {q.label}
                      {q.required && (
                        <span className="text-[var(--destructive)] ml-1">*</span>
                      )}
                    </label>
                    {q.type === "text" ? (
                      <input
                        type="text"
                        value={surveyAnswers[q.label] || ""}
                        onChange={(e) =>
                          setSurveyAnswers((prev) => ({ ...prev, [q.label]: e.target.value }))
                        }
                        className="glass-input"
                        placeholder="Your answer"
                      />
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {(q.options || []).map((opt) => {
                          const selected = surveyAnswers[q.label] === opt;
                          return (
                            <button
                              key={opt}
                              onClick={() =>
                                setSurveyAnswers((prev) => ({ ...prev, [q.label]: opt }))
                              }
                              className={`px-4 py-2.5 rounded-xl text-sm transition-all duration-[200ms] border ${
                                selected
                                  ? "bg-[var(--event-accent-soft,var(--primary-soft))] text-[var(--event-accent,var(--primary))] border-[var(--event-accent,var(--primary))]"
                                  : "bg-[oklch(1_0_0/4%)] text-[var(--text-secondary)] border-[var(--border)] hover:bg-[oklch(1_0_0/7%)]"
                              }`}
                            >
                              {selected && <Check className="w-3 h-3 inline mr-1" />}
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </GlassCard>
            )}

            {/* Submit — the climax */}
            <div className="pt-4">
              <LiquidButton
                onClick={handleSubmit}
                loading={submitMutation.isPending}
                disabled={!guestName.trim() || !token}
                size="xl"
                className="w-full gap-3"
              >
                {status === "attending" ? (
                  <>
                    <Heart className="w-5 h-5" />
                    {i18n.attending}
                  </>
                ) : status === "maybe" ? (
                  <>
                    <HelpCircle className="w-5 h-5" />
                    {i18n.maybe}
                  </>
                ) : (
                  <>
                    <X className="w-5 h-5" />
                    {i18n.declined}
                  </>
                )}
              </LiquidButton>
            </div>

            {/* Footer */}
            <div className="text-center pt-12">
              <p className="font-display text-sm tracking-[0.18em] uppercase text-[var(--text-faint)]">
                IVARI
              </p>
            </div>
          </div>
        </motion.section>
      )}
      </div>
    </div>
  );
}
