import { NextResponse } from "next/server";
import { runTrackRecord } from "@/lib/track-record-run.server";

export const dynamic = "force-dynamic";

/**
 * Goal b19 G-20, collect only. GET /api/cron/track-record (CRON_SECRET).
 * Reads saved reports from the last 14 days (read-only), hashes every call and
 * returns this week's scorecard. Nothing is emailed or published.
 * Goal b20: later prices come from the Yahoo daily close 7 days after each
 * call, stored once found (Cache API; Totalum only with TRACK_RECORD_STORE=1).
 * Calls whose day has not closed stay "pending"; no hit rate is invented.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "Disabled: CRON_SECRET is not set." }, { status: 503 });
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  // Goal b20 CR-2: headers only; the ?key= query form leaked the secret into logs and was removed.
  if (req.headers.get("x-cron-secret") !== secret && bearer !== secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const run = await runTrackRecord();
  return NextResponse.json({
    ok: true,
    reportsRead: run.reportsRead,
    laterPrices: { fetched: run.laterPrices.fetched, reused: run.laterPrices.reused },
    // b24 SECURITY: totals and the scorecard hash only; no tickers, signals, report ids or per-call rows.
    data: {
      week: run.card.week,
      calls: run.card.calls.length,
      hits: run.card.hits,
      misses: run.card.misses,
      pending: run.card.pending,
      unscored: run.card.unscored,
      scorecardHash: run.card.scorecardHash,
      verified: run.verified.filter((v) => v.ok).length,
    },
  });
}
