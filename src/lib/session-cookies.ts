import "server-only";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { AUTH_COOKIE_NAMES, expiredAuthCookie } from "@/lib/session-owner";

/**
 * Write the expiry onto the response we actually return.
 * `cookies().set()` from a route handler is not always attached on the
 * Cloudflare/OpenNext response, which left the session token in place after
 * the logout page already said the session was closed.
 */
export function applyExpiredAuthCookies(response: NextResponse): void {
  for (const name of AUTH_COOKIE_NAMES) {
    const cookie = expiredAuthCookie(name);
    response.cookies.set(cookie.name, cookie.value, cookie.options);
  }
}

/** Expire better-auth cookies on both the secure and plain names. */
export async function expireAuthCookies(): Promise<void> {
  try {
    const jar = await cookies();
    for (const name of AUTH_COOKIE_NAMES) {
      const cookie = expiredAuthCookie(name);
      jar.set(cookie.name, cookie.value, cookie.options);
    }
  } catch (err) {
    console.error("[session] Failed to expire auth cookies:", err);
  }
}
