/**
 * MobileBottomNav — iOS-style floating tab bar for the IVARI PWA.
 *
 * Visibility rules (component renders null when ANY fail):
 *  - Authenticated user only (Stack Auth via useAuth).
 *  - Mobile viewport only (< 768px).
 *  - Hidden on guest / standalone surfaces:
 *      /portal/*, /memory/*, /live/*, /handler/*, /checkin/*
 *
 * Behaviors:
 *  - Floats 12px above the bottom edge as a glass pill, respects safe-area.
 *  - Hides on scroll-down, reveals on scroll-up (iOS Mail / Apollo cadence).
 *  - Active-tab indicator uses Framer Motion `layoutId` for smooth motion.
 *  - Light haptic (8ms) on tab change when supported.
 *  - "You" tab opens a Vaul drawer (avatar, theme toggle, sign out).
 *  - Sets `body[data-has-bottom-nav="true"]` so global CSS can pad the page.
 */
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Drawer } from "vaul";
import { LayoutGrid, Plus, Image as ImageIcon, User, LogOut, Settings, Sun, Moon, MessageCircle } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";

type TabKey = "events" | "chat" | "forge" | "gallery" | "you";

interface Tab {
  key: TabKey;
  label: string;
  path?: string;
  icon: typeof LayoutGrid;
}

const TABS: Tab[] = [
  { key: "events", label: "Events", path: "/", icon: LayoutGrid },
  { key: "chat", label: "Chat", path: "/chats", icon: MessageCircle },
  { key: "forge", label: "Forge", path: "/forge", icon: Plus },
  { key: "gallery", label: "Gallery", path: "/gallery", icon: ImageIcon },
  { key: "you", label: "You", icon: User },
];

const HIDDEN_PREFIXES = ["/portal/", "/memory/", "/live/", "/handler/", "/checkin/"];

function shouldHideForRoute(pathname: string): boolean {
  return HIDDEN_PREFIXES.some((p) => pathname.startsWith(p));
}

function haptic() {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(8);
    } catch {
      /* ignore */
    }
  }
}

