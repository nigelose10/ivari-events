# V7 — Competitive Roadmap

**Goal**: Make IVARI demonstrably better than Apple Invites and Paperless Post on both UX moments and feature surface area. Three sprints (V7, V8, V9), starting with a 2-week V7.

**Posture**: We are a generative-AI-native, Apple-aesthetic, cross-platform (PWA) event app. We don't have to clone competitors — we have to pick the right battles and decisively out-do them on a small set of moments that get screenshot-shared on Twitter and TikTok.

---

## 1. Honest Gap Analysis

### IVARI vs Apple Invites

| Capability | Apple Invites | IVARI today | Verdict |
|---|---|---|---|
| AI image generation | Apple Playgrounds (curated, on-device) | Nano Banana, prompt-driven, regenerable | **IVARI wins** — more flexible, branded outputs |
| Collaborative music playlist | Apple Music collab playlist (HUGE for guests) | None | **Apple wins** — flagship feature gap |
| Native calendar integration | iOS Calendar 1-tap | None (we have a Maps link in copy) | **Apple wins** |
| Maps deep-link | MapKit 1-tap | We store lat/lng but don't emit `maps://` / `geo:` links | **Apple wins** |
| iCloud Photos shared album | Native, post-event | Memory Wall (own implementation, real-time) | **Parity** — IVARI works for non-Apple guests |
| Weather on event day | Yes, on event surface | None | **Apple wins** |
| Contacts picker | Native iOS picker | CSV paste only | **Apple wins** for iOS hosts |
| Cross-platform | iOS-only | PWA, works everywhere | **IVARI wins** |
| Event customization | Theme presets | Custom theme color, custom AI art, custom survey | **IVARI wins** |
| Multi-language | English-leaning | 10 languages on Portal | **IVARI wins** |
| Survey / RSVP questions | Basic | Custom survey builder | **IVARI wins** |
| Analytics for host | None | Pulse analytics tab | **IVARI wins** |
| QR code | None | Server-rendered PNG | **IVARI wins** |
| Check-in mode | None | Built-in | **IVARI wins** |

### IVARI vs Paperless Post

| Capability | Paperless Post | IVARI today | Verdict |
|---|---|---|---|
| Designer templates | Hand-illustrated, named artists | 4 generic templates + AI art | **PP wins on craft, IVARI wins on uniqueness** |
| Envelope-open animation | Iconic letter-unfold reveal | None (static Portal load) | **PP wins** — biggest emotional moment gap |
| RSVP-tracking dashboard | Strong | Pulse + analytics | **Parity** |
| Reminders / nudges | "Sarah hasn't replied" | Manual SMS blast only | **PP wins** |
| Thank-you notes flow | Yes | None | **PP wins** |
| Save-the-dates lifecycle | Yes (separate product) | None | **PP wins** |
| Gift registries | Partner integrations | None | **PP wins** |
| Physical paper invites | Lob-backed shipping | None | **PP wins** (but a deferred fight for us) |
| Memory wall / post-event photos | None | Yes, real-time | **IVARI wins** |
| Guest portal uniqueness | Fixed designs | AI art per event, custom theme color, custom survey | **IVARI wins** |
| Realtime updates | None | Convex reactive everywhere | **IVARI wins** |
| Mobile install | Mobile web | PWA installable | **IVARI wins** |

### Where IVARI is genuinely behind right now

1. No collaborative music — Apple's signature feature.
2. No envelope-open moment — Paperless Post's signature feature.
3. No `.ics` calendar files or native maps deep-links — table stakes both ship.
4. No weather — table stakes Apple ships.
5. No automated reminders — table stakes Paperless Post ships.
6. No co-hosts — every wedding/corporate event needs this.
7. Portal still has design issues (DESIGN-AUDIT.md flags purple gradients, centered hero, emoji templates) — Paperless Post would never ship this.

---

## 2. Top 8 Wedge Features

