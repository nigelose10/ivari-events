/**
 * UserBootstrap — calls api.users.ensureUser once after sign-in.
 *
 * Convex's auth.config.ts verifies the Stack JWT, but it doesn't auto-create
 * a row in the `users` table. Every authenticated query/mutation calls
 * `requireUser()` which throws "User record missing — auth bootstrap not run"
 * if there's no row.
 *
 * This component sits inside the Convex provider tree and fires the
 * idempotent `ensureUser` mutation as soon as Stack reports an authenticated
 * user. After it succeeds, the rest of the app's queries can succeed.
 *
 * Renders nothing — pure side-effect component.
 */
import { useEffect, useRef } from "react";
import { useUser } from "@stackframe/react";
import { useMutation, useConvex } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { registerForPush, getPushPermissionState } from "../lib/push";

export default function UserBootstrap() {
  const stackUser = useUser();
  const convex = useConvex();
  const ensureUser = useMutation(api.users.ensureUser);
  const lastBootstrappedFor = useRef<string | null>(null);
  const pushAttemptedFor = useRef<string | null>(null);

  useEffect(() => {
    // useUser() returns undefined while hydrating, null when signed out,
    // CurrentUser when signed in.
    if (!stackUser) {
      lastBootstrappedFor.current = null;
      return;
    }

    // Only call once per user id (avoids re-firing on every re-render).
    if (lastBootstrappedFor.current === stackUser.id) return;

    lastBootstrappedFor.current = stackUser.id;

    // Stack's CurrentUser exposes `profileImageUrl` (camelCase). Pass it
    // through so the Convex `users` row stores a snapshot — keeps Memory
    // Wall posts and avatar bubbles independent of Stack's runtime state.
    const avatarUrl =
      (stackUser as { profileImageUrl?: string | null }).profileImageUrl ??
      undefined;

    ensureUser({ avatarUrl: avatarUrl ?? undefined }).catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[UserBootstrap] ensureUser failed", err);
      // Allow retry on next render — clear the marker.
      lastBootstrappedFor.current = null;
    });

    // Push registration — opportunistic. Skip if the user has already
    // denied (we don't re-prompt) and skip on devices without support.
    // The permission `default` case still re-prompts here because the
    // browser only shows the dialog on a user-driven interaction; the
    // `requestPermission` call inside `registerForPush` will quietly
    // resolve to "default" until that happens. Re-running on every sign-in
    // is cheap and gives us a chance to catch the user when they grant later.
    if (pushAttemptedFor.current !== stackUser.id) {
      pushAttemptedFor.current = stackUser.id;
      const state = getPushPermissionState();
      if (state === "granted") {
        registerForPush(convex).catch((err) => {
          // eslint-disable-next-line no-console
          console.warn("[UserBootstrap] push subscribe failed", err);
        });
      }
    }
  }, [stackUser, ensureUser, convex]);

  return null;
}
