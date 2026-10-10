/**
 * Which documents are public, which ask for a sign-in, and which are missing.
 * Legacy aliases are applied before this gate. Unknown paths are not sent to login.
 */

const PUBLIC_DOCUMENT_ROUTES = [
  "/",
  "/about",
  "/contact",
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
  "/ai-disclaimer",
  "/trust",
  "/free-trial",
  "/chat",
  "/own-the-bots",
  "/docs",
  "/blog",
  "/changelog",
  "/status",
  "/offline",
  "/stox",
  "/koins",
  "/smitty",
  "/buy-the-bots",
  "/stripe/demo",
  "/stripe/success",
  "/stripe/cancel",
];

/** Real member pages. Signed-out visitors go to login. Everything else is a 404. */
const MEMBER_DOCUMENT_ROUTES = [
  "/settings",
  "/account",
  "/profile",
  "/onboarding",
  "/headmaster",
  "/totalum",
  "/billing",
];

function normalise(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname;
}

function matchesRoute(pathname: string, routes: string[]): boolean {
  return routes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export function documentAccess(pathname: string): "public" | "member" | "missing" {
  const path = normalise(pathname);
  if (matchesRoute(path, PUBLIC_DOCUMENT_ROUTES)) return "public";
  if (matchesRoute(path, MEMBER_DOCUMENT_ROUTES)) return "member";
  return "missing";
}
