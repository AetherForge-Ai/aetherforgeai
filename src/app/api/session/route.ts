import { NextResponse } from "next/server";
import { PRIVATE_NO_STORE_HEADERS } from "@/lib/account-guard";
import { getSessionState, hasPaidSubscription, isStripeConfigured, lastGoodSessionCookieFor } from "@/lib/session";
import { headers } from "next/headers";
import { LAST_GOOD_SESSION_COOKIE, LAST_GOOD_SESSION_MAX_AGE_S } from "@/lib/last-good-session";
import { resolveDisplayName, resolveGreetingName } from "@/lib/user-display";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function botAccess(value: unknown): "stock" | "crypto" | "both" | "none" {
  if (value === "stock" || value === "crypto" || value === "both" || value === "none") return value;
  return "none";
}

/**
 * GET /api/session — the browser's paper-book owner.
 * Reads the session token and ignores session_data. Does not rotate the cookie.
 * HTTP 200 with `user: null` when signed out, so the client does not treat a
 * miss as a reason to call the rotating get-session.
 * The body is private and must not be stored by a shared CDN.
 */
export async function GET() {
  const { user, unavailable } = await getSessionState();
  if (unavailable) {
    // b27 H-4: a slow or failed store read is not a sign-out. The browser retries.
    return NextResponse.json({ user: null, unavailable: true }, { status: 503, headers: { ...PRIVATE_NO_STORE_HEADERS, "Retry-After": "1" } });
  }
  if (!user) {
    return NextResponse.json({ user: null }, { headers: PRIVATE_NO_STORE_HEADERS });
  }
  const access = botAccess(user.bot_access);
  const res = NextResponse.json(
    {
      user: {
        id: user.id,
        email: user.email,
        name: resolveDisplayName(user) || user.name,
        image: user.image ?? null,
        subscription_status: user.subscription_status ?? null,
        subscription_plan: user.subscription_plan ?? null,
        greetingName: resolveGreetingName(user),
        metalsEntitled: !isStripeConfigured() || hasPaidSubscription(user),
        subscription: {
          status: user.subscription_status ?? null,
          plan: user.subscription_plan ?? null,
          startedAt: user.subscription_started_at ?? null,
          expiresAt: user.subscription_expires_at ?? null,
          tickerLimit: typeof user.ticker_limit === "number" ? user.ticker_limit : null,
          botAccess: access,
        },
      },
    },
    { headers: PRIVATE_NO_STORE_HEADERS }
  );
  // b32 REG-1: refresh the signed last-good session so a later store hang never blocks render.
  try {
    const value = await lastGoodSessionCookieFor((await headers()).get("cookie"), { id: user.id, email: user.email, name: user.name });
    if (value) res.cookies.set(LAST_GOOD_SESSION_COOKIE, value, { path: "/", httpOnly: true, secure: true, sameSite: "lax", maxAge: LAST_GOOD_SESSION_MAX_AGE_S });
  } catch {
    /* best effort */
  }
  return res;
}
