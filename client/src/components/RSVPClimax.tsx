/**
 * RSVPClimax — full-screen cinematic confirmation after a guest submits RSVP.
 *
 * "attending" / "maybe":
 *   0–400    radial amber glow expands; ribbon descends with cursive headline
 *   400–800  event title fades up below
 *   800–1200 date + location pills stagger in
 *   1200+    three CTAs appear: Add to Calendar, Open in Maps, Done
 *   passive  5s auto-close timer (cleared on user interaction)
 *
 * "declined": graceful "Thanks for letting us know" fade. No CTAs.
 *
 * Particle drift in the background uses a small motion.div array. Respects
 * prefers-reduced-motion by suppressing particles + collapsing the timeline.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { format } from "date-fns";
import { Calendar, MapPin, Check, X } from "lucide-react";
import { GlassCard } from "@/components/GlassCard";
import { LiquidButton } from "@/components/LiquidButton";
import { icsDataUrl } from "@/lib/calendarLink";
import { detectPlatformMapUrl } from "@/lib/mapsLink";

export type ClimaxStatus = "attending" | "maybe" | "declined";

interface RSVPClimaxProps {
  event: {
    title: string;
    eventDate?: number;
    locationName?: string;
    description?: string;
    durationMinutes?: number;
    themeColor?: string;
  };
  rsvpStatus: ClimaxStatus;
  onClose: () => void;
}

const EASE = [0.22, 1, 0.36, 1] as const;
const PARTICLE_COUNT = 18;

export function RSVPClimax({ event, rsvpStatus, onClose }: RSVPClimaxProps) {
  const reduced = useReducedMotion();
  const [interacted, setInteracted] = useState(false);
  const closedRef = useRef(false);

  const safeClose = () => {
    if (closedRef.current) return;
    closedRef.current = true;
    onClose();
  };

  // Passive 5s auto-close — only when user hasn't touched anything.
  useEffect(() => {
    if (interacted) return;
    const id = window.setTimeout(safeClose, 5000);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interacted]);

  // Lock body scroll while overlay is up.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const calendarHref = useMemo(() => {
    if (!event.eventDate) return undefined;
    return icsDataUrl({
      title: event.title,
      description: event.description,
      eventDate: event.eventDate,
      durationMinutes: event.durationMinutes,
      location: event.locationName,
    });
  }, [event.title, event.description, event.eventDate, event.durationMinutes, event.locationName]);

  const mapsHref = useMemo(() => {
    if (!event.locationName) return undefined;
    return detectPlatformMapUrl(event.locationName);
  }, [event.locationName]);

  const particles = useMemo(() => {
    if (reduced) return [];
    return Array.from({ length: PARTICLE_COUNT }).map((_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 2.5,
      duration: 6 + Math.random() * 5,
      size: 2 + Math.random() * 3,
      opacity: 0.25 + Math.random() * 0.45,
    }));
  }, [reduced]);

  const isCelebratory = rsvpStatus === "attending" || rsvpStatus === "maybe";
  const headline = rsvpStatus === "attending"
    ? "You're confirmed"
    : rsvpStatus === "maybe"
    ? "We'll save your seat"
    : "Thanks for letting us know";

  const sub = rsvpStatus === "attending"
    ? "We can't wait to see you there."
    : rsvpStatus === "maybe"
    ? "Let us know once your plans firm up."
    : "Your kindness in responding means a lot.";

  return (
    <AnimatePresence>
      <motion.div
        key="rsvp-climax"
        className="fixed inset-0 z-[120] flex items-center justify-center px-6 sm:px-10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.45, ease: EASE }}
        role="dialog"
        aria-modal="true"
        aria-label={`RSVP ${rsvpStatus}`}
      >
        {/* Dark base */}
        <div className="absolute inset-0 bg-[oklch(0.04_0.005_75/92%)] backdrop-blur-2xl" />

        {/* Radial amber glow */}
        <motion.div
          className="absolute inset-0 pointer-events-none"
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: isCelebratory ? 1 : 0.5, scale: 1 }}
          transition={{ duration: reduced ? 0.4 : 1.2, ease: EASE }}
          style={{
            background:
              isCelebratory
                ? `radial-gradient(circle at 50% 45%, oklch(0.55 0.16 55 / 36%) 0%, oklch(0.30 0.10 45 / 18%) 35%, transparent 70%)`
                : `radial-gradient(circle at 50% 45%, oklch(0.30 0.05 50 / 30%) 0%, transparent 65%)`,
          }}
        />

        {/* Particles */}
        {isCelebratory && particles.map((p) => (
          <motion.div
            key={p.id}
            className="absolute pointer-events-none rounded-full"
            style={{
              left: `${p.left}%`,
              bottom: -10,
              width: p.size,
              height: p.size,
              background: "oklch(0.92 0.06 65)",
              boxShadow: "0 0 6px oklch(0.85 0.10 60 / 60%)",
            }}
            initial={{ y: 0, opacity: 0 }}
            animate={{
              y: -window.innerHeight - 40,
              opacity: [0, p.opacity, p.opacity, 0],
            }}
            transition={{
              duration: p.duration,
              delay: p.delay,
              ease: "linear",
              repeat: Infinity,
              times: [0, 0.1, 0.85, 1],
            }}
          />
        ))}

        {/* Content stage */}
        <motion.div
          className="relative z-10 w-full max-w-xl text-center"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE, delay: 0.1 }}
          onMouseDown={() => setInteracted(true)}
          onTouchStart={() => setInteracted(true)}
        >
          {isCelebratory ? (
            <>
              {/* Ribbon descends from top */}
              <motion.div
                className="mx-auto mb-7 inline-flex items-center gap-3 px-7 py-2.5 rounded-full"
                initial={{ y: -120, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: reduced ? 0.3 : 0.55, ease: EASE }}
                style={{
                  background:
                    "linear-gradient(180deg, oklch(0.40 0.15 25) 0%, oklch(0.32 0.13 22) 100%)",
                  boxShadow:
                    "0 12px 40px oklch(0 0 0 / 48%), inset 0 1px 0 oklch(1 0 0 / 18%)",
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: "oklch(0.92 0.08 60)" }}
                />
                <h2
                  className="font-serif italic text-[oklch(0.96_0.04_70)] leading-none"
                  style={{
                    fontFamily: '"Cormorant Garamond", Georgia, serif',
                    fontSize: "clamp(1.25rem, 2.4vw, 1.75rem)",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {headline}
                </h2>
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: "oklch(0.92 0.08 60)" }}
                />
              </motion.div>

              {/* Event title */}
              <motion.h1
                className="font-display font-extrabold tracking-[-0.045em] leading-[1.0] mb-6"
                style={{
                  fontSize: "clamp(2.25rem, 6vw, 4rem)",
                  textWrap: "balance",
                }}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: EASE, delay: reduced ? 0.05 : 0.4 }}
              >
                {event.title}
              </motion.h1>

              {/* Subtitle */}
              <motion.p
                className="text-[var(--text-secondary)] mb-8"
                style={{ fontSize: "clamp(0.9375rem, 1.4vw, 1.0625rem)" }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: reduced ? 0.1 : 0.55 }}
              >
                {sub}
              </motion.p>

              {/* Pills */}
              <motion.div
                className="flex flex-wrap items-center justify-center gap-2.5 mb-10"
                initial="hidden"
                animate="visible"
                variants={{
                  hidden: {},
                  visible: { transition: { staggerChildren: 0.1, delayChildren: reduced ? 0.1 : 0.8 } },
                }}
              >
                {event.eventDate && (
                  <motion.span
                    variants={{
                      hidden: { opacity: 0, y: 10 },
                      visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs tracking-wide bg-[oklch(1_0_0/5%)] border border-[oklch(1_0_0/10%)] text-[var(--text-secondary)]"
                  >
                    <Calendar className="w-3.5 h-3.5 opacity-70" />
                    {format(new Date(event.eventDate), "EEE, MMM d · h:mm a")}
                  </motion.span>
                )}
                {event.locationName && (
                  <motion.span
                    variants={{
                      hidden: { opacity: 0, y: 10 },
                      visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs tracking-wide bg-[oklch(1_0_0/5%)] border border-[oklch(1_0_0/10%)] text-[var(--text-secondary)] max-w-[16rem] truncate"
                  >
                    <MapPin className="w-3.5 h-3.5 opacity-70" />
                    {event.locationName}
                  </motion.span>
                )}
              </motion.div>

              {/* CTAs */}
              <motion.div
                className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: EASE, delay: reduced ? 0.15 : 1.2 }}
              >
                {calendarHref && (
                  <a
                    href={calendarHref}
                    download={`${event.title.replace(/[^\w\-]+/g, "_")}.ics`}
                    onClick={() => setInteracted(true)}
                    className="inline-flex"
                  >
                    <LiquidButton variant="primary" size="lg" className="gap-2 w-full sm:w-auto">
                      <Calendar className="w-4 h-4" />
                      Add to Calendar
                    </LiquidButton>
                  </a>
                )}
                {mapsHref && (
                  <a
                    href={mapsHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setInteracted(true)}
                    className="inline-flex"
                  >
                    <LiquidButton variant="glass" size="lg" className="gap-2 w-full sm:w-auto">
                      <MapPin className="w-4 h-4" />
                      Open in Maps
                    </LiquidButton>
                  </a>
                )}
                <LiquidButton
                  variant="ghost"
                  size="lg"
                  onClick={() => { setInteracted(true); safeClose(); }}
                  className="gap-2"
                >
                  <Check className="w-4 h-4" />
                  Done
                </LiquidButton>
              </motion.div>
            </>
          ) : (
            // Declined — graceful farewell
            <GlassCard variant="elevated" className="p-12 sm:p-14">
              <motion.div
                className="w-16 h-16 rounded-2xl mx-auto mb-6 flex items-center justify-center bg-[oklch(0.66_0.20_28/14%)]"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.5, ease: EASE }}
              >
                <X className="w-7 h-7 text-[oklch(0.7_0.15_25)]" />
              </motion.div>
              <h2
                className="font-display font-bold tracking-[-0.03em] leading-[1.05] mb-4"
                style={{ fontSize: "clamp(1.75rem, 3.6vw, 2.5rem)" }}
              >
                {headline}
              </h2>
              <p className="text-[var(--text-secondary)] leading-relaxed mb-8">
                {sub}
              </p>
              <LiquidButton
                variant="glass"
                size="lg"
                onClick={() => { setInteracted(true); safeClose(); }}
              >
                Close
              </LiquidButton>
            </GlassCard>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default RSVPClimax;
