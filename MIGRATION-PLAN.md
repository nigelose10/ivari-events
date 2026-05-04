# IVARI Migration Plan

**Branch**: `feat/convex-stack-auth-pwa-vercel`
**Generated**: by `Plan` agent during /ccw orchestration
**Status**: schema landed; functions, auth, PWA, design in flight

## Source → Target Stack

| Layer | Before | After |
|---|---|---|
| Backend | Express + tRPC + Drizzle + MySQL | Convex (serverless, reactive) |
| Auth | Custom OAuth (`server/_core/oauth.ts`) | Stack Auth + Convex JWT bridge |
| Realtime | Socket.IO (`server/socket.ts`) | Convex reactive queries (auto) |
| File storage | S3 (`server/storage.ts`) | Convex Storage (`ctx.storage.*`) |
| Deploy | Manual node server | Vercel (frontend) + Convex Cloud (backend) |
| Mobile | Mobile-web | PWA, iOS-installable, standalone mode |

## Critical Sequencing

1. `npx convex dev` — bootstrap Convex deployment (USER ACTION — opens browser)
2. `convex/schema.ts` ✅ done
3. `convex/auth.config.ts` — Stack Auth bridge (in flight)
4. `convex/users.ts:ensureCurrentUser` — must precede all auth-protected functions
5. `convex/guestPortal.ts` — JWT signing (precedes events/rsvps/photos that depend on guest tokens)
6. Domain modules: templates → events → guests → rsvps → notifications → photos → analytics → checkin → qrcode
7. Client provider swap (`main.tsx`)
8. Page-by-page migration (Home → Forge → Pulse → Portal → MemoryWall → Gallery → CheckIn → ComponentShowcase)
9. Drop Socket.IO last (only after Pulse/MemoryWall verified live)
10. Add `vite-plugin-pwa` AFTER app is fully functional on Convex (SW caching mid-migration is debugging hell)
11. Vercel config + `package.json` script cleanup
12. Delete legacy `server/` + `drizzle/` last (keep as fallback during cutover)

## Files to Delete

```
server/_core/index.ts, trpc.ts, context.ts, cookies.ts, oauth.ts,
                sdk.ts, dataApi.ts, vite.ts, systemRouter.ts, env.ts
server/routers.ts, db.ts, socket.ts, storage.ts
server/auth.logout.test.ts
drizzle.config.ts, drizzle/ (all migrations + schema)
client/src/hooks/useSocket.ts
client/src/lib/trpc.ts
```

## Deps Cleanup

**Remove**: `@trpc/*`, `drizzle-orm`, `drizzle-kit`, `mysql2`, `socket.io`, `socket.io-client`, `express`, `@types/express`, `cookie`, `superjson`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `tsx`, `esbuild`, `dotenv`, `vite-plugin-manus-runtime`

**Add**: `convex`, `@stackframe/react`, `vite-plugin-pwa`, `workbox-window`, `@vite-pwa/assets-generator` (dev)

**Keep**: `jose` (guest JWTs), `nanoid`, `qrcode`, `zod`, all UI deps

## Known Risks

- **`"0"/"1"` enum mismatch**: schema agent kept the string enums for parity; consumers reading `=== "1"` keep working. If you later flip to `v.boolean()`, grep + replace all comparisons.
- **Reactive overdraw**: `events.list` enriching N events with N+1 reads will re-fire on ANY rsvp change. Split into `events.list` (thin) + per-row `events.summary({eventId})` query.
- **Convex action 10-min cap**: image-gen + invitation-preview are at risk on slow upstream. Stream where possible.
- **Stack Auth JWT template**: must configure `aud` claim in Stack dashboard to match Convex `applicationID`. Silent failure with `null` identity if missed.
- **iOS PWA**: no `beforeinstallprompt` — must build custom "Share → Add to Home Screen" affordance.
- **Wouter patch** (`patches/wouter@3.7.1.patch`): may be Express-coupled. Verify still needed post-Vercel.

## Vercel Env Vars (set in Vercel dashboard)

```
VITE_CONVEX_URL              # from `npx convex dev` first run
VITE_STACK_PROJECT_ID        # already in .env.local
VITE_STACK_PUBLISHABLE_CLIENT_KEY  # USER must fetch from Stack dashboard
```

## Convex Env Vars (set via Convex dashboard, NOT Vercel)

```
STACK_SECRET_SERVER_KEY      # already in .env.local
STACK_JWKS_URL               # from Stack Auth Convex integration
JWT_SECRET                   # for guest portal tokens
IMAGE_GEN_API_KEY            # Nano Banana
LLM_API_KEY                  # Social Oracle / guest suggestions
OWNER_NOTIFY_URL             # SMS/email blast endpoint
```
