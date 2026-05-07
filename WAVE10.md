# Wave 10 — chat fix + admins (co-hosts) + auto-match + anon uploads

## Fixes

### Chats no longer error

`api.chats.listForEvent` previously called `requireOwnedEvent` and threw
`Forbidden` for anyone except the host. That's why opening Chats from the
bottom-nav blew up with a Convex error.

It now uses the new `getEventRole` helper:
- **host** → sees every chat
- **co-host (admin)** → sees every chat
- **claimed guest** (signed-in user with a `guests` row on the event) →
  sees `general` + any chat they're a member of
- **no role** → returns `[]` (UI shows the empty state, no error)

Plus the DRA@50 seed now creates a default `General` chat with the host
seeded as `owner`. Re-run `npx convex run seed:dra50` to backfill it on
existing dev data.

## How to add an admin (co-host)

1. The person you want to add must sign in to ivari at least once. That
   bootstraps their `users` row.
2. As the host, open your event in **Pulse → Overview tab**.
3. Scroll to the **Admins** card (just above Delete event).
4. Type their email → tap **Add**.
5. They now have full Pulse access for that event.

Co-hosts can:
- Edit event settings, theme, dates
- Manage the guest list (add, remove, set tiers)
- Moderate Memory Wall photos
- Send notifications / SMS broadcasts
- See and post in all chats

Co-hosts cannot:
- Remove the host
- Add other co-hosts (only the host can)
- Transfer ownership

Server enforcement is in `convex/lib/permissions.ts::requireHostOrCohost`
which now checks `event.coHostIds`. Every existing host-gated mutation
picks this up automatically — no per-mutation changes needed.

## Auto-match: account → guest list

When you sign in, Home now fuzzy-matches your display name against
unclaimed guest rows on every public name-list event. If a strong match
exists (your name appears as a substring of the guest name), a small
amber banner appears at the top of Events offering one-tap claim:

> **Looks like you're on the list**
> Claim Mr. Hansel-Oseahume Akhuetie on DRA@50 · Table Host

Tap it → row gets claimed, RSVP recorded, event appears in "I'm Attending."

Server: `events.guessClaimsForMe` (query, signed-in only). Returns at
most 5 high-confidence matches across all public name-list events the
user doesn't already host or have a claim on.

## Anon guest photo upload (with admin approval)

Anon visitors who claimed a seat with a `deviceKey` (no account, just
"Find your seat" → tap their name) can now post to the Memory Wall too.

Server:
- `photos.requestAnonUploadUrl(eventId, guestId, deviceKey)` — verifies
  the device key matches the guest row, then mints an upload URL
- `photos.submitAnonClaimedPhoto(eventId, guestId, deviceKey, storageId, caption)`
  — same verification, then inserts photo with `status: "pending"`

Photos land in the host's moderation queue (Pulse → Memory Wall →
Moderate). Once approved, they appear in the public gallery for everyone.

This means the four upload paths are now:

| Caller | Path | Lands as |
|---|---|---|
| Host | `submitHostPhoto` | approved |
| Signed-in user | `submitUserPhoto` | pending |
| Anon device-claimed guest | `submitAnonClaimedPhoto` | pending |
| Token-only invitation guest | `submitGuestPhoto` (action) | pending |

## Gallery → Memory Wall routing

Gallery cards now route to `/memory/<slug>` (the public memory wall) when
`memoryWallEnabled === "1"`, instead of dropping the host into Pulse. The
Memory Wall page itself gates the upload button on event status:
- `status: "active"` or `"draft"` → upload allowed
- `status: "past"` or `"cancelled"` → view-only (the camera button hides
  for guests; hosts retain it for late additions)

## Schema changes

- `events.coHostIds: optional(array(id("users")))` — admins
- `guests.tier` (Wave 9, just resurfacing in WAVE10 docs) — VIP/Family/etc.
- `guests.claimedByDeviceKey` (Wave 6) — anon claim stable per browser

No backfill needed; all fields are optional and existing rows continue to
read fine.
