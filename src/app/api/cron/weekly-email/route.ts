import { NextResponse } from "next/server";
import {
  handleWeeklyEmailCron,
  signWeeklyEmailToken,
  weeklyEmailSendingEnabled,
  weeklyEmailUnsubscribeSecret,
  weeklyEmailWindow,
} from "@/lib/weekly-email";
import { weeklyEmailUnsubscribeHref, renderWeeklyEmail } from "@/lib/weekly-email-copy";
import {
  completeWeeklyEmailNote,
  deliverWeeklyEmail,
  liveWeeklyEmailNoteStore,
  liveWeeklyEmailStore,
  loadWeeklyEmailBoard,
  loadWeeklyEmailCandidates,
} from "@/lib/weekly-email-live";

/**
 * GET|POST /api/cron/weekly-email
 *
 * Monday morning projections email for a paid plan.
 * Pacific/Auckland, 07:00 through 08:59. One tick sends a bounded batch.
 * Later ticks in that window continue. The same user is not sent twice in one ISO week.
 * Every recipient gets the same market-wide board. An empty board skips the send.
 *
 * WEEKLY_EMAIL_SEND must be exactly "on" or this route returns without sending.
 * CRON_SECRET is also required. If it is missing the route stays closed.
 * No cron trigger is installed. A deploy does not call this route.
 *
 * pull-check:weekly-email-2026-10-11
 */

export const dynamic = "force-dynamic";

async function handle(req: Request) {
  const secret = weeklyEmailUnsubscribeSecret({
    WEEKLY_EMAIL_UNSUBSCRIBE_SECRET: process.env.WEEKLY_EMAIL_UNSUBSCRIBE_SECRET,
    CRON_SECRET: process.env.CRON_SECRET,
  });
  const result = await handleWeeklyEmailCron({
    url: req.url,
    headers: req.headers,
    env: {
      CRON_SECRET: process.env.CRON_SECRET,
      WEEKLY_EMAIL_SEND: process.env.WEEKLY_EMAIL_SEND,
      WEEKLY_EMAIL_UNSUBSCRIBE_SECRET: process.env.WEEKLY_EMAIL_UNSUBSCRIBE_SECRET,
    },
    now: new Date(),
    users: await loadUsersIfConfigured(req),
    store: liveWeeklyEmailStore,
    noteStore: liveWeeklyEmailNoteStore,
    loadBoard: () => loadWeeklyEmailBoard(new Date()),
    render: renderWeeklyEmail,
    complete: completeWeeklyEmailNote,
    send: deliverWeeklyEmail,
    unsubscribeUrl: async (userId) => {
      if (!secret) return weeklyEmailUnsubscribeHref("unset");
      return weeklyEmailUnsubscribeHref(await signWeeklyEmailToken(userId, secret));
    },
  });
  if (result.body.sender === "off" || result.body.reason === "no-projections") {
    console.log(`[weekly-email] ${result.body.reason}. No email sent.`);
  }
  return NextResponse.json(result.body, { status: result.status });
}

async function loadUsersIfConfigured(req: Request) {
  if (!process.env.CRON_SECRET) return [];
  const presented =
    new URL(req.url).searchParams.get("key") ||
    new URL(req.url).searchParams.get("secret") ||
    req.headers.get("x-cron-secret") ||
    "";
  const bearer = req.headers.get("authorization");
  const token = bearer?.toLowerCase().startsWith("bearer ") ? bearer.slice(7).trim() : "";
  if (presented !== process.env.CRON_SECRET && token !== process.env.CRON_SECRET) return [];
  if (!weeklyEmailSendingEnabled({ WEEKLY_EMAIL_SEND: process.env.WEEKLY_EMAIL_SEND })) return [];
  if (!weeklyEmailWindow(new Date()).open) return [];
  return loadWeeklyEmailCandidates();
}

export async function GET(req: Request) {
  try {
    return await handle(req);
  } catch {
    console.error("[weekly-email] GET error");
    return NextResponse.json({ ok: false, sent: 0, sender: "off", reason: "failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    return await handle(req);
  } catch {
    console.error("[weekly-email] POST error");
    return NextResponse.json({ ok: false, sent: 0, sender: "off", reason: "failed" }, { status: 500 });
  }
}
