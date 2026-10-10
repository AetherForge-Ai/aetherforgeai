import { NextResponse } from "next/server";
import { handleWeeklyEmailUnsubscribe, weeklyEmailUnsubscribeSecret } from "@/lib/weekly-email";

/**
 * GET /unsubscribe?token=...
 * Confirm page only. Opening this address does not change the weekly email setting.
 * The form posts to /api/weekly-email/unsubscribe, which is the only opt-out.
 *
 * pull-check:retest4-2026-10-11
 */

export const dynamic = "force-dynamic";

function unsubscribeSecret(): string | null {
  return weeklyEmailUnsubscribeSecret({
    WEEKLY_EMAIL_UNSUBSCRIBE_SECRET: process.env.WEEKLY_EMAIL_UNSUBSCRIBE_SECRET,
    CRON_SECRET: process.env.CRON_SECRET,
  });
}

export async function GET(req: Request) {
  const result = await handleWeeklyEmailUnsubscribe({
    method: "GET",
    url: req.url,
    headers: req.headers,
    formToken: null,
    secret: unsubscribeSecret(),
    optOut: async () => {
      throw new Error("GET /unsubscribe does not change the weekly email setting");
    },
  });
  return new NextResponse(result.html, { status: result.status, headers: result.headers });
}
