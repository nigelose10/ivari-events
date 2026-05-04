# IVARI External Research

Research date: 2026-05-04. Goal: stop reinventing — pick what's already great. All claims cite URLs.

---

## 1. `npx getdesign@latest add apple` — does it exist?

**Verdict: Vaporware for the "drop in components" use case.** The package [`getdesign`](https://www.npmjs.com/package/getdesign) (by Mohtasham Murshid Madani, MIT, [github.com/MohtashamMurshid/getdesign](https://github.com/MohtashamMurshid/getdesign)) is real, latest 0.6.10, but it does **not** install Apple components. Its actual purpose: extract a *plain-text* `DESIGN.md` style document from any URL so AI agents can read it (a la Google Stitch). Per the README, `packages/cli` is a "placeholder package; not a full product surface yet." There is **no `add apple` subcommand** — the documented surface today is `npx skills add MohtashamMurshid/getdesign` (installs an agent skill into Claude/Cursor) and a web app. The closest real catalog flow uses `node scripts/getdesign-catalog.mjs list|search|download <slug>` per [issue #374](https://github.com/VoltAgent/awesome-design-md/issues/374), not an `add` verb.

**Closest real alternatives for "drop in Apple-inspired components into React + Tailwind":**
1. **shadcn/ui CLI** (`npx shadcn@latest add <component>`) — already installed. Use as the base.
2. **[liquid-glass-react](https://github.com/rdev/liquid-glass-react)** — Apple Liquid Glass effect, MIT, Next.js/SSR-safe, "battle-tested" per author.
3. **[Liquid Glass UI](https://liquidglass.liqueai.com/)** (liqueai) — Tailwind + React kit shipping Modal/Card/Quiz/Timeline.

**Gotcha:** `liquid-glass-react`'s SVG displacement filter degrades on Safari/Firefox per the README — keep a CSS-backdrop-filter fallback.

---

## 2. Apple-inspired React component libraries (beyond shadcn/ui)

| Pick | Use | License | Note |
|---|---|---|---|
| **`liquid-glass-react`** (rdev) | Frosted surfaces, modals, hero chrome | MIT | Production-grade. SSR safe. Safari falls back to backdrop-filter. [GitHub](https://github.com/rdev/liquid-glass-react) |
| **`@callstack/liquid-glass`** | RN-flavored option if we ever want native parity | MIT | Callstack maintains it. [npm](https://www.npmjs.com/package/@callstack/liquid-glass) |
| **`applemusic-like-lyrics`** (amll-dev) | Apple Music-style lyric/now-playing player; React + Vue bindings | MIT | Best in class for a music surface. [GitHub](https://github.com/Steve-xmh/applemusic-like-lyrics) |

**Top pick: `liquid-glass-react`** — single-purpose, tiny, drop-in `<LiquidGlass>` wrapper that gives the whole app the iOS 26 surface treatment without rewriting components.

**SF Symbols on web:** Apple's [SF Symbols](https://developer.apple.com/sf-symbols/) license forbids web use outside Apple platforms. Closest legal equivalents: **Lucide** (already a shadcn dep) and **[react-icons](https://react-icons.github.io/react-icons/)** with the `Sl` Iconscout SF-style set, or [Icons8 SF Symbols-style PNG/SVG](https://icons8.com/icons/set/music--style-family-sf-symbols). For a richer parity set, `phosphor-icons/react` is the closest open visual match.

**Apple Invites surfaces:** No OSS clone exists. The commercial alt is [Invyt.io](https://invyt.io/apple-invites-alternative); for OSS we copy the *anatomy* (full-bleed photo, glass card, RSVP CTA pinned bottom) and build it ourselves on `liquid-glass-react`.

---

## 3. Image upload pipelines for Convex

**Verdict: Native Convex storage + client-side pre-processing.** Per [docs.convex.dev/file-storage/upload-files](https://docs.convex.dev/file-storage/upload-files), the recommended pattern is the three-step upload-URL flow (mutation → POST → mutation to save storageId). Convex has **no built-in image transforms, resize, or EXIF strip** — confirmed via the docs and absence in the [r2 component repo](https://github.com/get-convex/r2).

**Top 3 for our stack:**
1. **Convex storage + `browser-image-compression` + `piexifjs` (client-side)** — zero new infra, zero new vendor.
2. **[UploadThing](https://uploadthing.com)** — drop-in but adds a vendor; useful if we ever exceed Convex's 2-min upload window.
3. **Cloudinary** — best transforms, but $89/mo entry tier and unpredictable scaling cost ([source](https://cloudinary.com/documentation/upload_images)).

**Why client-side strip+resize is right for IVARI:** guests at a wedding upload from iPhones, where photos average 4-6 MB with full GPS EXIF. Stripping EXIF on the device (privacy) and resizing to max 2048px/WebP before the Convex upload URL POST cuts payload ~80% and removes the [GPS leak risk](https://auth0.com/blog/read-edit-exif-metadata-in-photos-with-javascript/). [Sharp](https://sharp.pixelplumbing.com/) on the server is faster but Convex actions don't allow native node-gyp binaries, so pure-JS client-side is the lowest-friction path.

**Gotchas:** `piexifjs` is JPEG-only; for HEIC (iOS default) Convert to JPEG via `heic2any` first. `browser-image-compression` runs in a Web Worker by default — keep it that way.

---

## 4. Photo gallery + moderation queue

**Verdict: build the moderation queue ourselves on Convex; use OSS for grid + lightbox.**

| Pick | Role | Weekly DLs | Stars |
|---|---|---|---|
| **`react-photo-album`** | Masonry/rows/columns grid with responsive sizing | — | actively maintained |
| **`photoswipe`** | Lightbox (touch gestures, deep zoom) | 366k | 25k |
| **`lightgallery`** | Heavier; supports video/HTML | 75k | 7k |

Source: [npm-compare](https://npm-compare.com/lightbox2,lightgallery,magnific-popup,photoswipe), [LogRocket comparison](https://blog.logrocket.com/comparing-the-top-3-react-lightbox-libraries/).

**Top pick: `react-photo-album` + `photoswipe`** — react-photo-album owns the grid (it natively supports masonry layout per [reactscript](https://reactscript.com/best-image-gallery/)), photoswipe owns the lightbox. Combined bundle ~50KB gzipped.

**Moderation queue:** no good OSS drop-in exists for "guest photo wall + admin approve/reject." Roll our own — it's literally a `status: "pending" | "approved" | "rejected"` column on the photos table with a Convex query filter. ~80 LOC. Don't pull a CMS for this.

**Gotcha:** `lightgallery` is GPL-3 with a paid commercial license — avoid for a closed-source product. PhotoSwipe is MIT.

---

## 5. Group chat with roles on Convex

**Verdict: roll our own. Convex has a first-party tutorial for exactly this.**

The [Convex chat tutorial](https://docs.convex.dev/tutorial/) ships a live-updating chat in <50 lines. Convex's WebSocket sync engine *is* the realtime layer — bolting on Stream/Sendbird is pure waste at our scale.

**Top 3:**
1. **Native Convex (tutorial pattern + roles enum)** — best for <50 guests/event. ~200 LOC including roles, typing indicators, reactions.
2. **[stream-chat-react](https://getstream.io/chat/sdk/react/)** — polished UI, but free tier caps at 25 MAU and pricing scales fast.
3. **TalkJS / Sendbird** — paid from day 1; overkill.

**Gotchas:** Convex queries are reactive but not paginated by default — use [`usePaginatedQuery`](https://docs.convex.dev) for chat history. For ephemeral event chats, set a TTL cron (`internalMutation` + scheduled deletion 7 days post-event) — Convex storage isn't free.

For roles: a single `members` table with `eventId, userId, role: "host" | "co_host" | "guest"` keyed unique on `(eventId, userId)`. No library needed.

---

## 6. QR codes + share links

| Pick | Role | DLs/wk |
|---|---|---|
| **`qr-code-styling`** | Branded/styled (logo, gradient, dot shape) | 206k |
| **`qrcode.react`** / `react-qr-code` | Plain SVG, SSR-safe | 1.78M |
| **`qrcode`** (already installed) | Server-side / Node | — |

Source: [npm-compare qr-code-styling vs qrcode.react](https://npm-compare.com/qr-code-styling,qr.js,qrcode.react,qrious,react-qr-code).

**Top pick: `qr-code-styling`** — IVARI is invitation-grade; we want event-branded QRs (couple's monogram in the centre, event color gradient). The cost is ~30KB + browser-only (can't SSR). For server-side OG images, fall back to the existing `qrcode` package.

**Short links:** don't add Bitly/Dub. Use Convex for first-party short-link storage: `events/short/{slug} → eventId` resolves in a single query, no third-party dep, no privacy bleed.

**Web Share API on iOS standalone PWA:** `navigator.share({ title, text, url, files })` works on iOS 12.2+ Safari and in installed PWAs ([web.dev/articles/web-share](https://web.dev/articles/web-share)). For platform fallbacks: `wa.me/?text=` (WhatsApp), `sms:&body=` (iMessage/SMS) per [MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Share_data_between_apps). Must be invoked inside a user gesture and on HTTPS.

**Gotcha:** sharing files via `navigator.share({ files })` needs `navigator.canShare({ files })` check first — iOS rejects PNG > 10MB and HEIC entirely.

---

## 7. Stack Auth + Google OAuth — the `client_secret must be defined` fix

**Root cause confirmed:** the error fires when Stack Auth's Google provider is **enabled** in the dashboard but **no Client ID + Secret** has been entered. Stack uses "shared" dev keys for first-party OAuth providers if you don't supply your own — but that shared mode only works in development; production requires you to bring your own ([Stack Auth Production docs](https://docs.stack-auth.com/docs/getting-started/production)).

**Exact fix flow:**
1. **Google Cloud Console** → APIs & Services → Credentials → Create OAuth 2.0 Client ID (type: Web application).
2. **Authorized redirect URI:** `https://api.stack-auth.com/api/v1/auth/oauth/callback/google` (production) and add `http://localhost:8102/...` only if needed for local Stack instance per [Stack Auth Google docs](https://docs.stack-auth.com/docs/concepts/auth-providers/google).
3. **Stack Auth dashboard** → your project → **Auth Methods** → Add SSO Provider → Google → paste **Client ID** + **Client Secret** → Save.
4. **Env vars**: only `STACK_PROJECT_ID`, `STACK_SECRET_SERVER_KEY`, `STACK_PUBLISHABLE_CLIENT_KEY` (+ `VITE_*` mirror) are needed in app code. Google client_secret lives **only** in the Stack dashboard, not in `.env`.
5. Restart the SvelteKit dev server (Stack Auth reads providers at boot via API).

**Gotcha:** if you used shared dev keys earlier, the consent screen showed "Stack Development" — that's the tell that custom keys aren't wired. Once your own keys are saved, the screen rebrands to your app name.

---

## 8. iOS PWA install prompts

**Verdict: use [`pwa-asset-generator`](https://github.com/elegantapp/pwa-asset-generator) (CLI, MIT) or [Vite PWA Assets Generator](https://vite-pwa-org.netlify.app/assets-generator/cli) — never hand-craft.**

`pwa-asset-generator` scrapes the live Apple HIG via Puppeteer to produce every iOS icon size + every iPhone/iPad splash dimension (portrait + landscape) from a single SVG/PNG, and writes the `<link rel="apple-touch-icon">` and `<link rel="apple-touch-startup-image">` tags into `index.html` automatically.

**The "real app icon" trick:** use a **square 1024×1024 PNG with no transparency, no rounded corners** (iOS rounds them) as the source. Apple-touch-icon must be `180×180` for current iPhones; Safari rejects icons with alpha and renders a screenshot fallback if absent. The full set you actually need: 180×180, 167×167 (iPad Pro), 152×152 (iPad), 120×120 (legacy iPhone), 1024×1024 (manifest). Source: [firt.dev/pwa-design-tips](https://firt.dev/pwa-design-tips/), [progressier.com/pwa-icons-and-ios-splash-screen-generator](https://progressier.com/pwa-icons-and-ios-splash-screen-generator).

**Top 3 generators:**
1. **`pwa-asset-generator`** (CLI, free, MIT) — scriptable, source-of-truth.
2. **Vite PWA Assets Generator** — slots into our build if we move to Vite plugin pattern.
3. **Progressier web tool** — free, no install, copy-paste meta tags.

**Add-to-Home-Screen affordance:** Apple does not expose a `beforeinstallprompt` event on iOS — you must teach the user. The dominant pattern (used by Twitter Lite, Starbucks PWA): detect iOS Safari + non-standalone via `navigator.standalone === false`, show a one-time bottom sheet with the literal Share-icon glyph and the words "Tap [icon] then Add to Home Screen."

**Gotcha:** landscape splash screens are *ignored* on iOS — Safari stretches the portrait splash. Don't waste design time on landscape variants.

---

## 9. OSS event/RSVP/invitation projects

| Project | Strength | Weakness for IVARI |
|---|---|---|
| **[Mobilizon](https://joinmobilizon.org)** (Framasoft, AGPL) | Federated, group-management, RSVP, privacy-first. Best portal/RSVP UX in OSS land. | Elixir/Phoenix; can't fork code. Mine it for UX patterns only. |
| **[Pretix](https://pretix.eu)** (AGPL) | Mature ticketing, payments, check-in. | Conference-grade; overkill for parties. Steal their check-in QR flow. |
| **[gath.io](https://gath.io)** | Lightweight RSVP-by-email; minimal | Closest spiritual cousin; Node/TS so readable. |
| **[Hi.Events](https://hi.events)** | OSS ticketing, modern stack | Commerce-first; not invitation-aesthetic. |

Source: [medevel 17 OSS event managers](https://medevel.com/17-event-management/), [hi.events/open-source-event-ticketing](https://hi.events/open-source-event-ticketing).

**What to steal per surface:**
- **Portal**: Mobilizon's group/event hierarchy (event belongs to a group, members carry roles across events).
- **RSVP**: gath.io's email-magic-link flow (no account required for guests).
- **Memory Wall**: nothing OSS does this well — own the surface.
- **Group Chat**: Mobilizon's per-event discussion thread + role badges.

**Verdict: do not fork.** All viable options are AGPL (legal poison for a closed-source product) or wrong stack. Mine UX, ship clean.

---

## 10. Voice transcription for V8 "Voice Forge"

| Provider | Price/min | Notes |
|---|---|---|
| **AssemblyAI** | $0.0025 | Cheapest managed. Includes diarization, sentiment. [source](https://deepgram.com/learn/best-speech-to-text-apis-2026) |
| **Deepgram Nova-3** | $0.0043 | Best for realtime streaming. |
| **OpenAI GPT-4o Mini Transcribe** | $0.003 | Cheapest from OpenAI. [source](https://tokenmix.ai/blog/whisper-api-pricing) |
| **OpenAI Whisper / GPT-4o Transcribe** | $0.006 | Original Whisper API. |
| **whisper.cpp (self-host)** | Infra only | Cuts cost only above ~5,000 hr/month. |

**Top pick: OpenAI `gpt-4o-mini-transcribe` at $0.003/min** — IVARI events are ephemeral, low-volume (a wedding's worth of voice notes is maybe 30 min total = $0.09). Diarization isn't needed for a personal voice memo. AssemblyAI is technically cheaper but adds a second vendor; we're already on OpenAI for other features and the unified billing wins.

**Convex pattern:** in a Convex `action` (not mutation — actions can fetch external APIs), accept a `storageId`, fetch the file via `ctx.storage.get(storageId)`, POST to `https://api.openai.com/v1/audio/transcriptions` with `multipart/form-data`, persist the text via a downstream mutation. Use `internalAction` so the OpenAI key stays server-only.

**Gotcha:** Whisper API has a **25 MB upload cap**. For long voice memos, chunk client-side or use the OpenAI streaming endpoint. Convex actions have a 10-min timeout — fine for anything under ~60 min audio.

---

## Recommended stack additions

Run these next (`pnpm add` from `/home/adonna/Projects/ivari-events`):

- **`liquid-glass-react`** — Apple iOS 26 frosted surface for portal/RSVP/modal chrome. SSR-safe, MIT.
- **`react-photo-album`** — masonry/rows photo grid for the Memory Wall.
- **`photoswipe`** — touch lightbox for the Memory Wall (paired with react-photo-album).
- **`qr-code-styling`** — branded event QR codes with monogram + gradient.
- **`browser-image-compression`** — client-side resize before Convex upload (Web Worker, MIT).
- **`piexifjs`** — strip EXIF/GPS from guest photos pre-upload (privacy-first).
- **`heic2any`** — convert iOS HEIC → JPEG so piexifjs and Convex can handle it.
- **`pwa-asset-generator`** (devDependency) — regenerate the full iOS icon + splash set from one SVG.
- **`openai`** (official SDK) — Voice Forge transcription via `gpt-4o-mini-transcribe` ($0.003/min).
- **`phosphor-icons/react`** — closest visual match to SF Symbols, MIT, tree-shakeable.

Skip: `getdesign` (vaporware for our use case), shadcn-ui's Apple template (doesn't exist), UploadThing (unnecessary vendor), stream-chat-react (overkill), lightgallery (GPL trap), AssemblyAI (single-vendor consolidation > $0.0005/min savings).
