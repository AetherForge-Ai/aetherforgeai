import { NextResponse } from "next/server";
import * as crypto from "node:crypto";
import { cronSecretBuffers, presentedHeaderCronSecret } from "@/lib/cron-header-secret";
import { captureBudgetFromEnv } from "@/lib/daily-price-capture";
import { BACKFILL_SESSIONS, captureDailyCloses, HISTORY_UNAVAILABLE } from "@/lib/daily-price-history";
import { dailyPriceHistoryEnabled, listStoredCloseKeys, totalumDailyPriceStore } from "@/lib/daily-price-history.server";
import { acquireDailyPriceRunLock, releaseDailyPriceRunLock } from "@/lib/daily-price-lock.server";
import { completedSessionDates } from "@/lib/daily-price-schedule";
import { DAILY_PRICE_FEEDS } from "@/lib/daily-price-sources";
import { canReadTwelveData } from "@/lib/daily-price-twelve";
import { fetchTwelveDailyBatch } from "@/lib/daily-price-twelve.server";
import { EXCHANGES } from "@/lib/market-intel";

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
 * Stored closes come from Twelve Data only (MARKET_DATA_API_KEY). A missing key stores nothing.
 * Calls are batched and paced, indexes first, and a run stops inside the 300s cron limit.
 * A second run while one is in progress stores nothing. Yahoo Finance is not called.
 * No user-account writes.
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
  if (!canReadTwelveData() || !dailyPriceHistoryEnabled()) {
    return NextResponse.json({ ok: true, ran: false, reason: HISTORY_UNAVAILABLE, inserted: 0, skipped: [], deferred: 0, credits: 0 });
  }
  const owner = crypto.randomUUID();
  const lock = await acquireDailyPriceRunLock(owner);
  if (lock !== "acquired") {
    return NextResponse.json({
      ok: true,
      ran: false,
      reason: lock === "held" ? "already-running" : HISTORY_UNAVAILABLE,
      inserted: 0,
      skipped: [],
      deferred: 0,
      credits: 0,
    });
  }
  try {
    const now = new Date();
    const dates = new Set<string>();
    for (const market of EXCHANGES) {
      for (const date of completedSessionDates(market, now, BACKFILL_SESSIONS)) dates.add(date);
    }
    const storedKeys = await listStoredCloseKeys(dates);
    const store = totalumDailyPriceStore();
    if (!storedKeys || !store) {
      return NextResponse.json({ ok: true, ran: false, reason: HISTORY_UNAVAILABLE, inserted: 0, skipped: [], deferred: 0, credits: 0 });
    }
    const report = await captureDailyCloses({
      now,
      force,
      store,
      feeds: DAILY_PRICE_FEEDS,
      sessions: BACKFILL_SESSIONS,
      storedKeys,
      budget: captureBudgetFromEnv(),
      readBatch: async (feed, names, sessionDates) => {
        if (feed.id !== "twelve-data") return new Map(names.map((name) => [name.symbol.toUpperCase(), null]));
        return fetchTwelveDailyBatch(names, sessionDates);
      },
    });
    console.log(
      `[daily-prices] ran=${report.ran} inserted=${report.inserted} existing=${report.existing} gaps=${report.gaps} deferred=${report.deferred} credits=${report.credits}`
    );
    return NextResponse.json({ ok: true, ...report });
  } catch (err) {
    console.error("[daily-prices] capture failed:", err instanceof Error ? err.message.slice(0, 120) : "failed");
    return NextResponse.json({ ok: false, ran: false, reason: "failed" }, { status: 500 });
  } finally {
    await releaseDailyPriceRunLock(owner);
  }
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
