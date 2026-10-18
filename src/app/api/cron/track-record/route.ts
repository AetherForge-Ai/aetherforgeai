import { NextResponse } from "next/server";
import { totalumSdk } from "@/lib/totalum";
import { extractCalls, weeklyScorecard, type TrackCall } from "@/lib/track-record";
import { aucklandYmd } from "@/lib/entitlements";
import { laterPricesFor, TRACK_STORE_ENABLED } from "@/lib/track-record-prices.server";

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
  const url = new URL(req.url);
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  // Goal b20 CR-2: headers only; the ?key= query form leaked the secret into logs and was removed.
  if (req.headers.get("x-cron-secret") !== secret && bearer !== secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const since = new Date(Date.now() - 14 * 86400_000).toISOString();
  const res = await totalumSdk.crud.query("report", { _limit: 500 });
  const rows = ((res?.data as unknown as Array<{ _id?: string; bot?: string; generated_at?: string; payload?: string }>) || []).filter(
    (r) => (r.generated_at || "") >= since
  );
  const calls: TrackCall[] = [];
  for (const r of rows) calls.push(...(await extractCalls(r)));
  const later = await laterPricesFor(calls);
  const card = await weeklyScorecard(aucklandYmd(), calls, later.prices);
  return NextResponse.json({
    ok: true,
    reportsRead: rows.length,
    laterPrices: { fetched: later.fetched, reused: later.reused, store: TRACK_STORE_ENABLED() ? "cache+totalum" : "cache-only" },
    data: card,
  });
}
