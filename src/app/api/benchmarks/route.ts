import { NextResponse } from "next/server";
import { alignedAsOf, benchmarkPeriodReturn, storedBenchmarks } from "@/lib/benchmark-history";
import type { PerformancePeriod } from "@/lib/performance-math";

const PERIODS: PerformancePeriod[] = ["1M", "3M", "YTD", "1Y", "since"];
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Goal b16 G-02: benchmark period returns from stored delayed public closes. Public data only. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const asOf = String(url.searchParams.get("asOf") || "").slice(0, 10);
  const start = String(url.searchParams.get("start") || "").slice(0, 10);
  if (asOf && !DAY.test(asOf)) return NextResponse.json({ error: "asOf must be YYYY-MM-DD" }, { status: 400 });
  // Goal b18 G-02: asOf defaults to the latest close, and every period ends on the
  // last close on or before the requested day, so 1M/3M/YTD/1Y line up with it.
  const benchmarks = storedBenchmarks().map((b) => {
    const close = alignedAsOf(b, asOf || null);
    return {
      id: b.id,
      name: b.name,
      asOf: close,
      requestedAsOf: asOf || null,
      source: b.source,
      periods: Object.fromEntries(PERIODS.map((p) => [p, benchmarkPeriodReturn(b, p, close, DAY.test(start) ? start : null)])),
    };
  });
  return NextResponse.json({ benchmarks }, { headers: { "cache-control": "public, max-age=3600" } });
}
