# IVARI Design Audit — Billion Dollar Pass

> Auditor pass on `/home/adonna/Projects/ivari-events/client/src` against the TASTE skill +
> the user's house DESIGN.md rules. Severity: **critical** (ships AI tells / breaks brand) /
> **important** (polish gap, breaks rhythm) / **polish** (nice-to-have).

The codebase already has good bones — Liquid Glass material, OKLCH tokens, ambient orbs,
600ms cubic-bezier transitions. The problem is everything is just slightly off, and the
slight-off accumulates into something that reads as "very competent AI-built app" rather
than "Jony Ive ran the brand."

The biggest single failure: **Inter is the only font**, and Inter is on the banned list
(both DESIGN.md and TASTE). One font swap unlocks the whole brand.

---

## Critical (blocking — these ship AI tells)

### Typography

- **CRITICAL — `client/index.css:7` and `client/index.html:59` load and reference Inter.**
  Inter is on the banned-fonts list in both DESIGN.md (line 22) and the TASTE skill ("Inter
  is BANNED. It is the most overused AI font."). Replace with Cabinet Grotesk (display) +
  Geist (body), or Satoshi for a single-family solution. Loaded via fontshare.com to avoid
  the Google Fonts fingerprint.

- **CRITICAL — no consistent type scale.** Font sizes across the app are ad-hoc Tailwind
  utilities: `text-xs`, `text-sm`, `text-base`, `text-lg`, `text-xl`, `text-2xl`,
  `text-[0.6875rem]`, `text-[0.9375rem]`, `text-[0.6875rem]`, `text-3xl`, `text-4xl`,
  `text-5xl`, `text-6xl`, `text-7xl`, `text-8xl`. Lock to a modular scale: 12 / 14 / 16 /
  20 / 24 / 32 / 48 / 64 / 96 / 128 (rem-based). Expose as CSS custom properties so the
  whole app reads from one source.

- **IMPORTANT — heading line-heights too loose.** `Home.tsx:174` uses
  `tracking-[-0.03em] leading-tight` (which is ~1.25). DESIGN.md mandates 1.0–1.1 on H1.
  Display type at 1.05; body at 1.5–1.6.

### Color

- **CRITICAL — AI purple/violet gradients everywhere.**
  - `Home.tsx:93` IVARI wordmark gradient is `from-[oklch(0.78_0.12_255)] via-[oklch(0.68_0.18_290)] to-[oklch(0.6_0.16_320)]` — that's blue → purple → magenta, the textbook AI accent.
  - `LiquidButton.tsx:25` primary variant is `from-[oklch(0.5_0.22_260)] via-[oklch(0.55_0.2_280)] to-[oklch(0.52_0.2_310)]` — same purple gradient. The TASTE rule is explicit: "THE AI PURPLE BAN: No purple glows, no neon violet gradients."
  - `Portal.tsx` repeatedly uses `oklch(0.72_0.16_255)` (violet-blue) for the eyebrow and accent icons. Should be the warm amber `--primary` already defined in tokens (`oklch(0.78 0.14 65)`), which is the actual brand color.

- **IMPORTANT — `index.css:60`** sets `--foreground: oklch(0.93 0.015 75)` (warm off-white)
  but **most components hard-code grays at `oklch(0.5_0.02_265)` for secondary text**, which
  is a cool blue-gray. That fights the warm-amber brand direction. Lock to `--text-secondary`
  derived from the warm hue (75°), not the cool hue (265°).

- **IMPORTANT — too many one-off color literals.** `Pulse.tsx`, `Home.tsx`, `Portal.tsx`
  contain dozens of `oklch(...)` tuples inline. DESIGN.md rule: "Never hardcode colors.
  Always use CSS variables." Move every recurring tuple to a token.

### Layout

- **CRITICAL — Portal hero is centered with text over a dark image** (`Portal.tsx:226`).
  This is the exact layout TASTE bans as "the most generic AI layout." The Portal is the
  guest-facing surface — it has to be the cinematic showcase. Hero must be left-aligned
  with the AI art bleeding to the edge, not a centered text block.

- **CRITICAL — Forge "Choose a Theme" step uses an emoji as the entire visual identity**
  for each template (`Forge.tsx:293, 322`). DESIGN.md banned pattern: "No emoji as
  decoration." Replace with restrained line-icon glyphs from Lucide (e.g., `Cake` for
  birthday, `Wine` for dinner, `Building2` for corporate, `Heart` for wedding).

