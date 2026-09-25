"use client";

import { createSingleFlight } from "@/lib/single-flight";
import {
  LIVE_SESSION_PATH,
  REFRESH_SESSION_PATH,
  shouldRecoverSession,
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
 * First 401 → refresh once, then retry the original request.
 * A second 401 on a background poll keeps the session (no sign-out).
 * A second 401 on a user action is a real unauthorized response, still
 * without forcing sign-out — the caller surfaces the error.
 */
export function authActionOn401(url: string, alreadyRetried: boolean): Auth401Action {
  if (!alreadyRetried) return "retry";
  if (isBackgroundAuthPoll(url)) return "keep-session";
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
 * Identity probe. Skips the 2-minute session_data cache and does not rotate
 * the session cookie. A separate single-flight from the refresh below.
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

async function recoverLiveSessionUser(input: {
  purpose: "page" | "nav";
  atomUserId?: string | null;
}): Promise<LiveSessionUser | null> {
  const first = await readLiveSessionUser();
  if (first) return first;
  if (!shouldRecoverSession(input)) return null;
  await refreshSessionSingleFlight();
  return readLiveSessionUser();
}

/** Dashboard pages: one strict read, then the existing refresh flight if that read is empty. */
export function confirmPageSession(): Promise<LiveSessionUser | null> {
  return recoverLiveSessionUser({ purpose: "page" });
}

/**
 * Nav identity. Recovers through the refresh flight only when the session
 * atom already has a user, so a logged-out page does not rotate the cookie.
 */
export function confirmSessionUser(atomUserId?: string | null): Promise<LiveSessionUser | null> {
  return recoverLiveSessionUser({ purpose: "nav", atomUserId });
}

export type TradeSessionAlign =
  | { ok: true; userId: string | null; refreshed: boolean }
  | { ok: false; reason: "mismatch" };

/**
 * Session for a confirmed trade. Strict read first so Confirm does not itself
 * rotate the cookie. One call to the existing refresh flight only when that
 * read is empty. A live user other than the account on screen is refused.
 */
export async function alignTradeSession(
  activeUserId: string | null,
  allowRefresh: boolean,
): Promise<TradeSessionAlign> {
  let refreshed = false;
  let live = await readLiveSessionUser();
  if (!live && allowRefresh) {
    refreshed = true;
    await refreshSessionSingleFlight();
    live = await readLiveSessionUser();
  }
  if (live && activeUserId && live.id !== activeUserId) {
    return { ok: false, reason: "mismatch" };
  }
  return { ok: true, userId: live?.id ?? null, refreshed };
}

const POST_LOGIN_RETRY_MS = 400;

/**
 * After sign-in, don't leave /login until a strict read sees the user.
 * One rotating refresh if the first read is empty, then one delayed strict
 * read for the cookie to land. Navigating earlier paints a signed-out book.
 */
export async function waitForPostLoginSession(): Promise<boolean> {
  const first = await alignTradeSession(null, true);
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