export default function MobileBottomNav() {
  const { user, isAuthenticated, logout } = useAuth();
  const { theme, toggleTheme, switchable } = useTheme();
  const [location, navigate] = useLocation();
  const [isMobile, setIsMobile] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Track mobile viewport (<768px).
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767.98px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Scroll-direction tracking — hide on scroll-down, reveal on scroll-up.
  useEffect(() => {
    let lastY = window.scrollY;
    const handler = () => {
      const y = window.scrollY;
      setHidden(y > lastY && y > 100);
      lastY = y;
    };
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  // Render for everyone on mobile — guests need a way to get to Forge (which
  // gates auth on submit) and Chat (which prompts sign-in inside its index).
  // Hides on portal/memory/live/handler/checkin where the standalone surfaces
  // own the chrome.
  const renderable = isMobile && !shouldHideForRoute(location);

  // Toggle body flag so global CSS can add bottom padding.
  useEffect(() => {
    if (!renderable) return;
    document.body.dataset.hasBottomNav = "true";
    return () => {
      delete document.body.dataset.hasBottomNav;
    };
  }, [renderable]);

  if (!renderable) return null;

  // Determine which tab is active.
  const activeKey: TabKey =
    location === "/forge"
      ? "forge"
      : location === "/gallery"
        ? "gallery"
        : location === "/chats" || location.startsWith("/chats/")
          ? "chat"
          : location === "/profile"
            ? "you"
            : location === "/"
              ? "events"
              : "events";

  const handleTabPress = (tab: Tab) => {
    haptic();
    if (tab.key === "you") {
      setDrawerOpen(true);
      return;
    }
    if (tab.path && tab.path !== location) {
      navigate(tab.path);
    }
  };

  return (
    <>
      <motion.nav
        aria-label="Primary"
        initial={false}
        animate={{ y: hidden ? 120 : 0, opacity: hidden ? 0 : 1 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
          zIndex: 60,
          width: "100%",
          maxWidth: 480,
          margin: "0 auto",
          padding: "0 16px",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            pointerEvents: "auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-around",
            gap: 4,
            padding: "10px 14px",
            borderRadius: 999,
            background: "oklch(0.06 0.008 75 / 72%)",
            backdropFilter: "blur(40px) saturate(220%)",
            WebkitBackdropFilter: "blur(40px) saturate(220%)",
            border: "1px solid var(--glass-border)",
            boxShadow:
              "0 12px 32px oklch(0 0 0 / 38%), inset 0 1px 0 0 oklch(1 0 0 / 14%)",
          }}
        >
          {TABS.map((tab) => {
            const isActive = tab.key === activeKey;
            const Icon = tab.icon;
            const isForge = tab.key === "forge";

            if (isForge) {
              return (
                <button
                  key={tab.key}
                  type="button"
                  aria-label={tab.label}
                  data-tour={`bottom-${tab.key}`}
                  onClick={() => handleTabPress(tab)}
                  style={{
                    marginTop: -18,
                    flex: "0 0 auto",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 56,
                    height: 56,
                    borderRadius: 20,
                    background:
                      "linear-gradient(135deg, var(--primary), var(--rose-gold))",
                    boxShadow:
                      "0 10px 24px var(--primary-glow), 0 0 0 1px oklch(1 0 0 / 14%)",
                    color: "white",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  <Plus size={26} strokeWidth={2.6} />
                </button>
              );
            }

            return (
              <button
                key={tab.key}
                type="button"
                aria-label={tab.label}
                aria-current={isActive ? "page" : undefined}
                data-tour={`bottom-${tab.key}`}
                onClick={() => handleTabPress(tab)}
                style={{
                  position: "relative",
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 2,
                  padding: "8px 4px 4px",
                  background: "transparent",
                  border: "none",
                  color: isActive ? "var(--primary)" : "var(--text-tertiary)",
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.02em",
                  cursor: "pointer",
                  transition: "color 180ms ease",
                }}
              >
                <Icon size={22} strokeWidth={isActive ? 2.4 : 2} />
                <span>{tab.label}</span>
                {isActive && (
                  <motion.span
                    layoutId="bottom-nav-indicator"
                    style={{
                      position: "absolute",
                      bottom: -2,
                      width: 4,
                      height: 4,
                      borderRadius: 999,
                      background: "var(--primary)",
                      boxShadow: "0 0 8px var(--primary-glow)",
                    }}
                    transition={{ type: "spring", stiffness: 520, damping: 38 }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </motion.nav>

      <Drawer.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
        <Drawer.Portal>
          <Drawer.Overlay
            style={{
              position: "fixed",
              inset: 0,
              background: "oklch(0 0 0 / 50%)",
              zIndex: 70,
            }}
          />
          <Drawer.Content
            style={{
              position: "fixed",
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 80,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              background: "oklch(0.06 0.008 75 / 96%)",
              backdropFilter: "blur(40px) saturate(220%)",
              WebkitBackdropFilter: "blur(40px) saturate(220%)",
              border: "1px solid var(--glass-border)",
              borderBottom: "none",
              padding: "8px 20px calc(20px + env(safe-area-inset-bottom, 0px))",
              color: "var(--glass-foreground)",
            }}
          >
            <Drawer.Title style={{ position: "absolute", left: -9999 }}>
              Account
            </Drawer.Title>
            <div
              aria-hidden="true"
              style={{
                width: 40,
                height: 4,
                borderRadius: 999,
                background: "oklch(1 0 0 / 26%)",
                margin: "8px auto 16px",
              }}
            />

            {/* User card */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 4px 16px",
                borderBottom: "1px solid var(--glass-border)",
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 999,
                  overflow: "hidden",
                  background:
                    "linear-gradient(135deg, var(--primary), var(--rose-gold))",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "white",
                  fontWeight: 700,
                  fontSize: 16,
                  flex: "0 0 auto",
                }}
              >
                {user?.profileImageUrl ? (
                  <img
                    src={user.profileImageUrl}
                    alt=""
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  (user?.name ?? user?.email ?? "?").slice(0, 1).toUpperCase()
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    color: "var(--glass-foreground)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {user?.name ?? "IVARI"}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-tertiary)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {user?.email ?? ""}
                </div>
              </div>
            </div>

            {/* Theme toggle */}
            {switchable && toggleTheme && (
              <button
                type="button"
                onClick={() => {
                  haptic();
                  toggleTheme();
                }}
                style={drawerRowStyle}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {theme === "dark" ? <Moon size={18} /> : <Sun size={18} />}
                  <span>Theme</span>
                </span>
                <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
                  {theme === "dark" ? "Dark" : "Light"}
                </span>
              </button>
            )}

            {/* Profile — username, tagline, friends */}
            <button
              type="button"
              onClick={() => {
                haptic();
                setDrawerOpen(false);
                navigate("/profile");
              }}
              style={drawerRowStyle}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <User size={18} />
                <span>Profile &amp; friends</span>
              </span>
            </button>

            {/* Account & security — Stack handler */}
            <button
              type="button"
              onClick={() => {
                haptic();
                setDrawerOpen(false);
                navigate("/handler/account-settings");
              }}
              style={drawerRowStyle}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Settings size={18} />
                <span>Account settings</span>
              </span>
            </button>

            {/* Sign out */}
            <button
              type="button"
              onClick={async () => {
                haptic();
                setDrawerOpen(false);
                try {
                  await logout();
                } catch {
                  /* ignore */
                }
              }}
              style={{
                ...drawerRowStyle,
                color: "oklch(0.7 0.18 25)",
                marginTop: 4,
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <LogOut size={18} />
                <span>Sign out</span>
              </span>
            </button>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </>
  );
}

const drawerRowStyle: React.CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "14px 12px",
  border: "none",
  background: "transparent",
  color: "var(--glass-foreground)",
  fontSize: 15,
  fontWeight: 500,
  borderRadius: 12,
  cursor: "pointer",
  textAlign: "left",
};
