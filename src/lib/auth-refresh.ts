"use client";

import { createSingleFlight } from "@/lib/single-flight";
import { parseDashboardSessionUser, type DashboardSessionUser } from "@/lib/dashboard-session";
import { isSharedCacheReplay } from "@/lib/private-document";
import {
  LIVE_SESSION_PATH,
  REFRESH_SESSION_PATH,
  type LiveSessionUser,
} from "@/lib/session-owner";

export type { LiveSessionUser };

/**
 * Background polls and Koins reads. A 401 here must not sign the user out.
 * `/api/crypto` covers spot, markets, coin and chart — one refresh-retry,
 * then a quiet failure the caller degrades from.
 */
const BACKGROUND_POLLS = ["/api/crypto", "/api/stocks/refresh"];

export function isBackgroundAuthPoll(url: string): boolean {
  return BACKGROUND_POLLS.some((path) => url.includes(path));
}

export type Auth401Action = "retry" | "keep-session" | "unauthorized";

/**
 * Background polls never retry through the rotating session endpoint.
 * Other 401s may retry the same request once. They must not rotate the
 * cookie: a failed refresh deletes the token and Confirm then 401s.
 */
export function authActionOn401(url: string, alreadyRetried: boolean): Auth401Action {
  if (isBackgroundAuthPoll(url)) return "keep-session";
  if (!alreadyRetried) return "retry";
  return "unauthorized";
}

type SessionEnvelope = {
  user?: unknown;
  session?: unknown;
} | null;

function parseLiveUser(data: SessionEnvelope): LiveSessionUser | null {
  const user = data?.user;
  if (!user || typeof user !== "object") return null;
  const row = user as Partial<LiveSessionUser>;
  if (!row.id || !row.email) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name || row.email,
    image: row.image ?? null,
    subscription_status: row.subscription_status,
    subscription_plan: row.subscription_plan,
  };
}

/**
 * Identity probe. Hits GET /api/session, which reads the token and does not
 * rotate the cookie. Not the better-auth get-session URL.
 *
 * Logout bumps the epoch so a read that started while the cookie still
 * existed cannot be reused as proof the browser is still signed in.
 */
let liveSessionEpoch = 0;

export function invalidateLiveSessionProbe(): void {
  liveSessionEpoch += 1;
}

async function fetchSessionEnvelope(epochAtStart: number): Promise<SessionEnvelope> {
  if (typeof window === "undefined") return null;
  try {
    const res = await fetch(LIVE_SESSION_PATH, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
    if (epochAtStart !== liveSessionEpoch) return fetchSessionEnvelope(liveSessionEpoch);
    if (!res.ok) return null;
    // A colo can still be holding another member's /api/session body.
    // Do not treat that replay as this browser's paper book.
    if (isSharedCacheReplay(res.headers)) return null;
    const data = (await res.json().catch(() => null)) as SessionEnvelope;
    if (epochAtStart !== liveSessionEpoch) return fetchSessionEnvelope(liveSessionEpoch);
    return data;
  } catch {
    return null;
  }
}

const readSessionEnvelope = createSingleFlight(() => fetchSessionEnvelope(liveSessionEpoch));

/** Dashboard and nav: one stable read. A null result is not a reason to rotate. */
export function confirmPageSession(): Promise<LiveSessionUser | null> {
  return readSessionEnvelope().then(parseLiveUser);
}

/**
 * Paper-book gate. Same uncached read as the nav, including subscription
 * fields. Null until this browser's cookie resolves to a user.
 */
export function confirmDashboardSession(): Promise<DashboardSessionUser | null> {
  return readSessionEnvelope().then(parseDashboardSessionUser);
}

/** Nav identity. The session atom is not consulted — it can name the previous book. */
export function confirmSessionUser(_atomUserId?: string | null): Promise<LiveSessionUser | null> {
  return readSessionEnvelope().then(parseLiveUser);
}

export type TradeSessionAlign =
  | { ok: true; userId: string | null; refreshed: boolean }
  | { ok: false; reason: "mismatch" };

/**
 * Session for a confirmed trade. Stable read only. `allowRefresh` is ignored:
 * calling the rotating get-session here deletes a valid token and the POST
 * that follows is 401. A live user other than the account on screen is refused.
 */
export async function alignTradeSession(
  activeUserId: string | null,
  _allowRefresh = false,
): Promise<TradeSessionAlign> {
  const live = await confirmPageSession();
  if (live && activeUserId && live.id !== activeUserId) {
    return { ok: false, reason: "mismatch" };
  }
  return { ok: true, userId: live?.id ?? null, refreshed: false };
}

const POST_LOGIN_RETRY_MS = 400;

/**
 * After sign-in, don't leave /login until the stable read sees the user.
 * The sign-in response already set the cookie. A rotating refresh here can
 * delete it before the dashboard document loads.
 */
export async function waitForPostLoginSession(): Promise<boolean> {
  const first = await alignTradeSession(null, false);
  if (first.ok && first.userId) return true;
  await new Promise((resolve) => setTimeout(resolve, POST_LOGIN_RETRY_MS));
  const second = await alignTradeSession(null, false);
  return !!(second.ok && second.userId);
}

/**
 * One shared GET /api/auth/get-session. Concurrent callers await the same
 * refresh so they cannot invalidate each other's session cookie.
 */
export const refreshSessionSingleFlight = createSingleFlight(async (): Promise<boolean> => {
  if (typeof window === "undefined") return false;
  try {
    const res = await fetch(REFRESH_SESSION_PATH, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return false;
    const data = (await res.json().catch(() => null)) as { user?: unknown; session?: unknown } | null;
    return !!(data && (data.user || data.session));
  } catch {
    return false;
  }
});
