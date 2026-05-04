# IVARI Production Bug Report

**Deploy URL**: https://ivari-events.vercel.app
**Branch**: `feat/convex-stack-auth-pwa-vercel`
**Date**: 2026-05-04
**Investigator**: Claude (debug skill)

---

## Bug 1 — `KnownError<SCHEMA_ERROR>: ... query.client_secret must be defined`

### Hypothesis
Stack Auth's API at `api.stack-auth.com` rejects the Google OAuth flow because the IVARI project's Google provider has no `client_id` / `client_secret` configured in the Stack Auth dashboard.

### Evidence
1. The error path `/api/v1/auth/oauth/authorize/google` is a **Stack Auth API endpoint**, not an IVARI endpoint.
2. Live probe of the Stack Auth API confirms the error shape comes from Stack itself:
   ```bash
   curl -s "https://api.stack-auth.com/api/v1/auth/oauth/authorize/google?client_id=test"
   # → "Request validation failed ... - query.client_secret must be defined ..."
   ```
3. Stack Auth's docs specify that OAuth providers must be configured per project (Google, GitHub, etc.) and the `client_secret` is supplied via the dashboard, not via the URL.
4. Bundle inspection of the live JS confirms `publishableClientKey:""` is empty in production (see Bug 4) — this aggravates the issue: Stack is initialized with no key, so the OAuth handshake never carries a real client identifier.

### Root cause
Two-layered:
- **Primary**: The Stack Auth dashboard for this project has not had a Google OAuth provider configured (no Google client_id / client_secret entered).
- **Secondary**: `VITE_STACK_PUBLISHABLE_CLIENT_KEY` is empty in the prod build, so even with Google configured the OAuth init would fail at `client_id` resolution.

### Fix
**Code**: none (this is a config issue). A defensive boot-time banner now warns when the publishable key is missing — see `client/src/components/EnvGuard.tsx`.

**Required user action** (steps):
1. Go to https://app.stack-auth.com and select the IVARI project.
2. Open **Auth Methods** → **Google** (or **OAuth Providers** → **Google**).
3. Enable Google. Paste the Google Cloud OAuth `Client ID` and `Client Secret` from https://console.cloud.google.com/apis/credentials.
4. In the same Google Cloud OAuth client, add `https://api.stack-auth.com/api/v1/auth/oauth/callback/google` as an authorized redirect URI (Stack documents the exact path).
5. In Vercel project settings → **Environment Variables**, set:
   - `VITE_STACK_PROJECT_ID` (from the Stack dashboard)
   - `VITE_STACK_PUBLISHABLE_CLIENT_KEY` (from the Stack dashboard → API Keys)
   - `STACK_SECRET_SERVER_KEY` (server-side; needed for any server function that calls Stack)
6. Trigger a redeploy in Vercel.

**Status**: user-action-required.

---

## Bug 2 — `Failed to create event: The string did not match the expected pattern.`

### Hypothesis priors evaluated
- (a) Frontend still on tRPC after Convex migration: **CONFIRMED**.
- (b) Zod regex on a field (slug / themeColor / lat): **REJECTED** (themeColor is a hex string, slug is server-generated, locationLat is a string).
- (c) Convex URL invalid → string-pattern URL parse fail: **PARTIAL** — also true (see Bug 4). Both contribute.

### Evidence
1. `client/src/pages/Forge.tsx` line 18 imports tRPC; line 76 uses `trpc.templates.list.useQuery`; line 107 uses `trpc.nanoBanana.generate.useMutation`; **line 115** uses `trpc.events.create.useMutation` — and **line 120** wires the failing toast: `onError: (err) => toast.error("Failed to create event: " + err.message)`.
2. `client/src/pages/Home.tsx` and `client/src/pages/Pulse.tsx` are entirely on tRPC (`trpc.events.list`, `trpc.events.get`, `trpc.rsvps.*`, `trpc.guests.*`, etc. — 18+ tRPC calls in Pulse alone).
3. `vercel.json` rewrites everything except `assets`/`icons`/`manifest`/`sw.js`/`workbox-*` to `/index.html`. There is **no `/api` directory** in the repo root and no `/api/trpc/*` serverless function deployed. Live probe:
   ```bash
   curl -s https://ivari-events.vercel.app/api/trpc/events.list
   # → "The page could not be found\n\nNOT_FOUND\n\nfra1::..."
   ```
4. So `httpBatchLink({ url: "/api/trpc" })` POSTs to a 404 that returns plain-text "The page could not be found" with status 404. tRPC's client tries to JSON-parse the response, fails. The `URL` constructor / response parsing throws the cryptic `"The string did not match the expected pattern"` (a WebKit/Safari-style URL/JSON error message).
5. Convex migration was started: `convex/events.ts` exports a working `create` mutation, but the **frontend was never rewired** to call it.

