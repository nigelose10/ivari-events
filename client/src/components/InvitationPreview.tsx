/**
 * InvitationPreview — host-facing animated preview of the guest invitation.
 *
 * Plays the wax-seal EnvelopeReveal animation, then transitions to a polished
 * invitation card showing what the guest will actually see (hero image, title,
 * date/location, description, RSVP CTA — all preview-only, the RSVP is inert).
 *
 * Used from:
 *  - Pulse.tsx — Camera icon button on the event header
 *  - Forge.tsx — secondary "Preview" button on the Launch step
 *
 * Visual language: warm amber palette, GlassCard surfaces, ambient warm radial
 * glow, subtle floating particles. Premium / Apple-Invites quality.
 */
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, MapPin, X, RotateCw, Eye, Sparkles, Check } from "lucide-react";
import { format } from "date-fns";
import { GlassCard } from "@/components/GlassCard";
import { EnvelopeReveal } from "@/components/EnvelopeReveal";

const EASE = [0.22, 1, 0.36, 1] as const;
const DEFAULT_ACCENT = "oklch(0.78 0.14 65)";

export interface InvitationPreviewEvent {
  _id?: string;
  title: string;
  description?: string | null;
  eventDate?: number | null;
  locationName?: string | null;
  themeColor?: string | null;
  imageUrl?: string | null;
}

