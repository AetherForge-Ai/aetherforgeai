import { NextResponse } from "next/server";
import * as crypto from "node:crypto";
import { cronSecretBuffers, presentedHeaderCronSecret } from "@/lib/cron-header-secret";
import { BACKFILL_SESSIONS, captureDailyCloses, HISTORY_UNAVAILABLE } from "@/lib/daily-price-history";
import { DAILY_PRICE_FEEDS } from "@/lib/daily-price-sources";
import { readDailyPriceHistory, totalumDailyPriceStore } from "@/lib/daily-price-history.server";

export const dynamic = "force-dynamic";

/**
 * GET|POST /api/cron/daily-prices
 *
 * Stores the previous completed session when Auckland local time is in the 6am hour.
 * Two UTC schedules cover NZDT and NZST (see DAILY_PRICE_CRON_NZDT / DAILY_PRICE_CRON_NZST).
 * The OpenNext wrangler.jsonc has no cron trigger. .github/workflows/cron.yml calls this route.
 *
 * CRON_SECRET is read from x-cron-secret or Authorization: Bearer only.
 * A query key is ignored. POST {"force":true} runs outside the 6am hour (manual dispatch).
 * Unconfirmed feeds are skipped and nothing is invented. No user-account writes.
 */

async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, ran: false, reason: "cron-not-configured" }, { status: 503 });
  }
  const buffers = cronSecretBuffers(secret, presentedHeaderCronSecret(req.headers));
  if (!buffers || !crypto.timingSafeEqual(buffers.expected, buffers.presented)) {
    return NextResponse.json({ ok: false, ran: false, reason: "unauthorized" }, { status: 401 });
  }
  let force = false;
  if (req.method === "POST") {
    const body = (await req.json().catch(() => ({}))) as { force?: unknown };
    force = body?.force === true;
  }
  const existing = await readDailyPriceHistory();
  const store = totalumDailyPriceStore();
  if (!existing.ok || !store) {
    return NextResponse.json({ ok: true, ran: false, reason: HISTORY_UNAVAILABLE, inserted: 0, skipped: [] });
  }
  try {
    const report = await captureDailyCloses({
      now: new Date(),
      force,
      store,
      feeds: DAILY_PRICE_FEEDS,
      sessions: BACKFILL_SESSIONS,
      // Unconfirmed feeds are skipped before this runs. A null bar is a gap, not a made-up close.
      readFeed: async () => null,
    });
    console.log(
      `[daily-prices] ran=${report.ran} inserted=${report.inserted} existing=${report.existing} gaps=${report.gaps} skipped=${report.skipped.length}`
    );
    return NextResponse.json({ ok: true, ...report });
  } catch (err) {
    console.error("[daily-prices] capture failed:", err instanceof Error ? err.message.slice(0, 120) : "failed");
    return NextResponse.json({ ok: false, ran: false, reason: "failed" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
