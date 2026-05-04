/**
 * Convex auth configuration — verifies JWTs issued by Stack Auth.
 *
 * Stack Auth signs JWTs with the project's keys. Convex pulls the JWKS from
 * Stack's well-known endpoint and verifies:
 *   - `iss` claim matches `issuer`
 *   - `aud` claim matches `applicationID` (the Stack project ID)
 *
 * To set the project ID for the Convex deployment, run:
 *   npx convex env set STACK_PROJECT_ID <project-id>
 *
 * (Project ID lives in the repo's .env.local as VITE_STACK_PROJECT_ID — same
 *  value, but the Convex deployment needs its own copy.)
 *
 * Stack Auth's issuer URL pattern is documented at:
 *   https://docs.stack-auth.com — the canonical issuer is the project's
 *   tenant URL on api.stack-auth.com. If verification fails after deploy,
 *   inspect a live JWT (jwt.io) and copy the exact `iss` claim into the
 *   `issuer` field below.
 */
import type { AuthConfig } from "convex/server";

const STACK_PROJECT_ID = process.env.STACK_PROJECT_ID ?? "";

const config = {
  providers: [
    {
      // Stack Auth's JWTs are standard RS256 JWTs — Convex's customJwt path
      // verifies them via the JWKS URL.
      type: "customJwt" as const,
      applicationID: STACK_PROJECT_ID,
      // The issuer Stack puts in the `iss` claim of issued JWTs.
      issuer: "https://api.stack-auth.com",
      jwks: "https://api.stack-auth.com/api/v1/projects/" +
        STACK_PROJECT_ID +
        "/.well-known/jwks.json",
      algorithm: "RS256" as const,
    },
  ],
} satisfies AuthConfig;

export default config;
