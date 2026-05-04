/**
 * EnvGuard — boot-time check for required Vite env vars.
 *
 * Shipped as a defensive measure so the app never white-screens on a fresh
 * Vercel deploy that's missing env vars. If a required `VITE_*` value is
 * empty at build time (Vite inlines them, so empty == not set), we render a
 * fixed-position banner with the exact missing names + a link to fix them.
 *
 * The banner is non-blocking: the rest of the app still boots so design /
 * static pages still render, but anything calling Convex / Stack Auth will
 * fail predictably (see ErrorBoundary fallback) — and the user knows why.
 */
import { useState } from "react";

interface MissingEnv {
  key: string;
  description: string;
  fixUrl?: string;
}

function detectMissingEnvVars(): MissingEnv[] {
  const missing: MissingEnv[] = [];

  // Convex URL — without this, every backend call fails.
  if (!import.meta.env.VITE_CONVEX_URL) {
    missing.push({
      key: "VITE_CONVEX_URL",
      description:
        "Convex deployment URL. Without this, the app cannot reach the database.",
      fixUrl: "https://dashboard.convex.dev",
    });
  }

  // Stack Auth project ID — without this, sign-in is impossible.
  if (!import.meta.env.VITE_STACK_PROJECT_ID) {
    missing.push({
      key: "VITE_STACK_PROJECT_ID",
      description:
        "Stack Auth project ID. Without this, authentication cannot start.",
      fixUrl: "https://app.stack-auth.com",
    });
  }

  // Stack Auth publishable client key — without this, OAuth + email flows error out.
  if (!import.meta.env.VITE_STACK_PUBLISHABLE_CLIENT_KEY) {
    missing.push({
      key: "VITE_STACK_PUBLISHABLE_CLIENT_KEY",
      description:
        "Stack Auth publishable client key. Without this, sign-in returns a SCHEMA_ERROR.",
      fixUrl: "https://app.stack-auth.com",
    });
  }

  return missing;
}

export function EnvGuardBanner() {
  const [dismissed, setDismissed] = useState(false);
  const missing = detectMissingEnvVars();

  if (missing.length === 0 || dismissed) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: "#1a0e0e",
        borderBottom: "1px solid #a62929",
        color: "#ffe0e0",
        fontFamily: "system-ui, -apple-system, sans-serif",
        fontSize: 13,
        padding: "12px 16px",
        boxShadow: "0 4px 20px rgba(166, 41, 41, 0.3)",
      }}
    >
      <div
        style={{
          maxWidth: 1024,
          margin: "0 auto",
          display: "flex",
          gap: 12,
          alignItems: "flex-start",
        }}
      >
        <span style={{ fontSize: 16, lineHeight: 1, marginTop: 2 }} aria-hidden>
          ⚠
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ display: "block", marginBottom: 4 }}>
            Configuration incomplete — set {missing.length} missing env var
            {missing.length === 1 ? "" : "s"} in Vercel and redeploy.
          </strong>
          <ul style={{ margin: 0, paddingLeft: 16, lineHeight: 1.5 }}>
            {missing.map((m) => (
              <li key={m.key}>
                <code
                  style={{
                    background: "rgba(255,255,255,0.08)",
                    padding: "1px 6px",
                    borderRadius: 4,
                    fontFamily: "ui-monospace, SFMono-Regular, monospace",
                    fontSize: 12,
                  }}
                >
                  {m.key}
                </code>{" "}
                — {m.description}
                {m.fixUrl ? (
                  <>
                    {" "}
                    <a
                      href={m.fixUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      style={{ color: "#ffb0b0", textDecoration: "underline" }}
                    >
                      Open dashboard
                    </a>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss configuration warning"
          style={{
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.2)",
            color: "#ffe0e0",
            borderRadius: 6,
            padding: "4px 10px",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

export default EnvGuardBanner;
