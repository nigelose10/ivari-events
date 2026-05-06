import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * SegmentedControl — Apple iOS / iPadOS pill switcher.
 *
 * Sliding amber indicator (Framer Motion `layoutId`) tracks the active item.
 * Height 32px, 13px semibold per HIG. Warm amber selector — never blue.
 *
 * Composes with the .apple-segmented* CSS in index.css.
 */
export interface SegmentedItem<T extends string = string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

interface SegmentedControlProps<T extends string = string> {
  items: SegmentedItem<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  /** Unique id for the layoutId — set when multiple controls share a page. */
  layoutId?: string;
}

export function SegmentedControl<T extends string = string>({
  items,
  value,
  onChange,
  className,
  layoutId = "segmented-indicator",
}: SegmentedControlProps<T>) {
  return (
    <div className={cn("apple-segmented", className)} role="tablist">
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            data-active={active}
            onClick={() => {
              if (
                typeof navigator !== "undefined" &&
                "vibrate" in navigator &&
                !active
              ) {
                navigator.vibrate(8);
              }
              onChange(item.value);
            }}
            className="apple-segmented-item"
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="apple-segmented-indicator"
                transition={{
                  type: "spring",
                  stiffness: 420,
                  damping: 36,
                  mass: 0.8,
                }}
                style={{
                  left: 0,
                  right: 0,
                }}
              />
            )}
            {item.icon && <span className="relative z-10">{item.icon}</span>}
            <span className="relative z-10">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
