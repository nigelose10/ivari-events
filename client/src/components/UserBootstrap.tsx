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
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";

export default function UserBootstrap() {
  const stackUser = useUser();
  const ensureUser = useMutation(api.users.ensureUser);
  const lastBootstrappedFor = useRef<string | null>(null);

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

    ensureUser({}).catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[UserBootstrap] ensureUser failed", err);
      // Allow retry on next render — clear the marker.
      lastBootstrappedFor.current = null;
    });
  }, [stackUser, ensureUser]);

  return null;
}
