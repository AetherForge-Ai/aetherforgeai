import { NextResponse } from "next/server";
import { handleWeeklyEmailUnsubscribe, weeklyEmailUnsubscribeSecret } from "@/lib/weekly-email";
import { optOutWeeklyEmail } from "@/lib/weekly-email-live";

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
