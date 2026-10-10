import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { PRIVATE_NO_STORE_HEADERS } from "@/lib/account-guard";
import { portfolioAliasRedirect } from "@/lib/portfolio-route-aliases";
import {
  filterAnonymousAuthSetCookies,
  isCacheableMarketingPath,
  PUBLIC_MARKETING_CACHE_HEADERS,
  shouldClearAnonymousAuthCookies,
} from "@/lib/private-document";
import { publicAliasRedirect } from "@/lib/public-route-aliases";
import {
  anonymousAccountApi,
  AUTH_COOKIE_NAMES,
  expiredAuthCookie,
  isProtectedAccountApi,
  requestHasSessionToken,
} from "@/lib/session-owner";
const isProduction = process.env.NODE_ENV === "production";
const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
// Extract origin from app URL (e.g. "https://my-app.com" from "https://my-app.com/")
const appOrigin = appUrl ? new URL(appUrl).origin : "";

/**
 * Check if an origin is allowed for CORS
 * - Development: any origin
 * - Production: NEXT_PUBLIC_APP_URL, *.totalum-project.com, or same-host (custom domains)
 */
function isAllowedOrigin(origin: string, request: NextRequest): boolean {
  if (!isProduction) return true;
  if (appOrigin && origin === appOrigin) return true;
  if (/^https:\/\/[^/]+\.totalum-project\.com$/.test(origin)) return true;

  // Trust same-host requests — custom domains served by this same worker
  const host = request.headers.get("host");
  if (host && origin === `https://${host}`) return true;

  return false;
}

// Public routes that don't require authentication
const publicRoutes = [
  "/",
  "/about",
  "/contact",
  "/faq",
  "/features",
  "/how",
  "/performance",
  "/dashboard", // guests get the member signup prompt; no portfolio or account data
  "/markets", // full-page Markets browser — read-only preview for guests
  "/tax", // general Inland Revenue information — not personal tax advice
  "/market-news", // guest preview of headlines; the page renders no portfolio
  "/projections", // Top-50 weekly projections per market — read-only preview for guests
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email", // email-verification landing page (success/error handling)
  "/logout", // signs the user out then shows a confirmation screen
  "/pricing",
  "/how-it-works",
  "/how-to-maximize-results",
  "/privacy-policy",
  "/terms-of-service",
  "/ai-disclaimer",
  "/trust",
  "/free-trial",
  "/chat", // Market Assistant — guests see a sign-in prompt; members are not sent to pricing
  "/own-the-bots",
  "/docs",
  "/blog",
  "/changelog",
  "/stox",
  "/koins",
  "/smitty",
  "/buy-the-bots",

  //stripe routes here
  "/stripe/demo",
  "/stripe/success",
  "/stripe/cancel",
];

function mergeVary(response: NextResponse, extra: string) {
  const existing = response.headers.get("Vary");
  const parts = new Set(
    `${existing ?? ""}, ${extra}`
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
  );
  response.headers.set("Vary", Array.from(parts).join(", "));
}

// Add CORS headers if the origin is allowed
function addCorsHeaders(response: NextResponse, request: NextRequest) {
  const origin = request.headers.get("origin");

  if (origin && isAllowedOrigin(origin, request)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
    response.headers.set("Access-Control-Allow-Credentials", "true");
    response.headers.set("Access-Control-Max-Age", "86400");
    mergeVary(response, "Origin");
  }

  return response;
}

function applyHeaderMap(response: NextResponse, headers: Record<string, string>) {
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === "vary") {
      mergeVary(response, value);
      continue;
    }
    response.headers.set(key, value);
  }
  return response;
}

function applyPrivateNoStore(response: NextResponse) {
  return applyHeaderMap(response, PRIVATE_NO_STORE_HEADERS);
}

function applyPublicMarketingCache(response: NextResponse) {
  response.headers.delete("Pragma");
  response.headers.delete("Expires");
  response.headers.delete("Surrogate-Control");
  return applyHeaderMap(response, PUBLIC_MARKETING_CACHE_HEADERS);
}

const STATIC_FILE = /\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|xml|woff2?)$/i;

/** Signed-out visitors are sent to login only for these member routes. */
const memberRoutes = [
  "/settings",
  "/account",
  "/profile",
  "/onboarding",
  "/headmaster",
  "/totalum",
];

