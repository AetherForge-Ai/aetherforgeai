import { NextResponse } from "next/server";
import { PRIVATE_NO_STORE_HEADERS } from "@/lib/account-guard";
import { getStableSessionUser, hasPaidSubscription, isStripeConfigured } from "@/lib/session";
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
  const user = await getStableSessionUser();
  if (!user) {
    return NextResponse.json({ user: null }, { headers: PRIVATE_NO_STORE_HEADERS });
  }
  const access = botAccess(user.bot_access);
  return NextResponse.json(
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
}
