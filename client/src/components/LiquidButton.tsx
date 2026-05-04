import { useRef, useCallback, type ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * LiquidButton — Apple HIG-aligned, brand-locked (warm amber, no purple).
 *
 * HIG conformance:
 * - Hover: lift 2px + glow strengthen — NEVER scale up
 * - Active/pressed: scale 0.98 (tactile feel, no rubber-band)
 * - Disabled: opacity reduce + cursor-not-allowed (no animation)
 * - Variant CSS uses CSS variables only — no hard-coded oklch tuples
 */
interface LiquidButtonProps {
  children: ReactNode;
  variant?: "primary" | "ghost" | "glass" | "danger";
  size?: "sm" | "md" | "lg" | "xl";
  loading?: boolean;
  className?: string;
  disabled?: boolean;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  type?: "button" | "submit" | "reset";
}

const sizeClasses = {
  sm: "px-4 py-2 text-sm rounded-xl",
  md: "px-6 py-3 text-[0.9375rem] rounded-xl",
  lg: "px-8 py-3.5 text-base rounded-2xl",
  xl: "px-10 py-4.5 text-lg rounded-2xl",
};

const EASE = [0.22, 1, 0.36, 1] as const;

export function LiquidButton({
  children,
  variant = "primary",
  size = "md",
  loading = false,
  className,
  disabled,
  onClick,
  type = "button",
}: LiquidButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      ref.current.style.setProperty("--ripple-x", `${x}%`);
      ref.current.style.setProperty("--ripple-y", `${y}%`);
      onClick?.(e);
    },
    [onClick]
  );

  // Variant styles — bound to CSS variables so per-event accent overrides cascade.
  const variantStyles: Record<string, React.CSSProperties> = {
    primary: {
      background:
        "linear-gradient(135deg, var(--event-accent, var(--primary)) 0%, var(--rose-gold) 100%)",
      color: "var(--primary-foreground)",
      boxShadow:
        "0 4px 24px var(--event-accent-glow, var(--primary-glow)), inset 0 1px 0 0 oklch(1 0 0 / 22%)",
    },
    ghost: {
      background: "transparent",
      color: "var(--text-primary)",
    },
    glass: {
      // Inherits .glass via class — no inline background.
      color: "var(--text-primary)",
    },
    danger: {
      background:
        "linear-gradient(135deg, var(--destructive) 0%, oklch(0.60 0.18 18) 100%)",
      color: "oklch(0.98 0 0)",
      boxShadow:
        "0 4px 24px oklch(0.66 0.20 28 / 28%), inset 0 1px 0 0 oklch(1 0 0 / 18%)",
    },
  };

  const variantClass = variant === "glass" ? "glass" : variant === "ghost" ? "hover:bg-[oklch(1_0_0/6%)]" : "";

  return (
    <motion.button
      ref={ref}
      type={type}
      className={cn(
        "liquid-btn font-medium relative overflow-hidden tracking-[-0.005em] inline-flex items-center justify-center",
        sizeClasses[size],
        variantClass,
        (disabled || loading) && "opacity-40 pointer-events-none cursor-not-allowed",
        className
      )}
      style={variantStyles[variant]}
      onClick={handleClick}
      disabled={disabled || loading}
      // Hover: lift + glow strengthen (no scale). Per the brief.
      whileHover={
        disabled || loading
          ? undefined
          : {
              y: -2,
              boxShadow:
                variant === "primary"
                  ? "0 12px 40px var(--event-accent-glow, var(--primary-glow)), inset 0 1px 0 0 oklch(1 0 0 / 28%)"
                  : variant === "danger"
                  ? "0 12px 40px oklch(0.66 0.20 28 / 36%), inset 0 1px 0 0 oklch(1 0 0 / 22%)"
                  : undefined,
              transition: { duration: 0.3, ease: EASE },
            }
      }
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.3, ease: EASE }}
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2.5">
          <motion.span
            className="w-4 h-4 border-2 border-current border-t-transparent rounded-full"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          />
          <span className="opacity-80">Processing</span>
        </span>
      ) : (
        children
      )}
    </motion.button>
  );
}