### W1. Voice Forge (audio-to-event)
- **What it does**: Host taps a mic in Forge, says "It's my 30th, want to do something dressy at a downtown rooftop end of June." Whisper transcribes, an LLM extracts title, vibe prompt, suggested date, suggested location, dress code, suggested survey questions. Image generates from extracted prompt.
- **Why it beats Apple + PP**: Both still require typing into 6+ fields. We compress event creation from 60 seconds of typing to 8 seconds of speaking. This is the "your first IVARI event in one breath" demo moment.
- **Convex sketch**: New action `events.voiceCreate` accepts a Convex Storage audio blob, streams to Whisper API, then to LLM with a structured-output schema, returns a draft event payload. New table `voiceDrafts` (audio fileKey, transcript, parsedFields, status). Forge polls a query until parsing completes (Convex actions cap at 10min, well within budget).
- **UI surface impact**: New mic affordance on Forge step 1, replacing or augmenting the textarea. New "review extracted fields" interstitial.
- **Effort**: M (Whisper integration + LLM JSON-schema output is well-trodden; UI is one new component + one screen).
- **Wow**: 9/10.

### W2. Collaborative Soundtrack (Spotify + Apple Music)
- **What it does**: Each event has an embedded shared playlist. Guests submit songs via the survey ("What song HAS to play?"). IVARI dedupes, builds the playlist via Spotify Web API for hosts who connect Spotify, and via MusicKit for Apple Music hosts. Playlist link shown on Portal and Pulse, plus auto-attached to Memory Wall.
- **Why it beats Apple + PP**: Apple Invites locks this to Apple Music + iOS only. We work cross-platform — Android guests on a wedding playlist with iPhone guests. PP doesn't have it at all.
- **Convex sketch**: New table `eventPlaylists` (eventId, provider, providerPlaylistId, ownerToken). New action `playlists.syncSongs` runs after each survey submission with a song answer, calls Spotify search → adds top match. OAuth tokens stored encrypted; refresh on `internalAction` cron.
- **UI surface impact**: New panel on Pulse "Soundtrack" tab; embedded playlist card on Portal; survey question type "song-pick" with autocomplete via Spotify search.
- **Effort**: L (Spotify is fine, Apple MusicKit JS adds complexity, and Spotify production OAuth needs app review — start in dev mode).
- **Wow**: 10/10.

