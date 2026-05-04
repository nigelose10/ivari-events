/**
 * useAuth — Stack Auth-backed replacement for the previous tRPC-based hook.
 *
 * Public API kept identical so existing call sites (Home.tsx, etc.) compile
 * unchanged:
 *   const { user, loading, isAuthenticated, logout, refresh, error } = useAuth();
 *   useAuth({ redirectOnUnauthenticated: true });
 *
 * Under the hood we now read from Stack Auth's `useUser()` and map the
 * `CurrentUser` shape onto the `{ id, name, email, ... }` object that the rest
 * of the app already expects.
 */
import { useUser, useStackApp } from "@stackframe/react";
import { useCallback, useEffect, useMemo, useState } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  /** Where to send unauthenticated users. Defaults to Stack's sign-in page. */
  redirectPath?: string;
};

/**
 * The shape consumers across the app already destructure. Keeping this stable
 * is the whole point of this wrapper — Stack's CurrentUser has different field
 * names (displayName, primaryEmail) than what the codebase uses (name, email).
 */
export type AppUser = {
  id: string;
  name: string | null;
  email: string | null;
  profileImageUrl: string | null;
  /** Original Stack CurrentUser, escape hatch for advanced callers. */
  raw: unknown;
};

const DEFAULT_REDIRECT = "/handler/sign-in";

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = DEFAULT_REDIRECT } =
    options ?? {};

  // useUser() returns:
  //   - undefined while Stack is hydrating (loading)
  //   - null when no signed-in user
  //   - CurrentUser when signed in
  const currentUser = useUser();
  const stackApp = useStackApp();

  // Stack's useUser doesn't expose an isLoading flag directly; we treat
  // `undefined` as loading and `null` as "definitively not signed in".
  const loading = currentUser === undefined;

  const user: AppUser | null = useMemo(() => {
    if (!currentUser) return null;
    return {
      id: currentUser.id,
      name: currentUser.displayName ?? null,
      email: currentUser.primaryEmail ?? null,
      profileImageUrl: currentUser.profileImageUrl ?? null,
      raw: currentUser,
    };
  }, [currentUser]);

  const [error, setError] = useState<unknown>(null);
  const [logoutPending, setLogoutPending] = useState(false);

  const logout = useCallback(async () => {
    setLogoutPending(true);
    setError(null);
    try {
      if (currentUser && typeof currentUser.signOut === "function") {
        await currentUser.signOut();
      }
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setLogoutPending(false);
    }
  }, [currentUser]);

  const refresh = useCallback(async () => {
    // Stack manages its own cache; calling getUser pulls a fresh value.
    try {
      await stackApp.getUser();
    } catch (err) {
      setError(err);
    }
  }, [stackApp]);

  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (loading || logoutPending) return;
    if (user) return;
    if (typeof window === "undefined") return;
    if (window.location.pathname === redirectPath) return;
    if (window.location.pathname.startsWith("/handler")) return;

    window.location.href = redirectPath;
  }, [redirectOnUnauthenticated, redirectPath, loading, logoutPending, user]);

  return {
    user,
    loading: loading || logoutPending,
    isAuthenticated: Boolean(user),
    error,
    refresh,
    logout,
  };
}
