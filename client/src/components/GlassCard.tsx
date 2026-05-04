import { useRef, useCallback, type ReactNode, type CSSProperties } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * GlassCard — single recipe with two real variants.
 *
 * Aligned to locked design tokens in index.css:
 * - Single ease curve: cubic-bezier(0.22, 1, 0.36, 1)
 * - Single base motion: 600ms (var(--motion-base))
 * - Hover = lift 2px + glow strengthen, never scale
 * - Specular highlight tracked by mouse on desktop, auto-drift on touch
 *
 * The "subtle" and "strong" variants are kept for backwards compatibility but
 * map to the canonical pair via CSS @apply in index.css.
 */
interface GlassCardProps {
  children: ReactNode;
  className?: string;
  variant?: "default" | "subtle" | "strong" | "elevated";
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

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!specular || !ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100 - 50;
      const y = ((e.clientY - rect.top) / rect.height) * 100 - 50;
      ref.current.style.setProperty("--specular-x", `${x - 50}%`);
      ref.current.style.setProperty("--specular-y", `${y - 50}%`);
    },
    [specular]
  );

  const handleMouseLeave = useCallback(() => {
    if (!ref.current) return;
    ref.current.style.setProperty("--specular-x", "-50%");
    ref.current.style.setProperty("--specular-y", "-50%");
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
              // Glow strengthens on hover with a tinted shadow (not pure black).
              // The "0.5px" outer line gives a ghosted refraction edge.
              boxShadow:
                "0 20px 64px oklch(0 0 0 / 38%), 0 0 0 0.5px oklch(1 0 0 / 10%), 0 0 32px var(--event-accent-soft, oklch(0.78 0.14 65 / 10%))",
              transition: { duration: 0.4, ease: EASE },
            }
          : undefined
      }
    >
      {children}
    </motion.div>
  );
}
