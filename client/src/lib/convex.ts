/**
 * Convex client + Stack-Auth-bridging useAuth hook for ConvexProviderWithAuth.
 *
 * Stack Auth doesn't ship a Convex provider, so we implement the
 * `useAuth` contract Convex expects:
 *
 *   {
 *     isLoading: boolean,
 *     isAuthenticated: boolean,
 *     fetchAccessToken: ({ forceRefreshToken }) => Promise<string | null>,
 *   }
 *
 * On the Convex side, the JWT issued by Stack Auth is verified using the
 * provider entry in convex/auth.config.ts.
 */
import { useUser } from "@stackframe/react";
import { ConvexReactClient } from "convex/react";
import { useCallback, useMemo } from "react";

const rawConvexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;
const convexUrl =
  typeof rawConvexUrl === "string" && rawConvexUrl.trim().length > 0
    ? rawConvexUrl.trim()
    : undefined;

if (!convexUrl) {
  // eslint-disable-next-line no-console
  console.warn(
    "[convex] VITE_CONVEX_URL is missing. Run `npx convex dev` and copy the URL into .env.local — or set it in Vercel for production."
  );
}

/**
 * Convex requires a URL at construction time. If the env var is missing we
 * deliberately use a clearly-named placeholder so:
 *  - the app still boots (no white screen),
 *  - the EnvGuard banner explains what's wrong,
 *  - the ErrorBoundary's `diagnoseError` translates downstream failures into
 *    a friendly "Convex backend URL is missing" message.
 *
 * We try/catch construction defensively in case a future convex-js version
 * throws on an invalid URL — we'd rather render the env-guard banner than
 * crash the whole tree.
 */
function makeConvexClient(): ConvexReactClient {
  const url = convexUrl ?? "https://convex-not-configured.invalid";
  try {
    return new ConvexReactClient(url);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      "[convex] ConvexReactClient construction failed; using inert client.",
      err
    );
    // Build with the placeholder one more time (different code path may not
    // exist for the currently-installed convex version, so swallow + return).
    return new ConvexReactClient("https://convex-not-configured.invalid");
  }
}

export const convex = makeConvexClient();

/**
 * useAuth implementation passed to <ConvexProviderWithAuth />.
 *
 * Stack's CurrentUser exposes `getAuthJson()` which returns
 * `{ accessToken, refreshToken }`. We forward the access token to Convex.
 *
 * `forceRefreshToken` is set by Convex when it needs a fresh JWT (e.g. the
 * previous one expired). Stack's tokenStore handles refresh internally; we
 * just call getAuthJson() again to get the latest cached value. If your
 * Convex function calls hit 401s after token expiry, this is the place to
 * add an explicit "force refresh" path once Stack exposes one.
 */
export function useAuthForConvex() {
  const currentUser = useUser();

  // undefined = hydrating, null = not signed in, object = signed in
  const isLoading = currentUser === undefined;
  const isAuthenticated = Boolean(currentUser);

  const fetchAccessToken = useCallback(
    async (_args: { forceRefreshToken: boolean }) => {
      if (!currentUser) return null;
      try {
        // Stack Auth: getAuthJson returns { accessToken, refreshToken }
        const auth = await (
          currentUser as unknown as {
            getAuthJson: () => Promise<{
              accessToken: string | null;
              refreshToken: string | null;
            }>;
          }
        ).getAuthJson();
        return auth?.accessToken ?? null;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[convex/useAuthForConvex] getAuthJson failed", err);
        return null;
      }
    },
    [currentUser]
  );

  return useMemo(
    () => ({
      isLoading,
      isAuthenticated,
      fetchAccessToken,
    }),
    [isLoading, isAuthenticated, fetchAccessToken]
  );
}
