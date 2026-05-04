/**
 * Project-root re-export of the Stack Auth client. The actual definition lives
 * at client/src/stack.ts (Vite roots `client/`). This file exists so any
 * tooling or doc that references `src/stack.ts` from the repo root resolves.
 *
 * Prefer `import { stackClientApp } from "@/stack"` from inside client code —
 * the `@` alias points at `client/src`.
 */
export { stackClientApp, default } from "../client/src/stack";
