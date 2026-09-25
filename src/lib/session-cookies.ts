import "server-only";
import { cookies } from "next/headers";
import {
  SESSION_AUX_COOKIE_NAMES,
  SESSION_DATA_COOKIE_NAMES,
  SESSION_TOKEN_COOKIE_NAMES,
} from "@/lib/session-owner";

/** Expire better-auth cookies on both the secure and plain names. */
export async function expireAuthCookies(): Promise<void> {
  const names = [
    ...SESSION_TOKEN_COOKIE_NAMES,
    ...SESSION_DATA_COOKIE_NAMES,
    ...SESSION_AUX_COOKIE_NAMES,
  ];
  try {
    const jar = await cookies();
    for (const name of names) {
      const secure = name.startsWith("__Secure-");
      jar.set(name, "", {
        path: "/",
        maxAge: 0,
        httpOnly: true,
        secure,
        sameSite: secure ? "none" : "lax",
      });
    }
  } catch (err) {
    console.error("[session] Failed to expire auth cookies:", err);
  }
}
