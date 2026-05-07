# Wave 7 — UI/UX cleanup + boneyard skeleton system

## What changed

### Pulse — "everything jampacked" → grouped surfaces

The Overview tab had **6 separate GlassCards** stacked in a 2-col grid plus
**3 nav cards** plus a danger zone. That was the visual sloppiness you
called out.

Replaced with **2 grouped surfaces**:

| Old | New |
|---|---|
| 4 separate toggle cards (SMS, Memory Wall, Public Discovery, Claim Mode) | One `Settings` GlassCard with rows separated by hairlines, plus an inline expand-on-public for claim flow |
| 3 nav cards (Memory Wall link, Chats link, Live link) | One `Quick links` GlassCard with tappable rows |
| Heavy "Delete Event" GlassCard | Subtle text-button at the bottom — visual rest, not another panel |

Two new helper components live at the top of `Pulse.tsx`:
- `<SettingRow>` — icon + label + desc + toggle in one inline row
- `<QuickLinkRow>` — icon + label + desc + chevron, navigates on click

Visual element count on Overview tab dropped from 11 cards → 4 cards.

### Home — more whitespace, cleaner section break

- `space-y-4` → `space-y-8` on the events column (more breathing room)
- `pb-16` → `pb-24` (no nav crowding)
- Loading spinner replaced with a 3-row shimmer skeleton matching the
  EventCard layout — see "Boneyard system" below for the full plan

### Onboarding tour — already re-themed in Wave 6

(Glass/dark token override on driver.js — kept from previous round.)

## Boneyard skeleton system

[`boneyard-js`](https://www.npmjs.com/package/boneyard-js) is now installed
as a devDep. It auto-captures pixel-perfect skeleton layouts from the live
DOM via Playwright at three breakpoints (375px, 768px, 1280px).

### Files added
- `boneyard.config.json` — output to `client/src/bones/`, shimmer animation
  tuned to the app's glass tokens (oklch values), 60ms stagger, 220ms transition
- `client/src/bones/registry.js` — empty stub; populated by the CLI
- `package.json` script: `pnpm boneyard:build` (runs `boneyard-js build` against
  `localhost:5173` and writes the bones JSON)

### Wired surfaces
- `client/src/pages/Home.tsx` — `<Skeleton name="home-events-list">` wraps the
  events list. Falls back to a hand-rolled 3-row shimmer until first capture.

### How to capture real bones (one-time host action)

```bash
# Terminal 1
pnpm dev

# Terminal 2 — once the dev server is up
pnpm boneyard:build
```

That writes real layout data to `client/src/bones/`. Commit those files;
they're static JSON. The same `<Skeleton>` JSX then renders pixel-perfect
placeholders matching the actual EventCard sizing.

### Global instruction added to ~/.claude/CLAUDE.md

Per your request, the Adonna-wide design rule is now codified:

> Use `boneyard-js` for skeleton loaders on every async surface. Never
> ship a spinner-only loading state.

Lives in CLAUDE.md so every new project picks it up automatically.

## Honest gaps this round didn't close

- Only Home's events list got a Skeleton wrapper. MemoryWall, LiveEvent
  attendees, Pulse loading, ChatsIndex, Profile/friends search — all still
  show their legacy spinners. Wrapping them is mechanical (~20 lines each)
  but I held it for the next pass to keep this commit reviewable.
- **The `boneyard:build` capture step has not been run.** Skeletons will use
  the hand-rolled fallback shape until you start the dev server and run the
  CLI. The fallback already feels far better than the spinner — you can
  ship today without capturing — but pixel-perfect bones are a follow-up.
- Forge wizard wasn't refactored. It's a step-flow with one section visible
  at a time, so it's not actually jampacked — but a typography pass would
  still help.
- Profile and ChatsIndex didn't get the consolidated-surface treatment.
  Both are already pretty minimal.

## What was deliberately NOT changed

- Color tokens — sticking with the existing oklch palette
- Geist font — already correct per DESIGN.md
- Tab bar layout — Wave 6 already added Chat
- The `EnvelopeReveal` cinematic — intentional drama, not slop
