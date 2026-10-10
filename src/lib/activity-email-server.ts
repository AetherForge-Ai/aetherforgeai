import "server-only";
import { cookies } from "next/headers";
import { EMAIL_PREFS_COOKIE, parseEmailPrefs, type EmailPrefs } from "@/lib/notification-prefs";

/** Notification choices for a preview. A missing cookie uses the opt-in defaults. */
export async function readActivityEmailPrefs(): Promise<EmailPrefs> {
  try {
    const jar = await cookies();
    return parseEmailPrefs(jar.get(EMAIL_PREFS_COOKIE)?.value);
  } catch (err) {
    console.error("[activity-email] Could not read notification choices:", err);
    return parseEmailPrefs(undefined);
  }
}
