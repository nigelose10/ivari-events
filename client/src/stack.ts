/**
 * Stack Auth client app instance.
 *
 * Single shared instance imported anywhere we need Stack Auth (StackProvider,
 * StackHandler, hooks). Reads config from Vite-exposed env variables — Vite
 * only inlines vars prefixed with VITE_ into the browser bundle.
 *
 * tokenStore: "cookie" — persists the session in an httpOnly-style cookie
 * managed by Stack Auth so the user stays logged in across reloads / tabs.
 * Switch to "memory" if you want sessions to die when the tab closes.
 */
import { StackClientApp } from "@stackframe/react";

const projectId = import.meta.env.VITE_STACK_PROJECT_ID as string | undefined;
const publishableClientKey = import.meta.env
  .VITE_STACK_PUBLISHABLE_CLIENT_KEY as string | undefined;

if (!projectId) {
  // Fail loud in dev — silent misconfig is the worst kind.
  // eslint-disable-next-line no-console
  console.error(
    "[stack] VITE_STACK_PROJECT_ID is missing. Add it to .env.local."
  );
}
if (!publishableClientKey) {
  // eslint-disable-next-line no-console
  console.error(
    "[stack] VITE_STACK_PUBLISHABLE_CLIENT_KEY is missing. Fetch it from the Stack Auth dashboard and add it to .env.local."
  );
}

export const stackClientApp = new StackClientApp({
  tokenStore: "cookie",
  projectId: projectId ?? "",
  publishableClientKey: publishableClientKey ?? "",
  urls: {
    // Where Stack's pre-built UI mounts — must match the route in App.tsx.
    handler: "/handler",
    signIn: "/handler/sign-in",
    signUp: "/handler/sign-up",
    afterSignIn: "/",
    afterSignUp: "/",
    afterSignOut: "/",
  },
});

export default stackClientApp;
