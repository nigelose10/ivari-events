# IVARI Deployment Runbook

Branch: `feat/convex-stack-auth-pwa-vercel`

This is a hand-off guide. The migration is staged; the **two browser-auth steps must be done by you** because they require interactive sign-in.

---

## Part 1: Local one-time setup (you must run these)

### 1.1 Install dependencies

```bash
cd /home/adonna/Projects/ivari-events
pnpm install
```

This pulls in the new packages added during the migration: `convex`, `@stackframe/react`, `vite-plugin-pwa`, `workbox-window`. It also drops the obsolete `@trpc/*`, `drizzle-*`, `mysql2`, `socket.io*`, `express`, `@aws-sdk/*` once `package.json` is cleaned up post-merge (see "Cleanup" below).

### 1.2 Bootstrap Convex (browser auth — your action)

```bash
npx convex dev
```

- Opens browser to authenticate with Convex.
- Creates a new project (suggested name: `ivari-events` or `ivari-prod`).
- Auto-populates `.env.local` with `CONVEX_DEPLOYMENT` and `VITE_CONVEX_URL`.
- Pushes `convex/schema.ts` and the function modules to your Convex deployment.
- Leave it running — it watches `convex/` for changes during dev.

**After first push**, set the Convex deployment env vars:

```bash
npx convex env set STACK_PROJECT_ID 642e1e59-44fa-43b4-b8d3-4c96e99385c9
npx convex env set STACK_SECRET_SERVER_KEY ssk_t5sb3w9s437287anzqf4x6hg37d7zbmpbqj447gr78syg
npx convex env set JWT_SECRET "$(openssl rand -base64 48)"
# Plus whatever upstream API keys you use for image gen / LLM:
# npx convex env set NANO_BANANA_API_KEY ...
# npx convex env set LLM_API_KEY ...
```

### 1.3 Get the Stack Auth publishable client key

The server key is already in `.env.local`. The **publishable client key** is missing — fetch it:

1. Go to https://app.stack-auth.com/projects/642e1e59-44fa-43b4-b8d3-4c96e99385c9
2. Settings → API keys → copy the publishable client key
3. Paste into `.env.local`:

```
VITE_STACK_PUBLISHABLE_CLIENT_KEY=pck_...
```

### 1.4 Configure Stack Auth → Convex JWT bridge

In the Stack Auth dashboard:
1. **JWT templates** → create a Convex template (or verify default issuer matches `https://api.stack-auth.com`)
2. **Allowed redirect URLs** → add `http://localhost:5173/handler/*` (dev) and your Vercel URL once deployed (`https://ivari.vercel.app/handler/*`)
3. **Sign-in methods** → enable Email + Google (recommended) or whatever you want exposed

### 1.5 Run dev locally

In two terminals:

```bash
# Terminal 1 — Convex (keeps schema/functions in sync)
npx convex dev

# Terminal 2 — Vite frontend
pnpm dev
```

Open http://localhost:5173. You should land on the unauthenticated IVARI landing page. Click "Sign in" → routed to `/handler/sign-in` (Stack Auth's UI). Sign up → redirected back to `/`. Convex's `ensureCurrentUser` mutation upserts your user row.

---

## Part 2: Vercel deployment (browser auth — your action)

### 2.1 Install Vercel CLI

```bash
pnpm add -g vercel
vercel login   # opens browser
```

### 2.2 Link the project

```bash
cd /home/adonna/Projects/ivari-events
vercel link
```

Pick scope (your Vercel team), accept default or name it `ivari`.

### 2.3 Set Vercel env vars

```bash
# These are FRONTEND-side (VITE_* prefix, exposed to browser)
vercel env add VITE_CONVEX_URL          # paste from .env.local
vercel env add VITE_STACK_PROJECT_ID    # 642e1e59-44fa-43b4-b8d3-4c96e99385c9
vercel env add VITE_STACK_PUBLISHABLE_CLIENT_KEY  # pck_... from Stack dashboard

# Apply to: Production, Preview, Development (select all when prompted)
```

**DO NOT** put `STACK_SECRET_SERVER_KEY` in Vercel — server keys belong only in Convex's env (set in step 1.2).

### 2.4 Deploy

```bash
vercel deploy --prod
```

First deploy ~2 min. Subsequent deploys ~30s (Vercel caches the build).

### 2.5 Push Convex production deployment

