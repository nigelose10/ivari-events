# IVARI — Synthesis After the Council

Branch: `feat/convex-stack-auth-pwa-vercel`
Status: deploy live at https://ivari-events.vercel.app — broken at runtime (see "Real root cause" below)

---

## The brutal truth

The migration agents shipped a complete **backend** rewrite to Convex but **never ported the frontend off tRPC**. Every event-creation/list/update call from `Forge.tsx`, `Home.tsx`, `Pulse.tsx` POSTs to `/api/trpc/*` — which is 404 on Vercel because there's no tRPC server deployed there. The user-facing error "Failed to create event: The string did not match the expected pattern" is tRPC's client choking on a 404 HTML response.

This is in `.workflow/.debug/DEBUG-REPORT.md` (Bug #2). The Google OAuth error is a separate config-only issue. Both compound to make the deploy unusable.

**The prior of "all 6 migration agents succeeded" was wrong.** They succeeded *individually* but the system has a missing seam.

---

## What three council members independently said

### Sun Tzu — the wedge
> Neither Apple Invites nor Paperless Post has a concept of the host as a recurring social entity with accumulated reputation. After three IVARI events, the Memory Wall is irreplaceable. After twelve, leaving means abandoning the most accurate record of the host's social life that exists anywhere. **Build the public Host Profile this week**, before any motion work. Apple cannot copy this without becoming a social network inside iOS — political impossibility. Paperless Post cannot copy this without abandoning the "every event is singular" brand identity their artist partnerships depend on.

**Cuts**: drop Spotify Soundtrack (Apple's terrain), Weather (Apple does it natively), co-host permission tiers beyond "editor."

### Musashi — the cut
> Eight agents in flight. Product deployed but broken. Not a single guest has yet opened a portal link end-to-end without an error. **Ship one working guest experience, anchored by M1.** Convex deployment + Stack Auth Google OAuth config is the unsexy prerequisite that unlocks everything else. The wax-seal envelope reveal is unreachable by any guest on earth because Google OAuth fails on load.

**Posture**: 7am — `npx convex dev`. Before noon — verify one event creates end to end. Refuse new feature conversations until the portal loads for a real guest.

### Socrates — the questions you cannot dodge
> 1. Name three luxury hosts (real people with addresses) who told you they're unhappy with their current invitation tool. If you cannot in 30 seconds, you don't have an ICP — you have a vibe.
> 2. When a guest screenshots an Apple Invite to share, are they sharing the AI image, or the Apple Music playlist with their friends already on it? Which of your eight wedge features produces a screenshot a guest would post unprompted?
> 3. Pick the single metric you'll declare victory on in 90 days. One number. If you cannot pick one, every feature decision is vibes-driven.
> 4. Of the last 20 events you were invited to, how many had a chat thread you read more than once? Group chat loses to WhatsApp every time a guest's contacts list opens.
> 5. **Most dangerous unexamined assumption**: that "AI features are the differentiator." It's a tech-founder bias. The real moat is social — playlist, group chat, photo wall, host profile — not generative.

---

## Convergent verdict (all three, same direction)

**STOP shipping new features.** Foundation is the work. The next decision matters more than the next ten features.

The three of them disagree on emphasis but converge on:
1. **Cut the V8/V9 AI features** (Spotify, Voice Forge, Whisper transcription). Not because they're bad — because they're *Apple's terrain* and *founder's bias*.
2. **Ship the social/relational moves** instead — Host Profile (Sun Tzu), one working guest flow end-to-end (Musashi), things that make guests screenshot (Socrates).
3. **The product must work for one real guest before any polish.**

---

## What actually landed in this session

### Migration (foundation, mostly working)
- Convex schema + 12 function modules (events, rsvps, photos, guests, notifications, analytics, templates, guestTokens, qrcode, http, chats, weather)
- Stack Auth integration (provider tree, JWT bridge, Convex auth.config.ts)
- PWA layer (manifest, install prompt, safe-area utilities, vite-plugin-pwa with Workbox)
- Design overhaul (warm amber + rose-gold palette, Cabinet Grotesk + Satoshi typography, Portal page rewritten gold-standard)
- Vercel deploy at https://ivari-events.vercel.app
- Nano Banana ripped out (`convex/images.ts` deleted, `shared/templates.ts` cleaned)

### Wave 2 (partial — agents hit usage limit mid-flight)
- ✓ `RESEARCH.md` — full OSS / API / MCP landscape
- ✓ `V7-COMPETITIVE-ROADMAP.md` — 8 wedge features + 5 UX moments + 3-sprint phasing
- ✓ Council deliberations: SUNTZU.md, MUSASHI.md, SOCRATES.md (3 of 5)
- ✓ `.workflow/.debug/DEBUG-REPORT.md` — root-cause analysis of all 4 reported bugs
- ✓ Photo gallery moderation backend + UI partials (`PhotoModerationPanel.tsx`, schema fields)
- ✓ Group chats backend (`convex/chats.ts`) + UI components partial
- ✓ Defensive boot guard `EnvGuard.tsx` (surfaces missing env vars instead of white-screen)
- ✓ Improved `ErrorBoundary.tsx` (real error surfaced instead of cryptic message)
- ✓ Ledger → Events rename (manual, this turn)

### Did not land (org hit Anthropic monthly Agent usage limit)
- M1 Wax-seal envelope reveal component
- M3 RSVP cinematic climax component
- W4 Weather widget component (backend `convex/weather.ts` may have landed — verify)
- Apple HIG full UI overhaul (favicon SVG landed; PNG renders did not — sharp script not run)
- Frontend tRPC → Convex port (the actual blocker for "Failed to create event")
- Council members Feynman + Torvalds

---

## The 3 user actions to unblock the deploy

These are config-only and take ~10 minutes total. Until you do them, no V7/V8 work matters.

### 1. Stack Auth Google OAuth (fixes Bug #1 directly)

1. Go to https://app.stack-auth.com → IVARI project → Auth Methods → Google
2. Get Google OAuth credentials from https://console.cloud.google.com/apis/credentials
3. Paste Client ID + Client Secret into Stack dashboard
4. In Google Cloud OAuth client, add `https://api.stack-auth.com/api/v1/auth/oauth/callback/google` as authorized redirect URI

### 2. Stack publishable client key (fixes the silent OAuth init failure)

1. Stack dashboard → API Keys → copy publishable client key
2. `vercel env add VITE_STACK_PUBLISHABLE_CLIENT_KEY production` — paste key
3. `vercel deploy --prod` to redeploy with the var

### 3. Convex deploy (fixes Bug #2 partially — backend now exists)

```bash
cd /home/adonna/Projects/ivari-events
npx convex dev   # browser auth, creates deployment, populates VITE_CONVEX_URL in .env.local
npx convex env set STACK_PROJECT_ID 642e1e59-44fa-43b4-b8d3-4c96e99385c9
npx convex env set STACK_SECRET_SERVER_KEY ssk_t5sb3w9s437287anzqf4x6hg37d7zbmpbqj447gr78syg
npx convex env set JWT_SECRET "$(openssl rand -base64 48)"
vercel env add VITE_CONVEX_URL production   # paste from .env.local
vercel deploy --prod
```

**But the deploy is still broken after these three steps**, because…

---

## The real next engineering job (not config)

**Port `Forge.tsx`, `Home.tsx`, `Pulse.tsx` from tRPC → Convex hooks.**

The Convex functions exist. The mapping is mechanical:

```ts
// before
const events = trpc.events.list.useQuery();
const createMut = trpc.events.create.useMutation({ onSuccess, onError });

// after
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
const events = useQuery(api.events.list);
const createMut = useMutation(api.events.create);
```

**Pages by load order**:
1. `Forge.tsx` (789 lines) — `events.create`, `templates.list`, `templates.get`. Drop the Nano Banana mutation entirely. Add the user image upload (Convex `generateUploadUrl`).
2. `Home.tsx` (403 lines) — `events.list`, `events.duplicate`. Smaller.
3. `Pulse.tsx` (1114 lines) — 18+ tRPC calls covering events, rsvps, guests, notifications, analytics, qrcode. Largest job.
4. `Portal.tsx` (563 lines) — RSVP submit (likely tRPC). Verify.
5. `MemoryWall.tsx`, `Gallery.tsx`, `CheckIn.tsx` — smaller.

After all are ported, delete tRPC client + provider from `main.tsx`. Verify the build, deploy.

This is what gets you to "one real guest opens a portal end-to-end." Estimated focused engineering: 4–8 hours of mechanical work, no AI agents needed.

---

## The suggested cut list (Sun Tzu + Musashi + Socrates aligned)

### Keep
- Convex + Stack Auth foundation
- Frontend tRPC → Convex port (the blocker)
- M1 envelope reveal (Sun Tzu kept it; Musashi made it the climax of the working flow)
- W3 calendar `.ics` deep-links (Musashi's V7 trio)
- **Host Profile public page** (Sun Tzu's wedge — the moat)
- Photo gallery (matches Sun Tzu's "post-event ownership" thesis)

### Cut or defer to V9+
- W2 Spotify/Apple Music collaborative playlist (Apple's terrain — Sun Tzu)
- W4 Weather widget (Apple does this natively — Sun Tzu)
- W1 Voice Forge (founder's bias — Socrates)
- W5 Co-hosts beyond editor role (Sun Tzu)
- W6 Smart auto-follow-ups (defer until measurement loop exists)
- Group chats with roles (loses to WhatsApp — Socrates)
- Live event mode (V9 — too far)

### Add (council-driven)
- **Host Profile page** (`/h/:hostname`) — the wedge Sun Tzu identified. ~3 days of work using existing data.
- **One screenshot-worthy moment** — Socrates' question. Pick one. Make it world-class. (My vote: M1 envelope reveal stays for this reason.)
- **A single victory metric** — Socrates' challenge. Pick one number for 90 days. Recommended: weekly active hosts who've created ≥2 events (proves the recurring-host thesis).

---

## Open questions for the founder

1. **Are you a recurring-host platform or a one-shot-event platform?** Sun Tzu's Host Profile thesis lives or dies on this. Answer with data when Convex is live: what % of users create more than one event?
2. **What's the ICP?** Socrates' first question. Three names. Real ones.
3. **What's your one-number for 90 days?** Pick now or every roadmap decision is vibes.

---

*Files referenced: `MIGRATION-PLAN.md`, `V7-COMPETITIVE-ROADMAP.md`, `RESEARCH.md`, `DESIGN-AUDIT.md`, `.workflow/.council/SUNTZU.md`, `.workflow/.council/MUSASHI.md`, `.workflow/.council/SOCRATES.md`, `.workflow/.debug/DEBUG-REPORT.md`*