### Root cause
The frontend pages (`Forge.tsx`, `Home.tsx`, `Pulse.tsx`, etc.) are still wired to tRPC via `@/lib/trpc`. The tRPC server (the old `server/routers.ts` Express + tRPC stack) is **not** part of the Vercel deploy — Vercel only ships the SPA build. Every tRPC call hits a 404 HTML/text page; the client can't parse it and surfaces the `string did not match the expected pattern` error to the user via the `onError` toast.

### Fix
**Code (in this debug pass)**: hardened `ErrorBoundary` and `convex.ts` so the failure mode is recoverable and explained — see Bug 4.

**Outstanding work (out of debug scope, flagged here)**:
- Port `Forge.tsx`'s `events.create`, `templates.list`, `templates.get`, `nanoBanana.generate` from tRPC to Convex (`useMutation(api.events.create)`, `useQuery(api.templates.list)`, etc.).
- Port `Home.tsx` (`events.list`, `events.duplicate`).
- Port `Pulse.tsx` (the largest — 18+ tRPC calls covering events, rsvps, guests, notifications, analytics, qrcode).
- Each Convex function is already implemented in `convex/events.ts`, `convex/templates.ts`, etc., so the port is mechanical: replace `trpc.<router>.<proc>.useQuery({...})` with `useQuery(api.<router>.<proc>, {...})` and `trpc.<router>.<proc>.useMutation({onSuccess, onError})` with the Convex equivalent (`useMutation(api.<router>.<proc>)` plus surrounding error-handling state).
- After the port, delete the tRPC client wiring from `main.tsx` (`trpcClient`, `trpc.Provider`, `httpBatchLink` import).

**Status**: partial. Diagnosis is complete and the failure mode is now explained to users; the full port is a feature-sized change and was deliberately not done here (instructions: "Don't touch Forge.tsx beyond the 'is it on Convex hooks' check").

---

## Bug 3 — "Add to Home Screen" on iPhone doesn't work properly

### Hypothesis
The icon PNG files are 1×1 placeholders, so iOS shows a blank or screenshot-derived icon when the user taps "Add to Home Screen".

### Evidence
1. Local file inspection:
   ```bash
   $ file client/public/icons/apple-touch-icon-180.png
   PNG image data, 1 x 1, 8-bit/color RGBA, non-interlaced
   ```
   All six icons (`icon-192`, `icon-512`, `icon-maskable-512`, `apple-touch-icon-152/167/180`) are **1×1 PNGs**.
2. All five splash images in `client/public/icons/splash/` are also 1×1 PNGs.
3. Live deploy confirms the same 1×1 PNGs are served:
   ```bash
   $ curl -s https://ivari-events.vercel.app/icons/apple-touch-icon-180.png | file -
   /dev/stdin: PNG image data, 1 x 1, 8-bit/color RGBA, non-interlaced
   ```
4. `client/index.html` (lines 25-28) has correct `<link rel="apple-touch-icon">` markup with `sizes` attributes — the wiring is fine.
5. `client/public/manifest.webmanifest` has correct `icons` array with 192/512/maskable entries — wiring is fine.
6. `vercel.json` correctly excludes `/icons/*` and `/manifest.webmanifest` from the SPA rewrite, and serves the manifest with `Content-Type: application/manifest+json`.

### Root cause
The icons themselves are blank 1×1 placeholders. iOS's "Add to Home Screen" therefore renders either a screenshot of the page or a generic icon, and the resulting installed app looks broken.

### Fix
**Code**: none — wiring (HTML `<link>` tags, manifest icon entries, MIME type, Vercel rewrites) is all correct. Re-tested by curl-ing `/manifest.webmanifest` (200, correct content-type) and `/icons/apple-touch-icon-180.png` (200, served).

**Required user action**:
- Generate a real icon set from the IVARI mark and replace the placeholders. A sibling agent is reportedly handling this.
- Required PNG sizes (replace each in-place at the same paths):
  - `icons/apple-touch-icon-152.png` — 152×152
  - `icons/apple-touch-icon-167.png` — 167×167
  - `icons/apple-touch-icon-180.png` — 180×180
  - `icons/icon-192.png` — 192×192
  - `icons/icon-512.png` — 512×512
  - `icons/icon-maskable-512.png` — 512×512, with safe-zone padding (the maskable spec reserves the outer ~10% for the OS mask)
  - `icons/splash/apple-splash-*.png` — five sizes per the `media` queries in `client/index.html`
- After replacing, redeploy. No code changes needed.

**Status**: user-action-required (icon assets). Code wiring verified clean.

---

## Bug 4 — `An unhandled error occurred. Please report this to the developer.`

### Hypothesis
Generic React error boundary trigger; likely cascaded from Bug 2 (tRPC 404 → JSON parse fail) or from the Convex client constructed with the obviously-wrong placeholder URL `https://convex-not-configured.invalid` because `VITE_CONVEX_URL` is empty in prod.

### Evidence
1. **Bundle inspection of the live JS** (`/assets/index-CJzOzfGq.js`):
   ```
   publishableClientKey:""           ← Stack Auth client key empty
   convex-not-configured             ← fallback URL hit (env var missing)
   ```
   These confirm `VITE_CONVEX_URL` and `VITE_STACK_PUBLISHABLE_CLIENT_KEY` are **not set** in the Vercel build environment.
