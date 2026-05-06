/**
 * EnvelopeReveal — first-visit wax-seal letter animation for the guest portal.
 *
 * Sequence (timings in ms):
 *   0–200    ambient black fade in
 *   200–1200 wax seal stamps down with a satisfying spring
 *   1200–1800 hairline cracks propagate from seal center
 *   1800–2400 seal shatters into ~6 pieces (rotated, gravity-fall)
 *   2400–3200 background curtain pulls apart vertically, revealing portal
 *   3200      onComplete()
 *
 * Skip button appears after 800ms top-right. Respects prefers-reduced-motion
 * by collapsing the whole sequence to a quick fade.
 *
 * Palette: warm amber/copper. Wax seal is a deep rose-burgundy
 * `oklch(0.40 0.15 25)`; the accent border draws from the event's themeColor.
 */
import { useEffect, useMemo, useReducer, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

interface EnvelopeRevealProps {
  eventTitle: string;
  themeColor: string;
  onComplete: () => void;
}

type Phase = "stamp" | "crack" | "shatter" | "curtain" | "done";

const SEAL_COLOR = "oklch(0.40 0.15 25)";
const SEAL_HIGHLIGHT = "oklch(0.55 0.18 30)";
const SEAL_SHADOW = "oklch(0.28 0.12 22)";

/** Six shard polygon paths inside a 200×200 viewBox, stamped at the seal's
 *  position. Roughly pie-cut so the explosion reads as a broken disk. */
const SHARDS: { d: string; tx: number; ty: number; rot: number }[] = [
  { d: "M100 100 L100 0 L160 28 Z", tx: 220, ty: -160, rot: 65 },
  { d: "M100 100 L160 28 L196 100 Z", tx: 280, ty: -40, rot: 110 },
  { d: "M100 100 L196 100 L160 172 Z", tx: 240, ty: 200, rot: 175 },
  { d: "M100 100 L160 172 L40 172 Z", tx: -10, ty: 260, rot: -160 },
  { d: "M100 100 L40 172 L4 100 Z", tx: -260, ty: 180, rot: -110 },
  { d: "M100 100 L4 100 L40 28 L100 0 Z", tx: -240, ty: -190, rot: -55 },
];

/** Three radial cracks. Drawn from center outward; we reveal via dashoffset. */
const CRACKS = [
  "M100 100 L18 22",
  "M100 100 L186 36",
  "M100 100 L60 198",
  "M100 100 L172 184",
  "M100 100 L8 132",
];

export function EnvelopeReveal({ eventTitle, themeColor, onComplete }: EnvelopeRevealProps) {
  const reduced = useReducedMotion();
  const [phase, setPhase] = useReducer(
    (_: Phase, next: Phase) => next,
    "stamp" as Phase
  );
  const [showSkip, setShowSkip] = useReducer(() => true, false);
  const completedRef = useRef(false);

  const safeComplete = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete();
  };

  // Drive the phase machine on mount.
  useEffect(() => {
    if (reduced) {
      const t = window.setTimeout(safeComplete, 350);
      return () => window.clearTimeout(t);
    }
    const timers: number[] = [];
    timers.push(window.setTimeout(() => setShowSkip(), 800));
    timers.push(window.setTimeout(() => setPhase("crack"), 1200));
    timers.push(window.setTimeout(() => setPhase("shatter"), 1800));
    timers.push(window.setTimeout(() => setPhase("curtain"), 2400));
    timers.push(window.setTimeout(() => {
      setPhase("done");
      safeComplete();
    }, 3200));
    return () => { timers.forEach((id) => window.clearTimeout(id)); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  // Reduced-motion: short, tasteful fade.
  if (reduced) {
    return (
      <motion.div
        className="fixed inset-0 z-[100] bg-[oklch(0.04_0.005_75)] flex items-center justify-center"
        initial={{ opacity: 1 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 0.35, delay: 0.05 }}
        onAnimationComplete={safeComplete}
        aria-hidden
      >
        <div className="font-display text-2xl text-[var(--text-secondary)] tracking-[-0.02em]">
          {eventTitle}
        </div>
      </motion.div>
    );
  }

  const accentColor = themeColor;
  const showStamp = phase === "stamp" || phase === "crack" || phase === "shatter";
  const showCracks = phase === "crack" || phase === "shatter";
  const isShattering = phase === "shatter" || phase === "curtain" || phase === "done";
  const curtainOpen = phase === "curtain" || phase === "done";

  const skipLabel = useMemo(() => "Skip animation", []);

  return (
    <div
      className="fixed inset-0 z-[100] overflow-hidden pointer-events-auto"
      role="presentation"
      aria-label={`Opening invitation for ${eventTitle}`}
    >
      {/* Ambient black backdrop — fades in 0–200ms */}
      <motion.div
        className="absolute inset-0 bg-[oklch(0.04_0.005_75)]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      />

      {/* Soft warm radial behind the seal so the page never feels flat */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.45 }}
        transition={{ duration: 0.6, delay: 0.1 }}
        style={{
          background:
            `radial-gradient(circle at 50% 50%, oklch(0.32 0.10 45 / 60%) 0%, transparent 55%)`,
        }}
      />

      {/* Vertical curtain — two halves that pull apart at 2400ms */}
      <motion.div
        className="absolute inset-y-0 left-0 w-1/2 bg-[oklch(0.04_0.005_75)] origin-left z-20 pointer-events-none"
        initial={{ x: 0 }}
        animate={{ x: curtainOpen ? "-100%" : 0 }}
        transition={{ duration: 0.8, ease: [0.65, 0, 0.35, 1] }}
        style={{
          boxShadow: "inset -1px 0 0 oklch(1 0 0 / 4%)",
        }}
      />
      <motion.div
        className="absolute inset-y-0 right-0 w-1/2 bg-[oklch(0.04_0.005_75)] origin-right z-20 pointer-events-none"
        initial={{ x: 0 }}
        animate={{ x: curtainOpen ? "100%" : 0 }}
        transition={{ duration: 0.8, ease: [0.65, 0, 0.35, 1] }}
        style={{
          boxShadow: "inset 1px 0 0 oklch(1 0 0 / 4%)",
        }}
      />

      {/* Stage — wax seal + cracks + shards live here, all centered */}
      <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
        {/* Subtle event title underneath */}
        <motion.p
          className="absolute font-display italic text-[var(--text-secondary)] tracking-[-0.01em]"
          style={{ top: "calc(50% + 110px)", fontSize: "clamp(0.95rem, 1.6vw, 1.15rem)" }}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: showStamp ? 0.7 : 0, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          {eventTitle}
        </motion.p>

        <AnimatePresence>
          {showStamp && (
            <motion.div
              key="seal"
              className="relative"
              style={{ width: 200, height: 200 }}
              initial={{ y: -340, scale: 1.25, rotate: -8, opacity: 0 }}
              animate={{
                y: 0,
                scale: 1,
                rotate: 0,
                opacity: 1,
              }}
              exit={{ opacity: 0, transition: { duration: 0.2 } }}
              transition={{
                type: "spring",
                damping: 12,
                stiffness: 100,
                mass: 0.9,
              }}
            >
              <svg
                viewBox="0 0 200 200"
                className="w-full h-full overflow-visible"
                style={{
                  filter: "drop-shadow(0 18px 30px oklch(0 0 0 / 55%))",
                }}
              >
                <defs>
                  <radialGradient id="er-seal-fill" cx="38%" cy="32%" r="78%">
                    <stop offset="0%" stopColor={SEAL_HIGHLIGHT} />
                    <stop offset="55%" stopColor={SEAL_COLOR} />
                    <stop offset="100%" stopColor={SEAL_SHADOW} />
                  </radialGradient>
                  <radialGradient id="er-seal-spec" cx="35%" cy="28%" r="35%">
                    <stop offset="0%" stopColor="oklch(1 0 0 / 50%)" />
                    <stop offset="100%" stopColor="oklch(1 0 0 / 0%)" />
                  </radialGradient>
                </defs>

                {!isShattering ? (
                  <g>
                    {/* Drip lobes around the seal — gives it that "molten poured" feel */}
                    <circle cx="100" cy="100" r="92" fill={SEAL_SHADOW} opacity="0.55" />
                    <circle cx="100" cy="100" r="86" fill="url(#er-seal-fill)" />
                    {/* outer notched ring (12 small lobes) */}
                    {Array.from({ length: 12 }).map((_, i) => {
                      const a = (i / 12) * Math.PI * 2;
                      const cx = 100 + Math.cos(a) * 86;
                      const cy = 100 + Math.sin(a) * 86;
                      return <circle key={i} cx={cx} cy={cy} r="9" fill={SEAL_COLOR} />;
                    })}
                    {/* accent ring drawn from event theme color */}
                    <circle
                      cx="100"
                      cy="100"
                      r="68"
                      fill="none"
                      stroke={accentColor}
                      strokeOpacity="0.55"
                      strokeWidth="1.2"
                    />
                    {/* serif "I" monogram */}
                    <text
                      x="100"
                      y="118"
                      textAnchor="middle"
                      fontFamily='"Cormorant Garamond", Georgia, serif'
                      fontSize="84"
                      fontWeight="600"
                      fontStyle="italic"
                      fill="oklch(0.95 0.02 70)"
                      style={{ letterSpacing: "-0.04em" }}
                    >
                      I
                    </text>
                    {/* specular */}
                    <ellipse cx="78" cy="68" rx="38" ry="18" fill="url(#er-seal-spec)" />
                  </g>
                ) : (
                  // Shatter — six shards fly outward and rotate
                  <g>
                    {SHARDS.map((s, i) => (
                      <motion.path
                        key={i}
                        d={s.d}
                        fill="url(#er-seal-fill)"
                        stroke={SEAL_SHADOW}
                        strokeWidth="0.6"
                        initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
                        animate={{
                          x: s.tx,
                          y: s.ty,
                          rotate: s.rot,
                          opacity: 0,
                        }}
                        transition={{
                          duration: 0.65,
                          delay: i * 0.04,
                          ease: [0.32, 0, 0.67, 0],
                        }}
                        style={{ transformOrigin: "100px 100px" }}
                      />
                    ))}
                  </g>
                )}

                {/* Hairline cracks — animate stroke-dashoffset 1 → 0 */}
                {showCracks && (
                  <g>
                    {CRACKS.map((d, i) => (
                      <motion.path
                        key={`crack-${i}`}
                        d={d}
                        fill="none"
                        stroke="oklch(0.18 0.04 25)"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                        initial={{ pathLength: 0, opacity: 0 }}
                        animate={{ pathLength: 1, opacity: 0.85 }}
                        transition={{
                          duration: 0.5,
                          delay: 0.05 + i * 0.06,
                          ease: [0.32, 0, 0.67, 0],
                        }}
                      />
                    ))}
                  </g>
                )}
              </svg>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Skip button — fixed top-right after 800ms */}
      <AnimatePresence>
        {showSkip && phase !== "done" && (
          <motion.button
            type="button"
            onClick={safeComplete}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed top-5 right-5 sm:top-7 sm:right-7 z-40 px-4 py-2 rounded-full text-xs tracking-[0.14em] uppercase text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[oklch(1_0_0/4%)] border border-[oklch(1_0_0/8%)] backdrop-blur-md transition-colors duration-300"
          >
            {skipLabel}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

export default EnvelopeReveal;
