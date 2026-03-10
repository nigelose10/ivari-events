import { useRef, useCallback, type ReactNode, type CSSProperties } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

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
};

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
        "rounded-2xl",
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
        ease: [0.22, 1, 0.36, 1],
        delay,
      }}
      whileHover={
        hover || onClick
          ? {
              y: -2,
              boxShadow: "0 16px 64px oklch(0 0 0 / 35%), 0 0 0 0.5px oklch(1 0 0 / 8%)",
              transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] },
            }
          : undefined
      }
    >
      {children}
    </motion.div>
  );
}
