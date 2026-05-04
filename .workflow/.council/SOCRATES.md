# SOCRATES — Council of High Intelligence

**Method**: Dialectic. I do not tell you what to do. I question what you already believe so you cannot hide behind your roadmap. If a bet survives the question, ship it with conviction. If it does not, you have saved a quarter.

---

## 1. "Luxury positioning is the right wedge."

- **The claim**: A glass/amber/cinematic aesthetic targeting high-end hosts is the lane that reaches paying customers fastest.
- **The question**: Name three luxury hosts (not aspirational personas — actual people with addresses) who told you they are unhappy with their current invitation tool. If you cannot name them in 30 seconds, who exactly is this product for, and how do you know they exist in numbers that can sustain a SaaS?
- **The fork**: If false, the actual wedge is mid-market hosts who want to *feel* luxury for one event (bachelorette, milestone birthday) — a much larger pool, but it requires a freemium funnel you have not built. If true, every hour spent on Voice Forge instead of on a concierge onboarding flow is wasted, because luxury buyers buy from humans, not signup forms.

## 2. "AI features are the differentiator."

- **The claim**: Voice Forge, Spotify auto-curation, AI follow-ups are the moat.
- **The question**: When a guest screenshots an Apple Invite to share with a friend, what are they sharing — the AI image, or the Apple Music playlist with their friends already on it? Which of your eight wedge features produces a screenshot a guest would post unprompted?
- **The fork**: If false, you have a tech-founder bias — building what excites you, not what spreads. The moat is social (playlist, group chat, photo wall) not generative. If true, then W1/W2/W6 are correctly weighted and the envelope reveal (M1) is decoration on top of the real work.

## 3. "Out-doing Apple Invites is even possible."

- **The claim**: IVARI can be "a billion times better."
- **The question**: Pick the single metric on which you will declare victory in 90 days — invitation completion rate, guest RSVP rate, post-event photo upload rate, NPS, paid conversion, Twitter screenshots per week. One number. If you cannot pick one, what does "better" mean operationally, and how would you ever know you got there?
- **The fork**: If false (no measurable definition), every feature decision is vibes-driven and the roadmap will sprawl until you run out of runway. If true (you pick a number), V7 should be ruthlessly pruned to whatever moves that number — possibly killing M1, possibly killing W4, possibly both.

## 4. "Group chats are a feature users want."

- **The claim**: Per-event chat with roles is high enough value to dispatch an agent on it now.
- **The question**: Of the last 20 events you personally were invited to, how many had a chat thread you actually read more than once? When the host did open a thread (WhatsApp, iMessage), did they want it inside the invitation app, or where their contacts already live?
- **The fork**: If false, you are building a feature that loses to WhatsApp every time a guest's contacts list gets opened, and the right play is a "share to WhatsApp/iMessage with one tap" flow. If true, the chat must do something WhatsApp cannot — pinned event details, RSVP-gated visibility, role-based muting — and your spec must call those out explicitly or you are shipping a worse WhatsApp.

## 5. "Photo gallery with admin moderation is the right interaction model."

- **The claim**: Guests upload, host approves before publish.
- **The question**: At a wedding, name the 90-minute window during which the host will sit and tap "approve, approve, reject" on a queue. Who actually does that work, and if no one does, what happens to the queue — does the wall stay empty for 6 hours and kill the live-event magic?
- **The fork**: If false (no one moderates in real time), the right model is auto-publish with a host-only "remove" affordance and a profanity/face-detection pre-filter. The Memory Wall becomes a wall, not a submission queue. If true, you need a co-host moderator role on day one (W5) before W7 Live Mode can ship at all.

## 6. "PWA + iOS Add-to-Home-Screen replaces a native iOS app."

- **The claim**: Web parity is good enough; App Store review is not worth the cost.
- **The question**: When a guest receives an SMS portal link at 7pm on a Friday, what percent of them install the PWA versus tap the link, RSVP, and never return? If installation rate is low, what exactly are you accepting in exchange for going PWA — no rich notifications, no contact picker, no Wallet pass for the event ticket, no MapKit, sandboxed local storage that Safari purges after 7 days of inactivity?
- **The fork**: If false (most guests never install), PWA is irrelevant to guests and matters only to the host. Then the question collapses: does the *host* need the PWA badly enough to justify everything you give up? If true, you need a hard install conversion metric and a Day-1 install flow, not a passive "add to home screen" footer.

## 7. "The migration was the right call."

- **The claim**: Drizzle/MySQL/tRPC/Express → Convex/Stack Auth was worth the time.
- **The question**: Name the user-visible feature that exists today *because* of the migration, that could not have existed on the old stack. If the answer is "realtime, but Socket.IO already gave us realtime," and "auth, but custom OAuth was working," then what exactly did the user receive in exchange for the weeks?
- **The fork**: If false, you traded shipping velocity for an architectural preference. The lesson is to freeze the stack now and not migrate again until V10. If true (Convex reactivity unlocks W7 Live Mode in a way Socket.IO could not), then the migration earns its keep only when W7 ships — meaning V9 is the validation point, not V7.

## 8. "Solo + agents = an enduring company."

- **The claim**: One founder dispatching parallel AI agents can build and operate a real SaaS.
- **The question**: It is 18 months from now. A guest in Lagos cannot RSVP because Stack Auth's JWT bridge is throwing a stale-key error at 3am Nigerian time. Who debugs it? When a Stripe Connect 1099-K compliance question arrives because you onboarded a wedding planner who took $20K in gift contributions, who answers — and in what timezone?
- **The fork**: If false, you are building a demo that cannot be operated, which is fine if the goal is an acquisition or a portfolio piece, but catastrophic if the goal is a company. If true, you have already designed the on-call rotation, the runbooks, and the agent-to-human escalation path — and they exist somewhere I can read, not just in your head.

---

## The Most Dangerous Assumption

**#3 — "Out-doing Apple Invites is even possible."**

Not because it is necessarily wrong. Because it is the *only* assumption on this list whose failure is invisible until it is terminal. The other seven, you will discover are wrong inside a month — guests will not install, hosts will not moderate, the migration will not pay off, the chat will sit empty. Each leaves a clear signal.

But "billion times better" has no signal. It is a vibe. You will ship V7, V8, V9, feel proud of the craft, screenshot the envelope reveal, and never know whether you actually moved a metric that matters. Three quarters from now the question will not be "did we beat Apple" — it will be "did we have a business," and you will not have an answer because you never wrote down the number that would have told you.

The other seven are bets. This one is the absence of a scoreboard. Pick the number this week, before the agents ship anything else.