- **IMPORTANT — vertical rhythm is too tight everywhere.** `Home.tsx:166` uses
  `pt-12 sm:pt-16 pb-8` (48–64px top, 32px bottom) — for a hero, this is half what it
  should be. Apple Invites runs hero-to-content gaps of 96–160px. Sections need a single,
  honored spacing scale: 8 / 16 / 24 / 32 / 48 / 64 / 96 / 128.

### Motion

- **IMPORTANT — `LiquidButton.tsx:73` uses `whileHover={{ scale: 1.015 }}`.** Per the brief,
  hover should be `translateY(-2px) + glow strengthen`, not scale. Scale on a button at
  rest reads as Material Design, not Apple. Lift + glow.

- **IMPORTANT — 600ms is the spec but many components use 300/400/500/700/800/1500ms** for
  the same kind of interaction. Audit and align: micro (200ms hover/focus), standard
  (600ms reveal/transition), cinematic (900–1100ms hero entrance).

---

## Important (polish gap)

### Per-Surface

**Home (unauth landing) — `Home.tsx:75–137`**
- IVARI wordmark gradient is purple-violet (see above). Switch to the warm amber-to-rose
  brand gradient.
- "POWERED BY NANO BANANA" is good (small-caps eyebrow), but missing the same treatment on
  the auth Home eyebrow.
- Subhead `text-xl sm:text-2xl font-light` is fine but `text-[oklch(0.7_0.02_265)]` is the
  cool gray — should be warm.
- The whole landing is centered. For a marketing surface this is OK (variance 3), but the
  sub-elements (the wordmark, the divider, the CTA) should breathe more. Currently they
  stack at 48px gaps — should be 96px between wordmark and copy, 64px between copy and CTA.

**Home (auth Ledger) — `Home.tsx:161–276`**
- Event cards use a 28–36px horizontal image + content layout — good direction, but the
  image is too small to feel cinematic. Should be at least 40% of card width with a
  proper hero ratio.
- Status badges are good but live next to the title — they should be top-right of the
  image, with a glass chip treatment.
- The Sparkles icon in the no-events empty state — borderline emoji-replacement
  decoration. Acceptable but make it monochrome/single-stroke, not a colored fill.

**Forge — `Forge.tsx`**
- Step 0 emoji-driven template grid (see critical above).
- Step 1 "Describe the Vibe" is genuinely good — full-screen focus textarea — but the
  glow effect on the button is missing. Spec calls for glowing border on the "Generate
  Vibe" pill.
