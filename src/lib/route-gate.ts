/**
 * Which documents are public, which ask for a sign-in, and which are missing.
 * Legacy aliases are applied before this gate. Unknown paths are not sent to login.
 */

const PUBLIC_DOCUMENT_ROUTES = [
  "/",
  // b66 G-27: copy-link invite landing; it asks for sign-in itself so the #token survives (404 while the flag is off).
  "/share",
  "/about",
  "/contact",
  "/cookies",
  "/faq",
  "/features",
  "/how",
  "/performance",
  "/dashboard",
  "/markets",
  "/tax",
  "/market-news",
  "/projections",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/logout",
  "/pricing",
  "/how-it-works",
  "/how-to-maximize-results",
  "/privacy-policy",
  "/terms-of-service",
  "/refunds",
  "/ai-disclaimer",
  "/legal",
  "/trust",
  "/methodology",
  "/free-trial",
  "/chat",
  "/own-the-bots",
  "/docs",
  "/help",
  // b89 START-2: the plain-words guide for brand-new members.
  "/start-here",
  "/blog",
  "/changelog",
  "/status",
  "/offline",
  "/stox",
  "/koins",
  "/smitty",
  "/headmaster",
  "/buy-the-bots",
  // Goal b10 G-06 read-only example book; G-04/G-05 test-mode switches.
  "/demo",
  // Goal b20 G-23: the learn hub and the comparison pages.
  "/learn",
  "/compare",
  "/stripe/demo",
  "/stripe/success",
  "/stripe/cancel",
  // Confirm page only. GET does not change the weekly email setting.
  // pull-check:retest4-2026-10-11
  "/unsubscribe",
];

/** Real member pages. Signed-out visitors go to login. Everything else is a 404. */
const MEMBER_DOCUMENT_ROUTES = [
  "/settings",
  // b66 G-27: read-only books shared with this account (page 404s while PORTFOLIO_SHARING is off).
  "/shared",
  "/account",
  "/profile",
  "/onboarding",
  "/totalum",
  "/billing",
  "/import",
  // Same gate as import. The explainer stays on /help.
  // pull-check:batch2-fixes-2026-10-12
  "/my-returns",
];

function normalise(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname;
}

function matchesRoute(pathname: string, routes: string[]): boolean {
  return routes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

/**
 * Goal b20 SECURITY: /test-hooks is not public. A signed-in request reaches the
 * page, which answers 404 unless GOAL_TEST_HOOKS=1 and the account is allow-listed;
 * a signed-out request is a plain 404.
 */
export function documentAccess(pathname: string): "public" | "member" | "missing" | "test-hooks" {
  const path = normalise(pathname);
  // H-12: the old licence success page is not a document. /own-the-bots itself
  // stays on the public list, but a child path must not inherit that prefix.
  if (path === "/own-the-bots/success") return "missing";
  if (matchesRoute(path, ["/test-hooks"])) return "test-hooks";
  if (matchesRoute(path, PUBLIC_DOCUMENT_ROUTES)) return "public";
  if (matchesRoute(path, MEMBER_DOCUMENT_ROUTES)) return "member";
  return "missing";
}

/**
 * b87 G-27 (TT b86 P3): /shared is 404 for everyone while PORTFOLIO_SHARING is off, decided in
 * middleware before the signed-out redirect (which made a signed-out request end on a 200 page).
 */
export function sharingPageHidden(pathname: string, env: Record<string, string | undefined> = process.env): boolean {
  const onShared = pathname === "/shared" || pathname.startsWith("/shared/");
  return onShared && String(env.PORTFOLIO_SHARING || "").trim().toLowerCase() !== "on";
}
