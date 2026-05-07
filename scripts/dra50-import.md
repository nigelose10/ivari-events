# DRA@50 — host setup checklist

The Wave 6 build added a "Find your name" public claim flow. This is the
first event using it. Steps below are one-time host setup.

## 1. Create the event in Forge

- Title: `DRA@50` (or whatever the canonical spelling is)
- Description: short event copy
- Cover image: upload your DRA@50 hero
- **Make this event public** → ON
- Public claim flow → **Find your name** (the second tile)
- Save → land on `/pulse/<slug>`

If you already created the event before this build, open it in Pulse:
the "Public discovery" card now has a sub-row to flip between
*Open RSVP* and *Find your name*.

## 2. Import the guest list

The full list (492 people) sits at:

```
scripts/dra50-guests.csv
```

Open the event in Pulse → **Guests** tab → **Import CSV**. Open the file
in your editor, copy the contents, paste into the Import dialog, hit
Import. The importer reads the `name,email,phone,table,seat,diet,notes,host note`
header — every person gets the table number from the Google Sheet column.

(If you'd rather refresh from the live Google Sheet later, re-export it
to CSV from Sheets → File → Download → CSV and paste again. The importer
de-duplicates on name + table.)

## 3. Share the public portal link

`https://ivari-events.vercel.app/portal/<slug>`

Send this to attendees. When they tap it:

1. Cinematic envelope reveal plays once (per device).
2. **Find your seat** card asks them to type their name.
3. They tap their row → see "You're at Table X" → unlock memory wall, friends, etc.
4. Anonymous-friendly: no account required. Claim is stored against their
   `localStorage` device key. Same browser → same seat on subsequent visits.
5. If they sign up later, the claim folds into their account.

## 4. Photos

Memory Wall already works for anyone with the public link. Signed-in users
post under their username + avatar. Token-only guests post under whatever
display name they type. *Note*: posting from an anon-claimed device (no
account, no per-guest token) is a follow-up — for the first run, encourage
guests to sign in if they want to post photos.

## 5. Verifying the seating chart

Hosts can see who's claimed which seat in:

- Pulse → Guests tab — claimed rows show a BadgeCheck + the claimer's
  username (only when they signed in; anon claims show "claimed" without
  a username).
- Pulse → Seating tab — drag-drop layout (existing).

That's it. The flow is fully anon-tolerant; the only friction left is
sign-in for hosts and for users who want to host their own events.
