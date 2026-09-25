"use client";

import { createSingleFlight } from "@/lib/single-flight";
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
  user?: Partial<LiveSessionUser> | null;
  session?: unknown;
} | null;

function parseLiveUser(data: SessionEnvelope): LiveSessionUser | null {
  const user = data?.user;
  if (!user?.id || !user.email) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name || user.email,
    image: user.image ?? null,
    subscription_status: user.subscription_status,
    subscription_plan: user.subscription_plan,
  };
}

/**
 * Identity probe. Hits GET /api/session, which reads the token and does not
 * rotate the cookie. Not the better-auth get-session URL.
 */
const readLiveSessionUser = createSingleFlight(async (): Promise<LiveSessionUser | null> => {
  if (typeof window === "undefined") return null;
  try {
    const res = await fetch(LIVE_SESSION_PATH, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as SessionEnvelope;
    return parseLiveUser(data);
  } catch {
    return null;
  }
});

/** Dashboard and nav: one stable read. A null result is not a reason to rotate. */
export function confirmPageSession(): Promise<LiveSessionUser | null> {
  return readLiveSessionUser();
}

/** Nav identity. The session atom is not consulted — it can name the previous book. */
export function confirmSessionUser(_atomUserId?: string | null): Promise<LiveSessionUser | null> {
  return readLiveSessionUser();
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
  const live = await readLiveSessionUser();
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
