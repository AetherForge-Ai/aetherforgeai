import { hasSignOutMarker } from "@/lib/sign-out-marker";
import { BOOK_WRITE_COOKIE, isBookWriteRequest } from "@/lib/book-write-mark";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { PRIVATE_NO_STORE_HEADERS } from "@/lib/account-guard";
import { portfolioAliasRedirect } from "@/lib/portfolio-route-aliases";
import {
  filterAnonymousAuthSetCookies,
  isCacheableMarketingPath,
  isCookieFreePath,
  PUBLIC_MARKETING_CACHE_HEADERS,
  shouldClearAnonymousAuthCookies,
} from "@/lib/private-document";
import { permanentRedirect, publicAliasRedirect } from "@/lib/public-route-aliases";
import { documentAccess } from "@/lib/route-gate";
import { makeCspNonce, nonceCsp } from "@/lib/security-headers";
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

function applyCachePolicy(response: NextResponse, pathname: string, signedIn = false) {
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
  // M-1: edge-cache marketing pages for visitors only; a session cookie bypasses.
  if (!signedIn && isCacheableMarketingPath(pathname)) return applyPublicMarketingCache(response);
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

function finish(response: NextResponse, request: NextRequest, signedIn: boolean, nonce?: string) {
  const { pathname } = request.nextUrl;
  addCorsHeaders(response, request);
  // CR-5 (goal b8): the enforced CSP carries this request's nonce; no 'unsafe-inline'.
  response.headers.set("Content-Security-Policy", nonceCsp(nonce ?? request.headers.get("x-nonce") ?? makeCspNonce()));
  // HSTS, CSP, nosniff and Referrer-Policy are set once in next.config.ts headers().
  applyCachePolicy(response, pathname, signedIn);
  stripLeakedAuthCookies(response, pathname, request.method, signedIn);
  // After the strip, so the clearing Set-Cookie is what the browser stores.
  // On OpenNext these middleware cookies override a session cookie the
  // handler attaches later in the same response.
  // b42 P1: clearing keys off a real missing token, not the sign-out marker. A late reply to a
  // marked request must not expire the session a fresh sign-in just set (the logout reply already
  // expired the old cookies). Session Set-Cookies are still stripped above for marked requests.
  const hasToken = requestHasSessionToken((name) => request.cookies.get(name)?.value);
  clearAnonymousAuthCookies(response, pathname, request.method, signedIn || hasToken);
  if (isCookieFreePath(pathname)) response.headers.delete("set-cookie");
  return response;
}

/** b40: pages with no signed-out view. /dashboard keeps its own signed-out gate and is not listed. */
const SIGNED_IN_ONLY = ["/settings", "/account", "/profile", "/onboarding", "/import"];
function isSignedInOnlyPage(pathname: string): boolean {
  return SIGNED_IN_ONLY.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // b42 P1: a request made after the Sign out click carries af_so and is signed out, even when it
  // overtakes the logout POST. A successful sign-in clears the marker.
  const signedIn =
    requestHasSessionToken((name) => request.cookies.get(name)?.value) && !hasSignOutMarker((name) => request.cookies.get(name)?.value);

  // Handle CORS preflight requests
  if (request.method === "OPTIONS") {
    const response = new NextResponse(null, { status: 204 });
    return finish(response, request, signedIn);
  }

  const moved = permanentRedirect(pathname);
  if (moved) {
    return finish(NextResponse.redirect(new URL(moved, request.url), 301), request, signedIn);
  }

  const alias = publicAliasRedirect(pathname) ?? portfolioAliasRedirect(pathname);
  if (alias) {
    const redirectResponse = NextResponse.redirect(new URL(alias, request.url));
    return finish(redirectResponse, request, signedIn);
  }

  // b40 (TT b39 P1 sign-out leak): a signed-in-only page requested with no session cookie is redirected
  // here, before any render, so a stale or cached signed-in document can't be shown after sign-out.
  if (!signedIn && request.method === "GET" && isSignedInOnlyPage(pathname)) {
    const login = new URL("/login", request.url);
    login.searchParams.set("redirect", pathname);
    const res = NextResponse.redirect(login, 307);
    res.headers.set("Cache-Control", "private, no-store, max-age=0");
    return finish(res, request, false);
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
  // Next.js reads the nonce from the request CSP header and stamps its own scripts.
  const nonce = makeCspNonce();
  const csp = nonceCsp(nonce);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  finish(response, request, signedIn, nonce);
  // b29 H-4/G-10: stamp book writes so other isolates' cached books are skipped for this browser.
  if (signedIn && isBookWriteRequest(pathname, request.method)) {
    response.cookies.set(BOOK_WRITE_COOKIE, String(Date.now()), { path: "/", sameSite: "lax", secure: true, httpOnly: true, maxAge: 60 * 60 });
  }

  // Allow all API routes and static files. /__missing is the internal 404 rewrite.
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.includes(".") ||
    pathname === "/__missing"
  ) {
    return response;
  }

  const access = documentAccess(pathname);
  if (access === "public") {
    return response;
  }

  if (access === "test-hooks") {
    if (signedIn && process.env.GOAL_TEST_HOOKS === "1") return response;
  } else if (access === "member") {
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
