import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { PRIVACY_OFFICER_EMAIL } from "@/lib/public-copy";
import { signWeeklyEmailToken, weeklyEmailUnsubscribeSecret } from "@/lib/weekly-email";
import { renderWeeklyEmail, weeklyEmailPrompt, weeklyEmailUnsubscribeHref } from "@/lib/weekly-email-copy";
import { completeWeeklyEmailNote, loadWeeklyEmailBoard, loadWeeklyEmailUser } from "@/lib/weekly-email-live";

/**
 * GET /api/admin/weekly-email/preview?user=<id>&ai=1
 * Renders the Monday projections email as HTML. Does not send.
 * The board is market-wide. The user id only chooses the unsubscribe link.
 * Restricted to the privacy-officer account.
 *
 * pull-check:weekly-email-2026-10-11
 */

export const dynamic = "force-dynamic";

function denied() {
  return new NextResponse("Not found", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function GET(req: Request) {
  const session = await getCurrentUser();
  if (!session || session.email.trim().toLowerCase() !== PRIVACY_OFFICER_EMAIL.toLowerCase()) {
    return denied();
  }
  const url = new URL(req.url);
  const userId = (url.searchParams.get("user") || session._id).trim();
  if (!userId || userId.length > 80) return denied();
  const account = await loadWeeklyEmailUser(userId);
  if (!account) return denied();
  const board = await loadWeeklyEmailBoard(new Date());
  let aiNote: string | null = null;
  if (board && url.searchParams.get("ai") === "1") {
    try {
      aiNote = await completeWeeklyEmailNote(weeklyEmailPrompt(board));
    } catch {
      console.error("[weekly-email] preview ai failed");
      aiNote = null;
    }
  }
  const secret = weeklyEmailUnsubscribeSecret({
    WEEKLY_EMAIL_UNSUBSCRIBE_SECRET: process.env.WEEKLY_EMAIL_UNSUBSCRIBE_SECRET,
    CRON_SECRET: process.env.CRON_SECRET,
  });
  const unsubscribeUrl = secret
    ? weeklyEmailUnsubscribeHref(await signWeeklyEmailToken(account.id, secret))
    : weeklyEmailUnsubscribeHref("not-configured");
  const mail = board
    ? renderWeeklyEmail({ to: account.email, board, aiNote, unsubscribeUrl })
    : null;
  const body = mail
    ? mail.html
    : "<p>No verified projections were available, so the Monday email would be skipped. Nothing was sent.</p>";
  const html = `<p>Preview only. This was not sent.</p>${body}`;
  console.log(`[weekly-email] preview user=${account.id} projections=${board ? board.projections.length : 0}`);
  return new NextResponse(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
