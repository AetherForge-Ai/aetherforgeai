import { totalumSdk } from "@/lib/totalum";
import { extractCalls, verifyCall, weeklyScorecard, type TrackCall } from "@/lib/track-record";
import { aucklandYmd } from "@/lib/entitlements";
import { laterPricesFor, TRACK_STORE_ENABLED } from "@/lib/track-record-prices.server";

/**
 * Goal b22 G-20: build one scorecard from saved reports. The cron calls this
 * and stores the result. The test page does not: it only reads the store.
 * Read-only on reports.
 */
export async function runTrackRecord() {
  const since = new Date(Date.now() - 14 * 86400_000).toISOString();
  const res = await totalumSdk.crud.query("report", { _limit: 500 });
  const rows = ((res?.data as unknown as Array<{ _id?: string; bot?: string; generated_at?: string; payload?: string }>) || []).filter(
    (r) => (r.generated_at || "") >= since
  );
  const calls: TrackCall[] = [];
  for (const r of rows) calls.push(...(await extractCalls(r)));
  const later = await laterPricesFor(calls);
  const card = await weeklyScorecard(aucklandYmd(), calls, later.prices);
  const verified = await Promise.all(calls.map(async (c) => ({ hash: c.hash, ok: await verifyCall(c) })));
  return {
    reportsRead: rows.length,
    calls,
    verified,
    laterPrices: { fetched: later.fetched, reused: later.reused, store: TRACK_STORE_ENABLED() ? "cache+totalum" : "cache-only" },
    card,
  };
}
