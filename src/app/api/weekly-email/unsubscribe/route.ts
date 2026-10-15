import { NextResponse } from "next/server";
import { handleWeeklyEmailUnsubscribe, weeklyEmailUnsubscribeSecret } from "@/lib/weekly-email";
import { optOutWeeklyEmail } from "@/lib/weekly-email-live";
import { PUBLIC_POST_LIMIT, PUBLIC_POST_WINDOW_MS, rateLimitHeaders, rateLimitIdentity, takeRateLimit } from "@/lib/ip-rate-limit";
import { ensureDurableRateLimit } from "@/lib/durable-counter.server";

ensureDurableRateLimit();

/**
 * GET /api/weekly-email/unsubscribe?token=...
 * Shows a confirmation page. A prefetch does not change the preference.
 * POST carries the same signed token in the form and must be same-origin.
 * That POST stores the opt-out. It does not send mail.
 *
 * RFC 8058 List-Unsubscribe and List-Unsubscribe-Post are not set on the
 * Monday email. sendTransactionalEmail posts EmailPayloadI, which has no
 * custom header field.
 *
 * pull-check:weekly-email-2026-10-11
 * pull-check:weekly-unsub-confirm-2026-10-11
 */

export const dynamic = "force-dynamic";

function unsubscribeSecret(): string | null {
  return weeklyEmailUnsubscribeSecret({
    WEEKLY_EMAIL_UNSUBSCRIBE_SECRET: process.env.WEEKLY_EMAIL_UNSUBSCRIBE_SECRET,
    CRON_SECRET: process.env.CRON_SECRET,
  });
}

function respond(result: { status: number; html: string; headers: Record<string, string> }) {
  return new NextResponse(result.html, { status: result.status, headers: result.headers });
}

export async function GET(req: Request) {
  const result = await handleWeeklyEmailUnsubscribe({
    method: "GET",
    url: req.url,
    headers: req.headers,
    formToken: null,
    secret: unsubscribeSecret(),
    optOut: optOutWeeklyEmail,
  });
  return respond(result);
}

export async function POST(req: Request) {
  const identity = rateLimitIdentity(req);
  const limit = await takeRateLimit(
    `weekly-unsubscribe:${encodeURIComponent(identity.ok ? identity.ip : "unknown")}`,
    PUBLIC_POST_LIMIT,
    PUBLIC_POST_WINDOW_MS
  );
  if (!limit.allowed) {
    return new NextResponse("Too many requests. Try again in a minute.", {
      status: 429,
      headers: { "Content-Type": "text/plain; charset=utf-8", ...rateLimitHeaders(limit, true) },
    });
  }
  let formToken: string | null = null;
  try {
    const form = await req.formData();
    const value = form.get("token");
    formToken = typeof value === "string" ? value : null;
  } catch {
    formToken = null;
  }
  const result = await handleWeeklyEmailUnsubscribe({
    method: "POST",
    url: req.url,
    headers: req.headers,
    formToken,
    secret: unsubscribeSecret(),
    optOut: optOutWeeklyEmail,
  });
  return respond(result);
}