2. With those empty, `client/src/lib/convex.ts` constructs `new ConvexReactClient("https://convex-not-configured.invalid")`. The first time any component subscribes to a Convex query, the client tries to open a websocket to that hostname, which fails — and React surfaces the failure through the error boundary.
3. The previous `ErrorBoundary` (`client/src/components/ErrorBoundary.tsx`) only rendered the raw stack — when the error was wrapped by React's reconciliation, the user saw the generic "An unhandled error occurred" message with no actionable hint.

### Root cause
Two compounding issues:
1. **Vercel env vars not set**: `VITE_CONVEX_URL`, `VITE_STACK_PROJECT_ID`, `VITE_STACK_PUBLISHABLE_CLIENT_KEY` are missing or empty in the deploy environment.
2. **No defensive UI** to translate the resulting cryptic error into something the user can act on — so when the underlying call failed, the ErrorBoundary fell through to a generic message.

### Fix
**Code-shipped** in this debug pass:

- `client/src/components/EnvGuard.tsx` (new) — a fixed-position banner that renders at boot if any required `VITE_*` env var is empty. Tells the user exactly which var is missing and links to the relevant dashboard. Mounted in `client/src/main.tsx` lines 63-64 (next to `<StackProvider>` so it always renders, even if Stack/Convex providers crash).
- `client/src/main.tsx` — imports and mounts `<EnvGuardBanner />` at the root.
- `client/src/components/ErrorBoundary.tsx` — rewritten:
  - Now logs to console via `componentDidCatch` so the underlying error is recoverable from devtools.
  - Adds a `diagnoseError()` helper that translates common failure messages (Convex URL missing, Stack `client_secret`, Stack publishable key, "string did not match expected pattern") into human-readable hints rendered in an amber-bordered panel above the stack trace.
  - The technical stack is now hidden behind a "Show technical details" toggle (cleaner UI, still accessible).
  - Surfaces `error.name: error.message` directly so the user / reporter sees the actual error string.
- `client/src/lib/convex.ts` — wraps `new ConvexReactClient(...)` in a `try/catch` and trims the env var. Comments updated to explain the placeholder strategy and how it interacts with `EnvGuard` + `ErrorBoundary`.

**Required user action** (still required to fully fix):
- In Vercel project settings → **Environment Variables**, set (for the `Production` environment, plus `Preview` / `Development` if desired):
  - `VITE_CONVEX_URL` — from `npx convex dashboard` → URL field (looks like `https://acoustic-XXXXX-NNN.convex.cloud`)
  - `VITE_STACK_PROJECT_ID` — from the Stack Auth dashboard
  - `VITE_STACK_PUBLISHABLE_CLIENT_KEY` — from the Stack Auth dashboard → API Keys
  - `STACK_SECRET_SERVER_KEY` — server-side equivalent (only needed if any Vercel serverless function ever calls Stack server-side; harmless to set now)
- For the Convex deployment, also set: `npx convex env set STACK_PROJECT_ID <id>` (so `convex/auth.config.ts` can verify Stack-issued JWTs).
- Trigger a redeploy.

**Status**: code-fix-shipped (defensive UI). Underlying root cause still requires user-action (env vars).

---

## Files touched in this debug pass

| File | Change |
| --- | --- |
| `client/src/components/EnvGuard.tsx` | New file. Boot-time env-var check banner. |
| `client/src/components/ErrorBoundary.tsx` | Rewritten: hint engine, console logging, details disclosure. |
| `client/src/lib/convex.ts` | Try/catch around client construction, env var trimming, comments. |
| `client/src/main.tsx` | Import and mount `<EnvGuardBanner />`. |
| `.workflow/.debug/DEBUG-REPORT.md` | This report. |

---

## Executive summary

| # | Bug | Root cause | Fix status |
| --- | --- | --- | --- |
| 1 | `client_secret must be defined` on Google OAuth | Stack Auth project has no Google OAuth credentials in the dashboard | user-action-required (dashboard config) |
| 2 | "Failed to create event: string did not match expected pattern" | Frontend (Forge/Home/Pulse) still wired to tRPC, but no `/api/trpc` is deployed on Vercel — calls 404 with HTML body, tRPC fails to parse | partial — diagnosis complete + friendly error UI shipped; full Convex port is the underlying fix and is feature-sized work outside this debug scope |
| 3 | iOS Add-to-Home-Screen broken | All icon PNGs are 1×1 placeholders (wiring in HTML/manifest is fine) | user-action-required (asset replacement; sibling agent handling) |
| 4 | Generic "An unhandled error occurred" | `VITE_CONVEX_URL` / `VITE_STACK_PUBLISHABLE_CLIENT_KEY` empty in Vercel; ErrorBoundary surfaced no diagnostic | code-fix-shipped (EnvGuard banner + diagnostic ErrorBoundary + convex try/catch); user-action still required to set env vars
