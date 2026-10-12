import { NextResponse } from "next/server";
import { handleRenewalReminderRequest } from "@/lib/renewal-reminder";
import { deliverRenewalReminder, loadRenewalReminderCandidates } from "@/lib/renewal-reminder-live";

/**
 * GET|POST /api/cron/renewal-reminder
 *
 * Emails active annual plans 7 days before subscription_expires_at,
 * using the Auckland calendar date. Monthly plans are skipped.
 *
 * CRON_SECRET is required. RENEWAL_REMINDER_ENABLED must be exactly "on"
 * or this route returns without sending. The default is off.
 * No cron trigger is installed. A deploy does not call this route.
 * No new database column is written. Run it once each Auckland day.
 */

export const dynamic = "force-dynamic";

async function handle(req: Request) {
  const result = await handleRenewalReminderRequest({
    url: req.url,
    headers: req.headers,
    env: {
      CRON_SECRET: process.env.CRON_SECRET,
      RENEWAL_REMINDER_ENABLED: process.env.RENEWAL_REMINDER_ENABLED,
    },
    now: new Date(),
    loadCandidates: loadRenewalReminderCandidates,
    send: deliverRenewalReminder,
  });
  if (result.body.sender === "off") {
    console.log(`[renewal-reminder] ${result.body.reason}. No email sent.`);
  }
  return NextResponse.json(result.body, { status: result.status });
}

export async function GET(req: Request) {
  try {
    return await handle(req);
  } catch {
    console.error("[renewal-reminder] GET error");
    return NextResponse.json({ ok: false, sent: 0, sender: "off", reason: "failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    return await handle(req);
  } catch {
    console.error("[renewal-reminder] POST error");
    return NextResponse.json({ ok: false, sent: 0, sender: "off", reason: "failed" }, { status: 500 });
  }
}