function matchesRoute(pathname: string, routes: string[]) {
  return routes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

function applyCachePolicy(response: NextResponse, pathname: string) {
  if (pathname.startsWith("/_next/") || STATIC_FILE.test(pathname)) return response;
  if (pathname.startsWith("/api/")) {
    // Public market reads keep the cache policy their route sets.
    // Session and account books never do.
    if (
      pathname === "/api/session" ||
      pathname.startsWith("/api/session/") ||
      pathname.startsWith("/api/auth/") ||
      isProtectedAccountApi(pathname)
    ) {
      applyPrivateNoStore(response);
    }
    return response;
  }
  if (isCacheableMarketingPath(pathname)) return applyPublicMarketingCache(response);
  return applyPrivateNoStore(response);
}

function clearAnonymousAuthCookies(
  response: NextResponse,
  pathname: string,
  method: string,
  signedIn: boolean,
) {
  if (!shouldClearAnonymousAuthCookies(pathname, method, signedIn)) return response;
  for (const name of AUTH_COOKIE_NAMES) {
    const cookie = expiredAuthCookie(name);
    response.cookies.set(cookie.name, cookie.value, cookie.options);
  }
  return response;
}

function stripLeakedAuthCookies(
  response: NextResponse,
  pathname: string,
  method: string,
  hasSessionToken: boolean,
) {
  const headerBag = response.headers as Headers & { getSetCookie?: () => string[] };
  const current = typeof headerBag.getSetCookie === "function" ? headerBag.getSetCookie() : [];
  if (!current.length) return response;
  const next = filterAnonymousAuthSetCookies(current, pathname, method, hasSessionToken);
  if (next.length === current.length && next.every((line, index) => line === current[index])) return response;
  response.headers.delete("set-cookie");
  for (const line of next) response.headers.append("set-cookie", line);
  return response;
}

function finish(response: NextResponse, request: NextRequest, signedIn: boolean) {
  const { pathname } = request.nextUrl;
  addCorsHeaders(response, request);
  // HSTS, CSP, nosniff and Referrer-Policy are set once in next.config.ts headers().
  applyCachePolicy(response, pathname);
  stripLeakedAuthCookies(response, pathname, request.method, signedIn);
  // After the strip, so the clearing Set-Cookie is what the browser stores.
  // On OpenNext these middleware cookies override a session cookie the
  // handler attaches later in the same response.
  clearAnonymousAuthCookies(response, pathname, request.method, signedIn);
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const signedIn = requestHasSessionToken((name) => request.cookies.get(name)?.value);

  // Handle CORS preflight requests
  if (request.method === "OPTIONS") {
    const response = new NextResponse(null, { status: 204 });
    return finish(response, request, signedIn);
  }

  const alias = publicAliasRedirect(pathname) ?? portfolioAliasRedirect(pathname);
  if (alias) {
    const redirectResponse = NextResponse.redirect(new URL(alias, request.url));
    return finish(redirectResponse, request, signedIn);
  }

  if (!signedIn) {
    const anon = anonymousAccountApi(pathname, request.method);
    if (anon === "session-null") {
      const body = NextResponse.json({ user: null });
      return finish(body, request, false);
    }
    if (anon === "auth-null") {
      // better-auth's signed-out get-session body is JSON null.
      const body = NextResponse.json(null);
      return finish(body, request, false);
    }
    if (anon === "unauthorized") {
      const body = NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
      return finish(body, request, false);
    }
  }

  // Document mode is decided from this request's cookie, not from a
  // worker-cached session. "guest" renders the membership gate. "member"
  // renders a skeleton until GET /api/session confirms the same browser.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-af-doc", signedIn ? "member" : "guest");
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  finish(response, request, signedIn);

  // Allow all API routes and static files. /__missing is the internal 404 rewrite.
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.includes(".") ||
    pathname === "/__missing"
  ) {
    return response;
  }

  if (matchesRoute(pathname, publicRoutes)) {
    return response;
  }

  // Login redirect only for real member routes. Anything else is a 404.
  if (matchesRoute(pathname, memberRoutes)) {
    if (!signedIn) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      const redirectResponse = NextResponse.redirect(loginUrl);
      return finish(redirectResponse, request, false);
    }
    return response;
  }

  const missing = request.nextUrl.clone();
  missing.pathname = "/__missing";
  return finish(NextResponse.rewrite(missing), request, signedIn);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
