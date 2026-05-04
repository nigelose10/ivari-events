# MUSASHI — Council Verdict

**Date**: 2026-05-04
**Council Member**: Miyamoto Musashi — Strategic Timing

---

### Essential Question

Is this the moment to act broadly, or to make a single decisive cut?

---

### Timing Analysis

- **Current Rhythm**: Expansion phase with infrastructure debt. Eight agents in flight, the product deployed but broken at the seams — OAuth dead, Convex not deployed, favicon broken. This is not a feature problem. This is a foundations problem wearing a features costume.
- **Decisive Point**: The moment a real guest opens the invitation portal and the experience works, end to end, without a single broken step. That moment does not exist yet. Every feature being built by every agent right now is being built on a foundation that cannot serve a single guest.
- **Risk of Delay**: The agents land their work. You integrate 8 half-finished features into a broken shell. You have a codebase with an envelope reveal and group chats and no working auth. Feature velocity without a working product is inventory, not progress.
- **Risk of Premature Action**: None. The foundation is not "close." It is simply not done. There is nothing premature about fixing it today.

---

### Domain Analysis

The V7 roadmap is correct in its priorities. The sequencing problem is that the roadmap assumes the foundation is stable. It is not.

Read the MIGRATION-PLAN.md with fresh eyes. Step 1 is `npx convex dev` — a USER ACTION that opens a browser. That has not been done. Stack Auth JWT bridge is "in flight." The Convex auth config is "in flight." Without those two, the M1 envelope reveal serves no one. The RSVP climax fires after a form that cannot submit. The weather strip renders for a portal that fails OAuth on load.

The competitive framing — out-do Apple Invites, out-do Paperless Post — is the right north star. But Apple Invites does not ask its users to test broken authentication before experiencing the reveal. That is the actual gap right now. Not weather. Not wax seals. The app works, or it does not.

The DESIGN-AUDIT.md flags the Portal specifically — purple gradients, centered hero — as exactly the surface M1 lives on. The roadmap itself says: "Block V7 motion work behind the design-audit Portal rewrite or M1 will land on a Portal that still has purple gradients." That instruction is being ignored. Eight agents are building M1, RSVP climax, group chats, and photo moderation on top of a Portal that the roadmap already diagnosed as not ready to receive them.

The decisive moment is not a feature. It is the completion of the migration scaffolding — specifically: Convex deployed, Stack Auth JWT bridge wired and verified, Google OAuth passing, one event created end to end, one guest opening a portal that loads. That is the cut. Everything else is polish on a blade that isn't forged yet.

Once the foundation closes, M1 — the wax-seal envelope reveal — is the single correct V7 ship. Not group chats. Not photo gallery moderation. Not Apple HIG overhaul. The roadmap is explicit and correct: "if V7 ships only M1 + W3 + W4, that's still a better launch than the current state." M1 is the one screenshot-worthy moment. W3 (calendar + maps links) and W4 (weather) are small-effort table stakes that make the product feel complete. That is the entire V7 scope. Three things, not twelve.

---

### The Decisive Moment

**Ship one working guest experience, anchored by M1.**

Specifically: by end of this week, a real human — not the founder, someone else — receives a portal link, opens it, sees the wax-seal reveal, RSVPs, and gets a confirmation. That sequence, unbroken, once, with a real guest. That is the moment.

The feature that makes it happen is not M1. M1 is the climax. The feature that makes it happen is closing the Convex deployment + Stack Auth bridge. That is the unsexy prerequisite that unlocks everything.

---

### Why This and Not the Others

**Defer immediately and without guilt:**

- Group chats with roles — this is a V9-tier feature being pulled into a week where the product cannot authenticate a user. Cut it.
- Photo gallery moderation — the Memory Wall exists and works. Moderation is a trust-and-safety problem for when you have users uploading at volume. You do not have that problem yet.
- Apple HIG overhaul — valid, important, wrong timing. Do the Portal design-audit rewrite that the roadmap already specified, not a full HIG pass. Scope it to Portal only, as the foundation for M1.
- Nano-Banana removal — if this is a dependency swap on image generation, fine, but it should not be an agent by itself. It is a one-file change.
- The debug agent — absorb its output, close the tickets, do not spawn new work from it.