### W3. Calendar (`.ics`) + Maps Deep-Links per Guest
- **What it does**: Every Portal page exposes "Add to Calendar" (downloads a `.ics` with the host's name, location, description, RSVP link) and "Open in Maps" (emits `maps://` for Apple, `geo:` for Android, falls back to `https://maps.google.com/?q=lat,lng`). Per-guest `.ics` includes the guest's individual portal token in the description so reminders chain back.
- **Why it beats Apple + PP**: Apple does it for Apple users only. PP has a basic web link. Ours works on every device with one tap.
- **Convex sketch**: New `convex/http.ts` HTTP route `/ics/:eventId/:guestToken` that returns `text/calendar` with VEVENT including ALARM (24h reminder, 2h reminder). Maps URL is purely client-side platform detection.
- **UI surface impact**: Two new buttons on Portal "Event Details Bar"; one new button on RSVP success screen.
- **Effort**: S.
- **Wow**: 6/10 — quiet table-stakes, but its absence is screaming.

### W4. Weather on Event Day (OpenMeteo)
- **What it does**: 7 days before event, Portal shows a glass-card forecast strip — temp, conditions, "looks like rain — bring an umbrella" copy. On event day, current conditions update hourly.
- **Why it beats Apple + PP**: PP doesn't have it. Apple has it for Apple users. We render it for every guest, themed to event color.
- **Convex sketch**: `internalAction` cron `weather.refresh` runs daily, reads all events with date in next 7 days + lat/lng, hits OpenMeteo (no key, free tier covers us), writes to new table `eventWeather` (eventId, fetchedAt, forecast JSON). Portal `events.getBySlug` joins it.
- **UI surface impact**: New `WeatherStrip` component on Portal hero; small icon on Ledger card on event-day.
- **Effort**: S.
- **Wow**: 7/10 — feels magical because nobody else bothers for non-iOS.

### W5. Co-Hosts with Permission Tiers
- **What it does**: Any event can have 1+ co-hosts with roles: `editor` (full edit), `manager` (RSVPs/blasts only), `viewer` (read-only Pulse). Co-hosts get a separate Stack Auth invite link. Audit log of who did what (sent blast, regenerated image, edited time).
- **Why it beats Apple + PP**: Neither has multi-host. Every wedding planner, every corporate event coordinator needs this.
- **Convex sketch**: New table `eventHosts` (eventId, userId, role, invitedBy, invitedAt). All write functions in `events.ts`, `guests.ts`, `notifications.ts` check `eventHosts` membership instead of `event.hostId === ctx.userId`. New table `eventAuditLog` (eventId, actorId, action, payload).
- **UI surface impact**: New "Team" tab in Pulse. New invite-by-email modal. Audit feed in Pulse settings.
- **Effort**: M (auth refactor touches every mutation).
- **Wow**: 6/10 — utility wow, not visceral wow, but a deal-breaker for the wedding/corporate market.

### W6. Smart Auto Follow-Ups (AI-drafted nudges)
- **What it does**: 5 days before event, IVARI scans non-responders + maybes. For each, an LLM drafts a personalized SMS/email referencing host name, event detail, one warm line ("hope you can make it — would love to have you"). Host sees a queue, taps approve-all or edit-individually. Sent via existing notification pipeline.
- **Why it beats Apple + PP**: PP has generic "you haven't replied" emails. Ours are written like the host wrote them.
- **Convex sketch**: `internalAction` cron `reminders.draftDaily` runs daily, finds events with deadline ≤7 days, calls LLM with guest context, writes to new table `reminderDrafts` (guestId, channel, body, status: pending|approved|sent). Pulse shows queue. On approve, dispatches via existing `notificationActions`.
- **UI surface impact**: New "Nudges" panel in Pulse "Guests" tab with approve/edit/skip per draft.
- **Effort**: M.
- **Wow**: 8/10 — host gets to feel like a thoughtful organizer with zero work.

### W7. Live Event Mode
- **What it does**: When event status flips to `live` (auto on event-day at host-set start time), Portal transforms: hero shrinks, real-time photo stream front and center, live arrival counter ("23 of 47 here"), live polls ("first dance song?"), guest chat thread. After event, reverts to Memory Wall.
- **Why it beats Apple + PP**: Neither has anything like a live mode. Apple Invites goes static after event start. We become the second screen of the actual party.
- **Convex sketch**: Add `live` to event status union. New tables `eventPolls` (eventId, question, options, expiresAt) and `eventPollVotes` (pollId, guestToken, choice). New table `eventChat` (eventId, guestToken, body, createdAt). All existing Convex reactive queries already give us realtime — no new infra. Cron `events.transitionToLive` flips status when `eventDate` is now and any guest has checked in.
- **UI surface impact**: Major Portal rewrite for live state; new "Live" tab in Pulse with poll creator and chat moderation.
- **Effort**: L.
- **Wow**: 10/10 — turns IVARI into the event itself, not just the invite.

### W8. Animated Envelope Reveal (one-time, per guest)
- **What it does**: First time a guest opens their Portal link, a sealed envelope card sits center-stage with the host's wax seal (initial-stamped). Tap → wax cracks (audio: subtle crack), envelope unfurls in a 1.4s GSAP sequence, AI art emerges from inside, invitation copy types in. Stored in localStorage so subsequent visits skip straight to the Portal. Can be replayed via "Reopen invitation" link in footer.
- **Why it beats Apple + PP**: This is the direct fight on Paperless Post's home turf. Their letter-unfold is a 2D fold. Ours is a wax-seal break with the AI art literally bursting out — physically impossible in their pre-rendered template world because our art is generated.
- **Convex sketch**: Pure client. Read `guest.firstSeenAt` from `portalViews` table; if no prior view by `visitorHash`, play sequence and set localStorage flag. Audio assets in `public/audio/`.
- **UI surface impact**: New `EnvelopeReveal` component owns Portal first-paint. Wax seal SVG generated client-side from host initials + theme color.
- **Effort**: M.
- **Wow**: 10/10.

---

## 3. Top 5 UI/UX Moments

### M1. Wax-Seal Envelope Reveal (Portal first-load)
- **Where**: Portal.tsx, runs on first visit per guest.
- **Visual**: Black void. Single envelope, 60% viewport-height, floats with subtle parallax. Wax seal (warm amber, host's monogram) glints from a slow specular sweep. Tap. Audio: faint vinyl-crack. Wax fractures into 6 polygons that fall with physics (Framer Motion `useSpring`). Envelope flap lifts (CSS 3D rotateX), cards inside expand outward in stagger. AI hero art does a "born" zoom — starts at 80% blur 40px, settles to focus over 900ms. Title types in (split-text per word, 60ms cadence). Glass invitation block fades up below.
- **Beats them how**: PP's reveal is a cardstock fold in front of an SVG illustration. Ours has the AI hero ART bursting out — only possible because each event has unique generated artwork.
- **Implementation**: GSAP for the seal-shatter physics (Framer Motion can't compose 6 trajectory paths cleanly), Framer Motion for layout transitions, `splitting.js` for text reveal. Audio: `crack.mp3` (license-clean), preload on Portal mount with `<link rel="preload">`. Disable on `prefers-reduced-motion`.

### M2. AI Image Generation as Portal Opening (Forge)
- **Where**: Forge.tsx step 2, when "Generate Vibe" is tapped.
- **Visual**: The Forge canvas darkens with a circular mask iris. From the click point, a warm-amber radial bloom expands. As Nano Banana streams, the inside of the iris reveals fragmented latent-noise (procedural Perlin field, cycles through warm hues). When the image returns, the noise field "settles" into the final image — pixels lock in like a photograph developing in a dark room. Subtle audio: long inhale → release.
- **Beats them how**: Apple Playgrounds shows a generic shimmer. PP doesn't generate anything. We reframe AI generation as a portal opening to another world — which is exactly what the user is doing emotionally.
- **Implementation**: WebGL shader (existing `AmbientBackground.tsx` already runs a Three.js layer — extend it), or pure CSS conic-gradient + filter blur fallback. Image fade-in via `mask-image: radial-gradient`.

### M3. RSVP Confirmation Climax (Portal)
- **Where**: Portal.tsx, on RSVP submit success.
- **Visual**: User taps "Yes, I'll be there." Button morphs (Framer Motion layout animation) into a glowing orb. Orb expands, fills the viewport with a warm-amber gradient wash. Particle burst (50 small glass shards reflecting event accent color) emanates outward. Center: typeset "You're in." in display serif, hold 800ms. Below it: "We saved you a seat." Then the screen recedes to a calm post-RSVP state showing date / location / add-to-calendar / soundtrack. Audio: low resonant chord (event-themed, ~3s).
- **Beats them how**: PP's confirmation is a checkmark and a redirect. Apple's is a toast. Ours feels like crossing a threshold.
- **Implementation**: Framer Motion `layoutId` shared between button and orb. Particle system via React Three Fiber (lightweight, 50 instances). Type-out via `splitting.js`.

### M4. Polaroid Photo Develop (Memory Wall upload)
- **Where**: MemoryWall.tsx, after a guest uploads.
- **Visual**: User selects file. Thumbnail enters viewport as a stark white rectangle (the polaroid back). Rotates 180° around Y-axis with a slow ease (1.2s). Front shows the image at 100% saturation (overshoot) → settles to 95% with slight grain overlay. Polaroid rotates 4° random tilt and joins the masonry grid with a soft thud (audio cue, optional). New photo's glass frame has a 600ms warm glow ring, then settles. Other photos shift down with stagger.
- **Beats them how**: PP doesn't have post-event photos. Apple's iCloud shared albums are functional but stylistically inert. Ours feels like a real photo being added to a fridge.
- **Implementation**: CSS 3D `transform: rotateY` + `backface-visibility: hidden`. Random tilt via `style={{ rotate: Math.random() * 8 - 4 }}`. Layout stagger via Framer Motion `<AnimatePresence>` + `layout`.

### M5. "Your Invitation Is Born" (Forge completion)
- **Where**: End of Forge final review step on Create.
- **Visual**: Final review card sits centered. User taps "Create Event." Card flattens into a single glowing line, that line draws into a rectangle that becomes the invitation, which then physically slides into a wax-sealed envelope (mirroring M1 in reverse — elegant call-and-response). Envelope receives a stamp (event date), then redirects with a 1.6s cinematic transition into Pulse. Audio: stamp-thunk on date imprint.
- **Beats them how**: Both competitors hard-redirect. We make creating an event feel like sending a real letter.
- **Implementation**: Framer Motion `layoutId` chaining; reuse the envelope SVG from M1 to maintain motif consistency. Stamp imprint is a CSS `mask-composite` overlay.

---

## 4. Phasing

### V7 (next 2 weeks) — Table stakes + one signature moment
**Theme**: "Plug the gaps, ship the wow."

Features:
- W3 Calendar + Maps deep-links (S)
- W4 Weather on event day (S)
- W5 Co-hosts (M) — *but ship `editor` role only; defer manager/viewer*
- W6 Smart Auto Follow-Ups (M)

Moments:
- M1 Wax-Seal Envelope Reveal (M) — *the single screenshot-worthy demo for V7*
- M3 RSVP Confirmation Climax (S–M) — *cheap given M1 motion infra*

Hard scope cut: no live mode, no music, no voice. Two weeks is two weeks.

### V8 (weeks 3–6) — Generative leverage
**Theme**: "Lean into AI as the differentiator."

Features:
- W1 Voice Forge (M)
- W2 Collaborative Soundtrack — Spotify only first (L)
- W5 expand: manager + viewer roles, audit log

Moments:
- M2 AI Generation Portal Opening (M)
- M5 Invitation Is Born (S–M)

### V9 (weeks 7–10) — Live event domination
**Theme**: "Be the second screen of the party."

Features:
- W7 Live Event Mode (L)
- W2 expand: Apple MusicKit JS
- Stretch: gift contributions / virtual tip jar (Stripe Connect)

Moments:
- M4 Polaroid Photo Develop (S–M)

---

## 5. Sequencing & Risk

**Hard dependencies**:
- M1 envelope motion infrastructure → reused by M3 and M5. Build M1 first or you'll rebuild three times.
- W5 Co-hosts → blocks audit log, blocks manager-tier of W6 (a manager with no viewer permission needs the role check). Sequence W5 before W6's UI polish.
- W2 playlist → depends on Spotify production OAuth approval (typically 2–6 weeks once submitted). Submit the app **week 1 of V7** even though we won't use it until V8, or we'll be blocked.
- W7 Live Mode → no hard tech blockers (Convex reactivity is already there) but needs M-level moderation work for chat. Sequence after W5 audit log so abuse is loggable.

**3rd-party risks**:
- **Whisper API**: $0.006/min audio. 30s utterance = $0.003. At 10K events/mo with 70% adoption, ~$21/mo — safe.
- **OpenMeteo**: free, no key, 10K req/day per IP. Cron from Convex with `internalAction` is one IP, may need to throttle if >10K events/week. Add Redis-style cache key: `weather:${lat}:${lng}:${date}`, share between events with same coords.
- **Spotify OAuth production scope**: requires app review (form + screenshots + 2-week wait). Start in dev mode for internal testing, submit for review at V7 kickoff.
- **Apple MusicKit JS**: requires Apple Developer enrollment ($99/yr) + JWT signing with private key. Defer to V9 — Spotify-only is fine for V8 ship.
- **Stripe Connect**: onboarding takes 2–4 weeks for marketplace mode + KYC. Defer to V9 stretch.
- **Lob** (paper invites): real shipping address verification + USPS rate cards. Skip entirely until V10+ — not worth chasing PP on their physical-paper moat.

**Internal risks**:
- DESIGN-AUDIT.md flags a heap of typography, color, and layout debt on Portal — *exactly the surface where M1 lives*. **Block V7 motion work behind the design-audit Portal rewrite** or M1 will land on a Portal that still has purple gradients and a centered hero. Two-week V7 estimate assumes Portal rewrite is in flight in parallel by the design pass already scoped.
- Convex action 10-min cap is fine for everything proposed except a long Whisper transcription on a poor connection. Mitigate: cap audio at 60s in Forge, reject longer client-side.
- Stack Auth JWT bridge already migrated — co-host invites can ride existing flow with `eventHosts` membership check, no new auth surface needed.

**Single sequencing rule**: if V7 ships only **M1 + W3 + W4**, that's still a better launch than the current state. Cut M3 and W6 before cutting M1.
