export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

/**
 * Returns the URL to send unauthenticated users to. With Stack Auth this is
 * the pre-built sign-in page mounted at /handler/sign-in (see App.tsx).
 *
 * Kept as a function (not a constant) so existing call sites can continue to
 * call `getLoginUrl()` without changes.
 *
 * TODO(stack-auth): once all callers (Home, CheckIn, DashboardLayout) have
 * migrated to <Link href="/handler/sign-in"> or stackClientApp.urls.signIn,
 * delete this helper.
 */
export const getLoginUrl = () => "/handler/sign-in";