**The V7 roadmap's own sequencing rule is the cut**: M1 + W3 + W4. That is the entire scope of this week. Co-hosts, smart follow-ups, voice forge — all V8. Not because they are bad. Because timing is everything and this is not their time.

---

### The Strike Posture

Concretely:

**7am**: Deploy Convex. Run `npx convex dev`. Set the three Convex env vars. Set the three Vercel env vars. Fix Google OAuth in Stack Auth dashboard — this is a config screen, not code. This should be done before coffee is cold.

**Before noon**: Verify one event creates end to end. Verify one guest portal loads. Verify RSVP submits. If it does not, that is the only work that matters until it does.

**Afternoon**: Read what the agents have landed. Do not integrate everything. Read it. Decide what touches the critical path (Portal design-audit, M1 envelope component, W3 calendar links) and what is inventory to be merged later. Inventory is fine. Do not feel compelled to ship every agent output this week.

**Refuse**: Any conversation about new features, new wedge ideas, group chat architecture, or competitive analysis until the portal loads for a real guest. Refuse it from yourself, not just from others.

**11pm is for**: reviewing M1 implementation detail — the GSAP seal-shatter sequence, the audio preload, the localStorage first-seen flag. This is the craftwork that deserves late focus. Not architecture decisions, not scope changes.

---

### The Misdirection to Avoid

The false target is the agents' output itself.

Eight agents have been building in parallel. They will land code. The code will look impressive — envelope reveals with GSAP physics, photo moderation pipelines, group chat with role-based permissions. The temptation is to treat integration as progress. To spend the week merging all eight streams into main, seeing the feature list grow, feeling like things are shipping.

That is not shipping. That is accumulation.

The product is deployed and broken for the user today. None of the eight agents have been working on that. The wax-seal reveal is beautiful. It is also unreachable by any guest on earth because Google OAuth fails on load.

The misdirection is: "we have so much work done, we just need to wire it together." The reality is: wiring eight half-finished features together is not integration, it is debt consolidation. The moment of maximum leverage is to close the foundation first, then select ONE agent's output (M1) to carry to completion, and explicitly mark the other seven as inventory to be finished in V8.

The sword that strikes cleanly is the one held back until the right moment. Not the one swung at everything that moves.

---

### Verdict

**Act now on the foundation. Strike with M1. Defer the other seven.**

Close Convex + Stack Auth today. Finish Portal design-audit rewrite in parallel. Land M1 — complete, polished, wax seal through RSVP climax — by end of week. Add W3 and W4. Declare V7 done. Then breathe.

The question for the next 30 days is not whether IVARI has 12 features. The question is whether one person can open an invitation and feel something they have never felt from an invite before. Right now the answer is no. By Friday it should be yes, once, cleanly, for a real guest.

That is the only number that matters.

---

### Confidence

**High** — The foundation blockers (Convex not deployed, OAuth broken) are confirmed in the problem statement itself. The roadmap's own sequencing rule validates the M1-first cut. The risk of feature accumulation over foundation closure is not hypothetical; it is the current state.

---

### Where I Might Be Wrong

Waiting for a perfect foundation can become its own form of hesitation. If the Convex deployment is 30 minutes of work and the OAuth fix is a 5-minute config change, then the foundation is not the bottleneck — decision-making is. In that case, the founder should close both before reading this document, and M1 is already the right next strike. The warning about accumulation still stands regardless.

The other risk: I am reading timing, not strategy. It is possible the right V7 move is to ship a broken-but-wow demo to one specific beta user or investor, and the "broken" auth is not the obstacle it appears. If there is a specific first user in mind who can receive a demo link directly, the calculus shifts — fix auth just enough for that one demo, nail M1, and iterate. But that requires knowing who that first user is. If the answer is "no one specific yet," then the foundation must close first.
