import { NextResponse } from "next/server";
import { runTrackRecord } from "@/lib/track-record-run.server";
import { persistTrackRun, readTrackRunLog } from "@/lib/track-record-store.server";
import { slotAlreadyBuilt, trackSlotKey } from "@/lib/track-record-slot";
import { withKeyLock } from "@/lib/idem-guard";

export const dynamic = "force-dynamic";

/**
 * Goal b19 G-20, collect only. GET /api/cron/track-record (CRON_SECRET).
 * Reads saved reports from the last 14 days (read-only), hashes every call and
 * stores this week's scorecard and its hash, and returns the totals.
 * Nothing is emailed. The test page reads the stored card. It is not published.
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
  // b53: slot-time idempotency key. A second run in the same 6-hour UTC slot (e.g. cron-fallback
  // dispatching a slot cron.yml already ran) is a no-op; the stored run log is the durable record.
  const slot = trackSlotKey(Date.now());
  return withKeyLock(`track-record:${slot}`, async () => {
  if (slotAlreadyBuilt(await readTrackRunLog(), Date.now())) {
    console.log(`[track-record] slot ${slot} already built; no-op`);
    return NextResponse.json({ ok: true, stored: false, duplicate: true, slot });
  }
  const started = Date.now();
  const run = await runTrackRecord();
  // b36 G-20: this card was built by the schedule (cron.yml); the duration is the build time.
  const stored = await persistTrackRun(run, undefined, undefined, { builtBy: "schedule", durationMs: Date.now() - started });
  // b24 SECURITY: totals and the scorecard hash only; no tickers, signals, report ids or per-call rows.
  const data = {
    week: run.card.week,
    calls: run.card.calls.length,
    hits: run.card.hits,
    misses: run.card.misses,
    pending: run.card.pending,
    unscored: run.card.unscored,
    scorecardHash: run.card.scorecardHash,
    verified: run.verified.filter((v) => v.ok).length,
  };
  if (stored.ok === false) {
    console.warn("[track-record] cron store:", stored.error);
    return NextResponse.json({ ok: false, stored: false, error: stored.error, reportsRead: run.reportsRead, laterPrices: { fetched: run.laterPrices.fetched, reused: run.laterPrices.reused }, data }, { status: 500 });
  }
  console.log(`[track-record] stored week=${data.week} calls=${data.calls} hits=${data.hits} misses=${data.misses} pending=${data.pending}`);
  return NextResponse.json({
    ok: true,
    stored: true,
    reportsRead: run.reportsRead,
    laterPrices: { fetched: run.laterPrices.fetched, reused: run.laterPrices.reused },
    data,
  });
  });
}
