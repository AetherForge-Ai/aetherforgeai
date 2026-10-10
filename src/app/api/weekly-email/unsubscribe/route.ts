import { NextResponse } from "next/server";
import { CUSTOMER_EMAIL } from "@/lib/public-copy";
import { escapeHtml } from "@/lib/transactional-mail";
import { optOutWeeklyEmail } from "@/lib/weekly-email-live";
import { verifyWeeklyEmailToken, weeklyEmailUnsubscribeSecret } from "@/lib/weekly-email";

/**
 * GET /api/weekly-email/unsubscribe?token=...
 * Signed link from the Monday email. Stores the opt-out on the existing ledger row.
 * Does not send mail.
 *
 * pull-check:weekly-email-2026-10-11
 */

export const dynamic = "force-dynamic";

function page(message: string, status: number) {
  const html = `<style>
  .mail { font-family: Georgia, "Times New Roman", serif; color: #1c1917; line-height: 1.45; max-width: 36rem; }
</style>
<div class="mail">
  <h1>Weekly email</h1>
  <p>${escapeHtml(message)}</p>
</div>`;
  return new NextResponse(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function GET(req: Request) {
  const secret = weeklyEmailUnsubscribeSecret({
    WEEKLY_EMAIL_UNSUBSCRIBE_SECRET: process.env.WEEKLY_EMAIL_UNSUBSCRIBE_SECRET,
    CRON_SECRET: process.env.CRON_SECRET,
  });
  const token = new URL(req.url).searchParams.get("token") || "";
  const userId = secret ? await verifyWeeklyEmailToken(token, secret) : null;
  if (!userId) {
    return page("This unsubscribe link is not valid. No email was sent.", 400);
  }
  try {
    await optOutWeeklyEmail(userId);
  } catch {
    console.error("[weekly-email] unsubscribe failed");
    return page(
      `The preference could not be saved. Write to ${CUSTOMER_EMAIL}. No email was sent.`,
      500,
    );
  }
  console.log(`[weekly-email] unsubscribed user=${userId}`);
  return page("Weekly email is off for this account. No email was sent.", 200);
}
