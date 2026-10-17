/**
 * Goal b16 G-02: stored NZX 50 and S&P 500 (in NZ$) daily closes. Data comes from
 * scripts/fetch-benchmark-history.mjs (Yahoo Finance delayed public closes) and is
 * dated by its last close. Returns use the last close on or before each date.
 */
import history from "@/data/benchmark-history.json";
import { periodStart, type IndexPoint, type PerformancePeriod } from "@/lib/performance-math";

export type BenchmarkId = "nzx50" | "sp500nzd";

export interface StoredBenchmark {
  id: BenchmarkId;
  name: string;
  asOf: string;
  source: string;
  prices: IndexPoint[];
}

type Raw = { source: string; series: Record<BenchmarkId, { name: string; asOf: string; points: [string, number][] }> };

export function storedBenchmarks(raw: Raw = history as unknown as Raw): StoredBenchmark[] {
  return (Object.keys(raw.series) as BenchmarkId[]).map((id) => ({
    id,
    name: raw.series[id].name,
    asOf: raw.series[id].asOf,
    source: raw.source,
    prices: raw.series[id].points.map(([date, level]) => ({ date, level })),
  }));
}

export function closeOnOrBefore(prices: readonly IndexPoint[], date: string): IndexPoint | null {
  let lo = 0;
  let hi = prices.length - 1;
  let best: IndexPoint | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (prices[mid].date <= date) {
      best = prices[mid];
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return best;
}

/** Price return of the index over a period ending at asOf (or the index as-of if earlier). */
export function benchmarkPeriodReturn(
  bench: Pick<StoredBenchmark, "prices">,
  period: PerformancePeriod,
  asOf: string,
  bookStart?: string | null
): { value: number | null; reason: string | null } {
  const startDate = period === "since" ? bookStart ?? null : periodStart(asOf, period);
  if (!startDate) return { value: null, reason: "No start date for this period." };
  const start = closeOnOrBefore(bench.prices, startDate);
  const end = closeOnOrBefore(bench.prices, asOf.slice(0, 10));
  if (!start || !end) return { value: null, reason: "The stored index history does not cover this period." };
  if (start.date === end.date) return { value: null, reason: "No index close since the start of this period." };
  return { value: end.level / start.level - 1, reason: null };
}
