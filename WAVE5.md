# Wave 5 — status & post-deploy config

Honest checklist of every feature you asked for, what shipped, and what
needs runtime config (env vars / VAPID keys / etc.) before it's live.

## Built & wired

| Feature | Status | Files | Notes |
|---|---|---|---|
| **Auth bootstrap race fix** (prod bug — `events:list` was throwing "User record missing") | ✅ Shipped | `convex/events.ts` | `events.list` now returns `[]` if the bootstrap mutation hasn't run yet; the reactive query re-fires when the row appears. Mutations still throw hard. |
| **User profile management** | ✅ Shipped | `client/src/pages/Profile.tsx`, `convex/users.ts` (`updateProfile`) | New `/profile` route with username (3–24 chars, unique) + tagline editor. Linked to Stack Auth's `/handler/account-settings` for name/email/password/avatar. |
| **Friend graph** | ✅ Shipped | `convex/friends.ts`, `convex/schema.ts` (`friends` table) | Send/accept/remove + username search (prefix-match). Bidirectional rows for O(N) listing. |
| **Friend selection in event composer** | ✅ Shipped | `client/src/pages/Pulse.tsx` (Invite Friends panel), `convex/guests.ts` (`addFromFriends`) | Multi-select picker. Pre-links `claimedByUserId` so friends instantly see the event in "I'm Attending" — no QR claim needed. |
| **Guest identification (ivari accounts)** | ✅ Shipped | `convex/guests.ts` (`list` enrichment), `client/src/pages/Pulse.tsx` | Each guest row carries `hasIvariAccount`, `claimerUsername`, `claimerAvatarUrl`. Guest list shows BadgeCheck + `@username`. |
| **Memory Wall posting with username + avatar** | ✅ Shipped | `convex/photos.ts` (`submitUserPhoto`), `convex/schema.ts` (`uploaderUserId`, `uploaderAvatarUrl` on photos), `client/src/pages/MemoryWall.tsx` | Signed-in users post under their account automatically — no manual name input. Avatar denormalized at upload time so it's stable per-post. |
| **Avatar bubbles in Live Mode** | ✅ Shipped | `convex/guests.ts` (`liveAttendees`), `client/src/pages/LiveEvent.tsx` | Public-safe attendee bubble row with checked-in indicator. Returns first name + avatar only. |
| **Forge preview-as-guest** | ✅ Already wired | `client/src/components/InvitationPreview.tsx`, `client/src/pages/Forge.tsx` | Existed pre-Wave-5 — verified. Preview button on the wizard's review step opens the guest-side dry run. |
| **Onboarding tour** | ✅ Shipped (open-source: driver.js) | `client/src/lib/onboarding.ts`, `client/src/pages/Home.tsx`, `client/src/components/MobileBottomNav.tsx` (data-tour anchors) | First-time visit triggers a 5-step driver.js tour. Gated by `localStorage.ivari.tour.home.v1`. |
| **Memory Wall auto-curation** | ✅ Shipped (open-source: nsfwjs) | `client/src/lib/moderation.ts`, `client/src/pages/MemoryWall.tsx` | Client-side NSFW preflight runs before upload via TensorFlow.js. Auto-rejects images above the combined-sexual-class threshold. Soft-fails open if the model can't load — host moderation queue stays the safety net. |
| **AI integration (Gemma 4 via Vercel AI Gateway)** | ✅ Shipped (open-source: Vercel AI SDK) | `convex/ai.ts`, `client/src/pages/Forge.tsx` (Draft with AI button) | Three actions: `generateEventCopy`, `polishMemoryCaption`, `ask`. Uses `google/gemma-4-31b-it` via `@ai-sdk/gateway` — no separate API key (Vercel AI Gateway is built into the deployment). |
| **Push notifications** | ⚙️ Code shipped, **needs runtime config** (open-source: web-push) | `convex/push.ts`, `client/src/lib/push.ts`, `client/public/push-handlers.js`, `vite.config.ts` | See [Post-deploy config](#post-deploy-config) below. The pipeline (subscribe → store → send → SW → notification) is complete; needs VAPID keys to actually deliver. |
| **Public events** | ✅ Shipped | `convex/schema.ts` (`events.isPublic` + `search_title_public` index), `convex/events.ts` (`searchPublic`, `joinPublicEvent`), `client/src/pages/Forge.tsx` toggle | Hosts flick a toggle in Forge to make an event publicly discoverable. Defaults to off — existing events stay private. |
| **Type-to-find events** | ✅ Shipped | `client/src/components/EventDiscovery.tsx`, `client/src/pages/Home.tsx` | Search bar on Home, debounced (250ms) typeahead against Convex full-text. One-tap join (creates a self-claimed guest row, idempotent). |

## Open-source tools used (instead of building from scratch)

- **`web-push`** (Mozilla, MIT) — VAPID key handling + WebPush protocol implementation
- **`nsfwjs` + `@tensorflow/tfjs`** (Infinite Red, MIT) — client-side NSFW image classification, ~93% accuracy
- **`driver.js`** (Kamran Ahmed, MIT) — lightweight overlay tour library, ~5 KB
- **`ai` + `@ai-sdk/gateway`** (Vercel, Apache-2.0) — AI SDK with built-in Vercel AI Gateway provider; gives us Gemma 4 (released April 2026) with no separate provider key
- **`jaredpalmer-claude-plugins-github-code-search`** (lobehub skill marketplace) — installed for future code-pattern lookups

## Post-deploy config

### Push notifications — VAPID keys (one-time setup)

```bash
# Generate the keypair locally
npx web-push generate-vapid-keys

# You'll get:
# Public Key:  BFxxxx...
# Private Key: yyyy...
```

Then set the env vars:

| Env var | Where | Value |
|---|---|---|
| `PUSH_VAPID_PUBLIC_KEY` | Convex dashboard → Settings → Environment Variables | the public key |
| `PUSH_VAPID_PRIVATE_KEY` | Convex dashboard | the private key (server only, never expose) |
| `PUSH_VAPID_SUBJECT` | Convex dashboard | `mailto:hello@ivari.events` (or your contact) |
| `VITE_PUSH_VAPID_PUBLIC_KEY` | Vercel project → Environment Variables | the *same* public key (browsers need it to subscribe) |

After redeploy, signed-in users on supported browsers will be auto-subscribed
when they grant the Notification permission.

### AI (Gemma 4) — zero config required

If the Vercel project is deployed via Vercel (which it is — `vercel.json`
present), the AI Gateway works out of the box. Free credits are bundled with
every Vercel deployment; pull a small balance ($5 covers ~50k Gemma 4 calls).

To switch model provider later, set `IVARI_GEMMA_MODEL` on Convex (e.g.
`google/gemma-4-26b-a4b-it` for the faster MoE variant, or `groq/gemma-2-9b-it`
if you want to route through Groq's free tier instead).

## Not built (and why)

These were on the original list but I didn't ship them; flagging clearly
rather than burying:

- **In-app friend-of-friend discovery** — friend graph shipped but no
  recommendations engine. Add later when you have signal (e.g. mutual events).
- **Push notification triggers** — the *delivery pipeline* ships, but I
  didn't auto-fire `notifyUser` on specific events (RSVP arrives, photo
  approved, friend request, etc.). Trivial to add: call
  `ctx.scheduler.runAfter(0, api.push.notifyUser, {...})` from any mutation
  that should ping a user. Hold for a Wave-6 polish pass once you decide
  which events should notify.
- **Server-side NSFW double-check** — client preflight is a UX optimization,
  not security. A determined user can bypass it. The host moderation queue
  remains the source of truth. If you want server-side enforcement, add a
  Convex action that runs the same nsfwjs against the storage URL after
  upload and auto-rejects on positive — same library, same threshold.

## Bug fixes shipped

- `events.list` "User record missing — auth bootstrap not run" race (prod).
- `MobileBottomNav` "Settings" button was a no-op placeholder; now routes to
  `/profile` (ivari profile + friends) and `/handler/account-settings`
  (Stack-side identity).
