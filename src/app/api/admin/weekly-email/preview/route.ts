import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { PRIVACY_OFFICER_EMAIL } from "@/lib/public-copy";
import { signWeeklyEmailToken, weeklyEmailUnsubscribeSecret } from "@/lib/weekly-email";
import {
  composeWeeklyEmail,
  renderWeeklyEmail,
  weeklyEmailUnsubscribeHref,
  withWeeklyEmailHeading,
} from "@/lib/weekly-email-copy";
import { completeWeeklyEmailNote, loadWeeklyEmailBook, loadWeeklyEmailUser } from "@/lib/weekly-email-live";

/**
 * GET /api/admin/weekly-email/preview?user=<id>&ai=1
 * Renders one account's Monday email as HTML. Does not send.
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
  const book = await loadWeeklyEmailBook(account);
  const draft = book.loaded ? composeWeeklyEmail(book) : null;
  const facts = draft
    ? withWeeklyEmailHeading(draft.facts, account.name ?? null, new Date())
    : null;
  let aiNote: string | null = null;
  if (facts && url.searchParams.get("ai") === "1") {
    try {
      aiNote = await completeWeeklyEmailNote(draft!.prompt);
    } catch {
      console.error(`[weekly-email] preview ai failed user=${account.id}`);
      aiNote = null;
    }
  }
  const secret = weeklyEmailUnsubscribeSecret(process.env);
  const unsubscribeUrl = secret
    ? weeklyEmailUnsubscribeHref(await signWeeklyEmailToken(account.id, secret))
    : weeklyEmailUnsubscribeHref("not-configured");
  const mail = facts
    ? renderWeeklyEmail({ to: account.email, facts, aiNote, unsubscribeUrl })
    : null;
  const body = mail
    ? mail.html
    : "<p>This book has no open holdings, so the Monday email would be skipped. Nothing was sent.</p>";
  const html = `<p>Preview only. This was not sent.</p>${body}`;
  console.log(`[weekly-email] preview user=${account.id} holdings=${facts ? "yes" : "no"}`);
  return new NextResponse(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
