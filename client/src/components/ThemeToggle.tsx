import { useEffect, useState } from "react";
import { Sun, Moon, MonitorCog } from "lucide-react";
import { motion } from "framer-motion";

/**
 * ThemeToggle — three-state cycle: light → dark → system → light...
 *
 * Persistence: localStorage key `ivari:theme` ("light" | "dark" | "system").
 * When "system", removes the [data-theme] attribute so the prefers-color-scheme
 * media query in index.css drives the tokens.
 *
 * The initial paint is set BEFORE React mounts via the inline script in
 * client/index.html so there's no flash of the wrong theme.
 */
type Theme = "light" | "dark" | "system";
const STORAGE_KEY = "ivari:theme";

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  if (theme === "system") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", theme);
  }
}

export function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "system";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    /* localStorage unavailable */
  }
  return "system";
}

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme());

  useEffect(() => {
    applyTheme(theme);
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const cycle = () =>
    setTheme((t) => (t === "light" ? "dark" : t === "dark" ? "system" : "light"));

  const label =
    theme === "light"
      ? "Light theme — click to switch"
      : theme === "dark"
        ? "Dark theme — click to switch"
        : "System theme — click to switch";

  return (
    <motion.button
      type="button"
      onClick={cycle}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className={`relative p-2.5 rounded-full glass border border-[var(--border-hairline,var(--border))] text-[var(--primary)] transition-colors duration-300 ${className ?? ""}`}
      title={label}
      aria-label={label}
    >
      {theme === "light" && <Sun className="w-5 h-5" />}
      {theme === "dark" && <Moon className="w-5 h-5" />}
      {theme === "system" && <MonitorCog className="w-5 h-5" />}
    </motion.button>
  );
}
