"use client";

import { clearOfflineCaches } from "@/components/PwaRegister";
import { clearClientUserState } from "@/lib/client-user-state";

/** b41 P1: the sign-out POST waits at most this long before the beacon fallback. */
export const SIGN_OUT_POST_MS = 4_000;

/**
 * b41 P1 (TT b40: clicking Sign out then loading /settings within 0.3 s left the session alive).
 * The click itself revokes the session: POST /api/session/logout (it deletes the session row, marks
 * the token revoked for every isolate, and expires the cookies in that response) is awaited before
 * any navigation. If it fails or times out, a sendBeacon carries the same request. Client state and
 * offline caches are cleared, then a hard navigation drops the router cache.
 */
export async function signOutNow(opts: { navigate?: (url: string) => void } = {}): Promise<boolean> {
  let ok = false;
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = setTimeout(() => controller?.abort(), SIGN_OUT_POST_MS);
  try {
    const res = await fetch("/api/session/logout", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      keepalive: true,
      signal: controller?.signal,
    });
    ok = res.ok;
  } catch {
    ok = false;
  } finally {
    clearTimeout(timer);
  }
  if (!ok) {
    try {
      ok = typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function" && navigator.sendBeacon("/api/session/logout");
    } catch {
      ok = false;
    }
  }
  try {
    clearClientUserState();
  } catch {
    /* nothing to clear */
  }
  await clearOfflineCaches().catch(() => undefined);
  const go = opts.navigate ?? ((url: string) => window.location.replace(url));
  go(ok ? "/logout?done=1" : "/logout");
  return ok;
}
