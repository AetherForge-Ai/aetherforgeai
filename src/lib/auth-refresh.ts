"use client";

import { createSingleFlight } from "@/lib/single-flight";

/** Background polls. A 401 here must not sign the user out. */
const BACKGROUND_POLLS = ["/api/crypto/spot", "/api/stocks/refresh"];

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

/**
 * One shared GET /api/auth/get-session. Concurrent callers await the same
 * refresh so they cannot invalidate each other's session cookie.
 */
export const refreshSessionSingleFlight = createSingleFlight(async (): Promise<boolean> => {
  if (typeof window === "undefined") return false;
  try {
    const res = await fetch("/api/auth/get-session", {
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