By default `npx convex dev` creates a *dev* deployment. For production:

```bash
npx convex deploy   # creates/updates the prod deployment
```

Update Vercel's `VITE_CONVEX_URL` to the prod URL (from `npx convex deploy` output) if it differs.

### 2.6 Update Stack Auth allowed redirects

Add your Vercel URLs to the Stack dashboard's allowed redirects:
- `https://ivari.vercel.app/handler/*`
- `https://ivari.vercel.app/*` (root callbacks)
- Custom domain if/when you add one

---

## Part 3: Verify the iPhone PWA install

1. Visit your Vercel URL in **Safari on a real iPhone** (Simulator does NOT enter standalone mode)
2. Tap the share icon → "Add to Home Screen"
3. Custom prompt component (`PWAInstallPrompt.tsx`) shows iOS-specific instructions
4. Launch from home screen — Safari chrome is gone, status bar overlays content (translucent), splash screen matches device

If the splash is wrong size: replace the placeholder PNGs in `client/public/icons/splash/` with real ones. Use `npx pwa-asset-generator` from a single source SVG to regenerate all sizes.

---

## Part 4: Cleanup post-cutover

Once you've verified the Convex+Stack Auth+Vercel flow works end-to-end, delete the obsolete legacy code:

```bash
rm -rf server/ drizzle/ drizzle.config.ts
rm client/src/lib/trpc.ts client/src/hooks/useSocket.ts 2>/dev/null
```

Update `package.json`:
- `"dev": "vite"` (drop `tsx watch server/_core/index.ts`)
- `"build": "vite build"` (drop `&& esbuild server/...`)
- Drop `"start"` and `"db:push"` scripts
- Remove deps: `@trpc/*`, `drizzle-orm`, `drizzle-kit`, `mysql2`, `socket.io`, `socket.io-client`, `express`, `@types/express`, `@aws-sdk/*`, `cookie`, `superjson`, `tsx`, `esbuild`, `dotenv`

```bash
pnpm remove @trpc/client @trpc/react-query @trpc/server drizzle-orm drizzle-kit mysql2 socket.io socket.io-client express @types/express @aws-sdk/client-s3 @aws-sdk/s3-request-presigner cookie superjson tsx esbuild dotenv vite-plugin-manus-runtime
```

---

## Part 5: Post-launch checklist

- [ ] Replace 6 placeholder icon PNGs in `client/public/icons/` with real IVARI gradient renders
- [ ] Replace 5 splash screen placeholders in `client/public/icons/splash/`
- [ ] **Rotate `STACK_SECRET_SERVER_KEY`** — the original was pasted in chat history; generate a fresh one in the Stack dashboard and update Convex env (`npx convex env set STACK_SECRET_SERVER_KEY <new>`)
- [ ] Test on a real iPhone (PWA install + standalone mode)
- [ ] Test on a real Android (Chrome's `beforeinstallprompt` button appears)
- [ ] Migrate existing MySQL data (if any production data exists in the old DB) — script not included; pattern: read via Drizzle, write via Convex `internalMutation`, build oldId→newId map for FK rewriting
- [ ] Custom domain in Vercel (if applicable)
- [ ] Set up Vercel Analytics or PostHog for traffic data
- [ ] Configure Stack Auth email templates (welcome, magic link, password reset)
- [ ] Verify guest portal JWT signing works end-to-end (host creates event → guest gets link → RSVP submits)

---

## Architecture cheat sheet

```
                         ┌─────────────────────────────┐
                         │  Vercel (static frontend)   │
                         │  Vite build → /dist/public  │
                         │  PWA service worker         │
                         └──────────────┬──────────────┘
                                        │
                ┌───────────────────────┼───────────────────────┐
                │                       │                       │
                ▼                       ▼                       ▼
     ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
     │  Stack Auth      │    │  Convex Cloud    │    │  Nano Banana /   │
     │  (auth, JWT)     │    │  (DB + functions │    │  external APIs   │
     │                  │    │   + storage +    │    │  (called from    │
     │  /handler/*      │    │   reactivity)    │    │   Convex actions)│
     └────────┬─────────┘    └─────────┬────────┘    └──────────────────┘
              │                        │
              └────── JWT bridge ──────┘
            (auth.config.ts verifies via JWKS)
```

**No more**: Express, tRPC, Drizzle, MySQL, Socket.IO, S3, custom OAuth.