- Stepper at top is functional but visually noisy. Reduce to 6 dots + label-on-active
  (the current step's label visible, others blank).
- The COLOR_PRESETS array (`Forge.tsx:42–51`) is good — these accent colors are warm and
  on-brand. Keep.

**Pulse — `Pulse.tsx`**
- Workmanlike density is appropriate for the surface. But the current implementation has
  ~12 inline colored utility classes per status button (different hues for active/draft/
  cancelled). Hoist these into reusable badge components.
- Tab navigation lives in the page body — should be sticky on scroll for a true dashboard.
- Analytics charts (Recharts integration) need a dark-theme color palette, not the
  default Recharts colors.

**Portal — `Portal.tsx` (gold-standard candidate)**
- See critical above. The whole hero needs a rewrite: left-aligned, AI art as full-bleed
  backdrop with a single linear-gradient mask from event-accent to transparent, glass
  invitation block floating right, RSVP CTA as the climax.
- The "Event Details Bar" `-mt-5` overlap is a nice idea but the GlassCard doesn't have
  enough vertical hierarchy — three icon-label pairs in a flex row with no visual weight.
  Make it a 3-col grid with separator rules and stronger labels.
- RSVP status buttons currently use dynamic Tailwind class strings with template literals
  (`bg-[oklch(0.5_0.15_${hue}/15%)]`). **This will not work in Tailwind v4 with arbitrary
  values built at runtime** — it relies on JIT seeing the literal string at build time.
  Refactor to inline CSS custom properties (`style={{ '--hue': hue }}`) and static classes.
- "Powered by IVARI" footer is buried 6px text-xs — should be a more elegant sign-off
  with the wordmark in a refined serif.

**Memory Wall — `MemoryWall.tsx`**
- Photographic surface — should breathe. Audit the masonry gap (likely too tight).
- Lightbox needs cinematic transition — current is likely a default fade.

**Gallery — `Gallery.tsx`**
- 263 lines, didn't deep-read. TODO comment to rewrite with proper grid rhythm.

**CheckIn — `CheckIn.tsx`**
- Workmanlike surface. Bottom-priority for elevation.

**ComponentShowcase — `ComponentShowcase.tsx`**
- 1437 lines — this is itself a design audit surface. After tokens are locked, this page
  becomes the canonical reference. TODO at top.

### Component States

- **IMPORTANT — focus rings are inconsistent.** Some elements use `outline-none`, some
  `focus:ring-2`, some have nothing. Lock a single focus treatment: `focus-visible:outline
  outline-2 outline-offset-2 outline-[--accent]`. Never browser-default.

- **IMPORTANT — disabled states use only opacity.** The LiquidButton goes from full color
  to 40% opacity. Add `cursor-not-allowed` and reduce saturation, not just opacity.

- **POLISH — no skeleton loaders on cards.** The shimmer keyframe exists in CSS but isn't
  wrapped as a reusable component. The Home loading state is a spinner — should be card
  shimmers in the Ledger.

### Glass Material

- **POLISH — four glass variants (`subtle`, `default`, `strong`, `elevated`) is one too
  many.** TASTE recommends a single glass recipe. Keep `default` and `elevated` (for
  modal/hero panels) and remove `subtle` and `strong`. Single source of truth.

- **POLISH — specular highlight is good but only fires on mouse move.** On touch devices
  it never fires. Add a slow auto-drift fallback for `(pointer: coarse)`.

---

## Polish

- **Noise overlay opacity at 0.012 is invisible** — bump to 0.03–0.04 for actual texture.
- **`::selection` color uses warm amber** — good. Keep.
- **Scrollbar 4px is good for the brand** but might be too thin on touch.
- **`@layer base` body has `letter-spacing: -0.015em`** — applied globally, which is fine
  for headings but tightens body type. Move to display-only.
- **AmbientBackground** drift animations are 32–48s — this is great. Don't touch.
- **No `prefers-reduced-motion` on the orb keyframes.** They run regardless. Wrap in a
  media query that pauses them.

---

## Plan (deliverables for this pass)

1. **Tokens — `client/src/index.css`** rewritten with locked palette, type scale, spacing
   scale, motion vars, single glass recipe, fonts (Cabinet Grotesk display + Geist body).
   Removes `--font-sans: "Inter"`.
2. **`client/index.html`** — replace Google Fonts/Inter `<link>` with Fontshare CDN load
   for Cabinet Grotesk + Satoshi (Geist isn't on Fontshare; Satoshi is the cleanest match).
3. **`client/src/components/GlassCard.tsx`** — collapse to a single recipe + variants
   driven by tokens, remove ad-hoc color hex.
4. **`client/src/components/LiquidButton.tsx`** — kill the purple gradient, switch to the
   warm-amber primary. Hover = lift + glow, not scale.
5. **`client/src/pages/Portal.tsx`** — full rewrite as gold standard. Left-aligned hero,
   full-bleed AI art with proper gradient mask, RSVP as the climax, refactored away from
   runtime template-literal Tailwind classes.
6. **TODO headers** at the top of `Forge.tsx`, `Pulse.tsx`, `Home.tsx`, `MemoryWall.tsx`,
   `Gallery.tsx`, `CheckIn.tsx`, `ComponentShowcase.tsx` listing the per-surface fixes
   from this audit.

What's deferred to a later pass:
- The Forge step rewrites (icon set replacement for emoji, Vibe button glow).
- Pulse analytics charts dark theme.
- Memory Wall masonry rhythm fix.
- Mobile bottom nav for Pulse tabs.
- PWA standalone safe-area padding.

The token rewrite is the keystone — once tokens are right, sweeping the rest is mechanical.