interface InvitationPreviewProps {
  event: InvitationPreviewEvent;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Stage = "envelope" | "card";

/** A handful of warm-amber motes that drift slowly behind the card. Pure
 *  decoration — pointer-events disabled, randomized per mount. */
function ParticleField({ accent }: { accent: string }) {
  const motes = useMemo(
    () =>
      Array.from({ length: 14 }).map((_, i) => ({
        id: i,
        left: Math.random() * 100,
        top: Math.random() * 100,
        size: 2 + Math.random() * 4,
        drift: 20 + Math.random() * 40,
        duration: 14 + Math.random() * 10,
        delay: Math.random() * 6,
        opacity: 0.18 + Math.random() * 0.32,
      })),
    [],
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {motes.map((m) => (
        <motion.div
          key={m.id}
          className="absolute rounded-full"
          style={{
            left: `${m.left}%`,
            top: `${m.top}%`,
            width: m.size,
            height: m.size,
            background: accent,
            boxShadow: `0 0 ${m.size * 3}px ${accent}`,
            opacity: m.opacity,
          }}
          animate={{
            y: [0, -m.drift, 0],
            x: [0, m.drift / 2, 0],
            opacity: [m.opacity, m.opacity * 1.6, m.opacity],
          }}
          transition={{
            duration: m.duration,
            delay: m.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

export function InvitationPreview({ event, open, onOpenChange }: InvitationPreviewProps) {
  const [stage, setStage] = useState<Stage>("envelope");
  // Bumping `revealKey` remounts EnvelopeReveal so the animation replays from
  // scratch even though the host hasn't navigated away.
  const [revealKey, setRevealKey] = useState(0);

  // Reset to the envelope every time the modal is reopened so each preview
  // starts at the wax-seal stamp.
  useEffect(() => {
    if (open) {
      setStage("envelope");
      setRevealKey((k) => k + 1);
    }
  }, [open]);

  // Lock background scroll while the overlay is mounted.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // ESC closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const accent = event.themeColor || DEFAULT_ACCENT;
  const truncatedDescription = useMemo(() => {
    const d = event.description ?? "";
    if (d.length <= 200) return d;
    return d.slice(0, 200).replace(/\s+\S*$/, "") + "…";
  }, [event.description]);

  const handleReplay = () => {
    setStage("envelope");
    setRevealKey((k) => k + 1);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="invitation-preview"
          className="fixed inset-0 z-[200] overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: EASE }}
          role="dialog"
          aria-modal="true"
          aria-label={`Preview invitation for ${event.title}`}
        >
          {/* Deep warm backdrop */}
          <div className="absolute inset-0 bg-[oklch(0.04_0.005_75)]" />

          {/* Ambient warm-amber radial glow */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `radial-gradient(circle at 50% 45%, ${accent.replace(/\)$/, " / 22%)")} 0%, transparent 60%)`,
            }}
          />

          {/* Drifting particles */}
          <ParticleField accent={accent} />

          {/* Preview Mode pill */}
          <motion.div
            className="absolute top-5 left-1/2 -translate-x-1/2 z-50"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15, ease: EASE }}
          >
            <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-[oklch(1_0_0/6%)] border border-[oklch(1_0_0/10%)] backdrop-blur-md text-[0.7rem] tracking-[0.18em] uppercase text-[var(--text-secondary,oklch(0.7_0.04_70))]">
              <Eye className="w-3.5 h-3.5" />
              <span>Preview Mode</span>
            </div>
          </motion.div>

          {/* Close (top-right) */}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="absolute top-5 right-5 z-50 p-2 rounded-full bg-[oklch(1_0_0/4%)] border border-[oklch(1_0_0/8%)] backdrop-blur-md text-[var(--text-secondary,oklch(0.7_0.04_70))] hover:text-foreground hover:bg-[oklch(1_0_0/10%)] transition-colors duration-300"
            aria-label="Close preview"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Stage 1: Envelope reveal — own its own z-layer above particles */}
          <AnimatePresence>
            {stage === "envelope" && (
              <motion.div
                key={`reveal-${revealKey}`}
                className="absolute inset-0 z-30"
                initial={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                <EnvelopeReveal
                  eventTitle={event.title}
                  themeColor={accent}
                  onComplete={() => setStage("card")}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Stage 2: Invitation card */}
          <AnimatePresence>
            {stage === "card" && (
              <motion.div
                key="card-stage"
                className="absolute inset-0 z-20 flex items-center justify-center px-4 sm:px-6 py-20 overflow-y-auto"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5, ease: EASE }}
              >
                <motion.div
                  initial={{ opacity: 0, y: 28, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.7, ease: EASE, delay: 0.1 }}
                  className="w-full max-w-md"
                >
                  <GlassCard
                    variant="elevated"
                    specular
                    className="overflow-hidden"
                    style={{ ["--event-accent" as any]: accent }}
                  >
                    {/* Hero — image or warm amber gradient */}
                    <div className="relative aspect-[4/5] sm:aspect-[16/11] overflow-hidden">
                      {event.imageUrl ? (
                        <>
                          <img
                            src={event.imageUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-[oklch(0.06_0.02_60/95%)] via-[oklch(0.06_0.02_60/40%)] to-transparent" />
                        </>
                      ) : (
                        <div
                          className="absolute inset-0"
                          style={{
                            background: `radial-gradient(ellipse at 30% 20%, ${accent.replace(/\)$/, " / 55%)")} 0%, transparent 60%), linear-gradient(135deg, oklch(0.22 0.06 55) 0%, oklch(0.10 0.03 55) 100%)`,
                          }}
                        >
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Sparkles
                              className="w-12 h-12 opacity-30"
                              style={{ color: accent }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Eyebrow + title overlaid on hero */}
                      <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-6">
                        <p
                          className="text-[0.65rem] font-semibold tracking-[0.22em] uppercase mb-2"
                          style={{ color: accent }}
                        >
                          You're invited to
                        </p>
                        <h2
                          className="font-display text-2xl sm:text-3xl font-bold tracking-[-0.025em] text-foreground leading-tight"
                          style={{ textShadow: "0 2px 18px oklch(0 0 0 / 55%)" }}
                        >
                          {event.title}
                        </h2>
                      </div>
                    </div>

                    {/* Body */}
                    <div className="p-5 sm:p-6 space-y-5">
                      {/* Date + location pills */}
                      <div className="flex flex-wrap gap-2">
                        {event.eventDate && (
                          <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-[oklch(1_0_0/4%)] border border-[oklch(1_0_0/8%)] text-[var(--text-secondary,oklch(0.7_0.04_70))]">
                            <Calendar className="w-3.5 h-3.5" style={{ color: accent }} />
                            {format(new Date(event.eventDate), "EEE, MMM d • h:mm a")}
                          </span>
                        )}
                        {event.locationName && (
                          <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-[oklch(1_0_0/4%)] border border-[oklch(1_0_0/8%)] text-[var(--text-secondary,oklch(0.7_0.04_70))]">
                            <MapPin className="w-3.5 h-3.5" style={{ color: accent }} />
                            {event.locationName}
                          </span>
                        )}
                      </div>

                      {truncatedDescription && (
                        <p className="text-sm leading-relaxed text-[var(--text-secondary,oklch(0.7_0.04_70))] font-light">
                          {truncatedDescription}
                        </p>
                      )}

                      {/* Inert RSVP CTA — preview only */}
                      <button
                        type="button"
                        disabled
                        aria-disabled="true"
                        title="Preview only — RSVP is disabled"
                        className="w-full mt-1 px-6 py-3.5 rounded-full font-semibold text-sm tracking-[0.02em] flex items-center justify-center gap-2 cursor-not-allowed transition-all duration-300"
                        style={{
                          background: `linear-gradient(135deg, ${accent}, ${accent.replace(/\)$/, " / 75%)")})`,
                          color: "#0A0A0A",
                          boxShadow: `0 0 32px ${accent.replace(/\)$/, " / 30%)")}, 0 8px 24px ${accent.replace(/\)$/, " / 18%)")}`,
                        }}
                      >
                        <Check className="w-4 h-4" />
                        RSVP
                      </button>
                    </div>
                  </GlassCard>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Replay button (bottom-right) — only after the reveal completes */}
          <AnimatePresence>
            {stage === "card" && (
              <motion.button
                key="replay"
                type="button"
                onClick={handleReplay}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ duration: 0.4, ease: EASE, delay: 0.3 }}
                className="absolute bottom-12 right-5 z-50 flex items-center gap-2 px-4 py-2 rounded-full bg-[oklch(1_0_0/4%)] border border-[oklch(1_0_0/8%)] backdrop-blur-md text-xs tracking-[0.14em] uppercase text-[var(--text-secondary,oklch(0.7_0.04_70))] hover:text-foreground hover:bg-[oklch(1_0_0/10%)] transition-colors duration-300"
              >
                <RotateCw className="w-3.5 h-3.5" />
                Replay
              </motion.button>
            )}
          </AnimatePresence>

          {/* Footer caption */}
          <motion.p
            className="absolute bottom-4 left-0 right-0 z-40 text-center text-[0.7rem] tracking-[0.16em] uppercase text-[var(--text-faint,oklch(0.5_0.03_70))] pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.4, ease: EASE }}
          >
            This is what your guests will see
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default InvitationPreview;
