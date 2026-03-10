import { useRef, useCallback, type ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

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

const variantClasses = {
  primary:
    "bg-gradient-to-r from-[oklch(0.5_0.22_260)] via-[oklch(0.55_0.2_280)] to-[oklch(0.52_0.2_310)] text-white shadow-[0_4px_24px_oklch(0.5_0.2_280/30%)]",
  ghost:
    "bg-transparent text-foreground hover:bg-[oklch(1_0_0/6%)]",
  glass:
    "glass text-foreground",
  danger:
    "bg-gradient-to-r from-[oklch(0.5_0.2_15)] to-[oklch(0.55_0.18_30)] text-white shadow-[0_4px_24px_oklch(0.5_0.2_20/25%)]",
};

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

  return (
    <motion.button
      ref={ref}
      type={type}
      className={cn(
        "liquid-btn font-medium relative overflow-hidden tracking-[-0.01em]",
        sizeClasses[size],
        variantClasses[variant],
        (disabled || loading) && "opacity-40 pointer-events-none",
        className
      )}
      onClick={handleClick}
      disabled={disabled || loading}
      whileHover={{ scale: 1.015 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2.5">
          <motion.span
            className="w-4 h-4 border-2 border-current border-t-transparent rounded-full"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          />
          <span className="opacity-80">Processing...</span>
        </span>
      ) : (
        children
      )}
    </motion.button>
  );
}
