import { totalumSdk } from "@/lib/totalum";
import { extractCalls, verifyCall, weeklyScorecard, type TrackCall } from "@/lib/track-record";
import { aucklandYmd } from "@/lib/entitlements";
import { laterPricesFor, TRACK_STORE_ENABLED } from "@/lib/track-record-prices.server";

/** Goal b22 G-20: one scorecard run, shared by the cron route and the test-account view. Read-only on reports. */
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

/** b26 G-20: the test view never waits more than 10 s and reuses a recent run. */
export const TRACK_RECORD_TIMEOUT_MS = 10_000;
export const TRACK_RECORD_CACHE_MS = 10 * 60_000;
type Run = Awaited<ReturnType<typeof runTrackRecord>>;
let cached: { at: number; run: Run } | null = null;
let inflight: Promise<Run> | null = null;

export function resetTrackRecordCache(): void {
  cached = null;
  inflight = null;
}

export async function runTrackRecordBounded(
  now = Date.now(),
  run: () => Promise<Run> = runTrackRecord,
  timeoutMs = TRACK_RECORD_TIMEOUT_MS
): Promise<{ run: Run; cachedAt: number | null } | { error: string }> {
  if (cached && now - cached.at < TRACK_RECORD_CACHE_MS) return { run: cached.run, cachedAt: cached.at };
  // One build at a time; a second tab waits on the same work instead of starting another.
  inflight ??= run()
    .then((r) => {
      cached = { at: Date.now(), run: r };
      return r;
    })
    .finally(() => {
      inflight = null;
    });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const r = await Promise.race([
      inflight,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`The scorecard took longer than ${Math.round(timeoutMs / 1000)} seconds. It keeps building; reload in a minute.`)), timeoutMs);
      }),
    ]);
    return { run: r, cachedAt: null };
  } catch (err) {
    console.warn("[track-record] test view:", err instanceof Error ? err.message : "error");
    return { error: err instanceof Error ? err.message.slice(0, 160) : "error" };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
