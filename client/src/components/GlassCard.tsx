import { useRef, useCallback, type ReactNode, type CSSProperties } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * GlassCard — Apple HIG vibrancy-grade glass surfaces.
 *
 * Aligned to locked design tokens in index.css:
 * - Single ease curve: cubic-bezier(0.22, 1, 0.36, 1)
 * - Single base motion: 600ms (var(--motion-base))
 * - Hover = lift 2px + glow strengthen + blur INTENSIFY (HIG: never color-shift)
 * - Specular highlight: TWO layers tracked by mouse via CSS custom properties
 *   on desktop (broad falloff + tighter wet sheen), auto-drift on touch
 *
 * Variants:
 *   default  — base liquid glass (var(--glass-blur))
 *   subtle   — same as default (legacy alias)
 *   strong   — elevated tier
 *   elevated — strong vibrancy (modal/hero)
 *   vibrancy — full Apple vibrancy stack (blur 120px / saturate 280%)
 */
interface GlassCardProps {
  children: ReactNode;
  className?: string;
  variant?: "default" | "subtle" | "strong" | "elevated" | "vibrancy";
  onClick?: () => void;
  style?: CSSProperties;
  specular?: boolean;
  layout?: boolean;
  hover?: boolean;
  delay?: number;
}

const variantMap = {
  default: "glass",
  subtle: "glass-subtle",
  strong: "glass-strong",
  elevated: "glass-elevated",
  vibrancy: "glass-vibrancy",
} as const;

const EASE = [0.22, 1, 0.36, 1] as const;

export function GlassCard({
  children,
  className,
  variant = "default",
  onClick,
  style,
  specular = true,
  layout = false,
  hover = false,
  delay = 0,
}: GlassCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Pointer tracking with rAF coalescing — smoother than direct setProperty
  // and prevents thrashing on touch devices.
  const rafRef = useRef<number | null>(null);
  const lastEvent = useRef<{ x: number; y: number } | null>(null);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!specular || !ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      lastEvent.current = {
        x: ((e.clientX - rect.left) / rect.width) * 100,
        y: ((e.clientY - rect.top) / rect.height) * 100,
      };
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(() => {
        if (ref.current && lastEvent.current) {
          const { x, y } = lastEvent.current;
          // Broad falloff (existing ::before)
          ref.current.style.setProperty("--specular-x", `${x - 100}%`);
          ref.current.style.setProperty("--specular-y", `${y - 100}%`);
          // Tighter "wet" highlight (::after)
          ref.current.style.setProperty("--specular-x2", `${x - 40}%`);
          ref.current.style.setProperty("--specular-y2", `${y - 40}%`);
        }
        rafRef.current = null;
      });
    },
    [specular]
  );

  const handleMouseLeave = useCallback(() => {
    if (!ref.current) return;
    ref.current.style.setProperty("--specular-x", "-50%");
    ref.current.style.setProperty("--specular-y", "-50%");
    ref.current.style.setProperty("--specular-x2", "-50%");
    ref.current.style.setProperty("--specular-y2", "-50%");
  }, []);

  return (
    <motion.div
      ref={ref}
      className={cn(
        variantMap[variant],
        specular && "glass-specular",
        onClick && "cursor-pointer",
        className
      )}
      style={style}
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      layout={layout}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{
        duration: 0.7,
        ease: EASE,
        delay,
      }}
      whileHover={
        hover || onClick
          ? {
              y: -2,
              // Apple HIG hover — glow strengthens + the .glass-vibrancy CSS
              // class handles blur intensification automatically. We never
              // shift hue or saturation on hover (HIG rule).
              boxShadow:
                "0 24px 72px oklch(0 0 0 / 42%), 0 0 0 0.5px oklch(1 0 0 / 12%), 0 0 40px var(--event-accent-soft, oklch(0.78 0.14 65 / 14%))",
              transition: { duration: 0.4, ease: EASE },
            }
          : undefined
      }
    >
      {children}
    </motion.div>
  );
}
