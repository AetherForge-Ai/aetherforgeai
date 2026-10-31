/** b95: GATE-1 release gate, M-7 one text green, G-02 per-period maths vs independent calculations, G-09 CSV lock, CLS feed-note slot. pull-check:v3-b95-2026-11-01 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { performanceReport, type BookPoint, type PerformanceInput, type PerformancePeriod } from "@/lib/performance-math";
import { BENCHMARKS } from "@/lib/performance-book";
import { CSV_LOCK_LABEL } from "@/lib/csv-lock-label";

const read = (p: string) => readFileSync(p, "utf8");

describe("b95 pins", () => {
  it("pins the build", () => {
    expect(read("public/build-version.txt").trim()).toBe("v3-b95-2026-11-01");
    expect(read("qa/PULL-CHECK-2026-10-12.md")).toContain("pull-check:v3-b95-2026-11-01");
  });
  it("GATE-1 runs repo-side in the unit job and is documented", () => {
    expect(read("src/lib/must-fix/release-gate.test.ts")).toContain("checkReleaseGate(repo)");
    expect(read("goal-loop/README.md")).toContain("P0: 0");
  });
});

// ---- Independent maths (written separately from performance-math.ts) ----
const DAY = 86400000;
const t = (d: string) => Date.parse(`${d}T00:00:00Z`);
function bisectXirr(flows: { date: string; amt: number }[]): number {
  const f0 = t(flows[0].date);
  const npv = (r: number) => flows.reduce((s, f) => s + f.amt / (1 + r) ** ((t(f.date) - f0) / DAY / 365), 0);
  let lo = -0.99, hi = 10_000;
  for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (npv(lo) * npv(mid) <= 0) hi = mid; else lo = mid; }
  return (lo + hi) / 2;
}
function startOf(asOf: string, p: PerformancePeriod): string | null {
  if (p === "since") return null;
  if (p === "YTD") return `${asOf.slice(0, 4)}-01-01`;
  const [y, m, d] = asOf.split("-").map(Number);
  const months = p === "1M" ? 1 : p === "3M" ? 3 : 12;
  const dt = new Date(Date.UTC(y, m - 1 - months, d));
  return dt.toISOString().slice(0, 10);
}
function independent(input: PerformanceInput, p: PerformancePeriod) {
  const pts = [...input.points].sort((a, b) => a.date.localeCompare(b.date));
  const start = startOf(input.asOf, p);
  let slice: BookPoint[] = pts;
  if (start) {
    const prior = pts.filter((x) => x.date <= start).at(-1)!;
    const later = pts.filter((x) => x.date > start);
    const on = pts.find((x) => x.date === start);
    const open = on ? on.valueBeforeNzd + on.flowNzd : prior.valueBeforeNzd + prior.flowNzd;
    slice = [{ date: start, valueBeforeNzd: open, flowNzd: 0 }, ...later];
  }
  // TWR: chain each sub-period's growth.
  let g = 1;
  slice.forEach((x, i) => { const s = x.valueBeforeNzd + x.flowNzd; const e = i + 1 < slice.length ? slice[i + 1].valueBeforeNzd : input.endingNzd!; if (s > 0) g *= e / s; });
  // XIRR: start value (if any) counts as money in, then each flow, then the ending value out.
  const flows = slice.map((x, i) => ({ date: x.date, amt: -(i === 0 && start ? x.valueBeforeNzd : x.flowNzd) }))
    .filter((f) => f.amt !== 0);
  flows.push({ date: input.asOf, amt: input.endingNzd! });
  const annual = bisectXirr(flows);
  const days = (t(input.asOf) - t(slice[0].date)) / DAY;
  return { twr: g - 1, xirr: days < 90 ? (1 + annual) ** (days / 365) - 1 : annual };
}
const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(1e-9, Math.abs(b) * 0.0001);

describe("b95 G-02 performance maths, every period, against independent calculations (0.01%)", () => {
  const golden = JSON.parse(read("src/lib/fixtures/performance-golden.json")) as PerformanceInput;
  it("20-trade golden file: XIRR and TWR for 1M, 3M, YTD, 1Y and since start", () => {
    expect(golden.points).toHaveLength(20);
    const r = performanceReport(golden);
    for (const p of ["1M", "3M", "YTD", "1Y", "since"] as PerformancePeriod[]) {
      const want = independent(golden, p);
      const got = r.periods[p];
      expect(got.xirr.value, `${p} xirr`).not.toBeNull();
      expect(close(got.xirr.value!, want.xirr), `${p} xirr ${got.xirr.value} vs ${want.xirr}`).toBe(true);
      expect(close(got.twr.value!, want.twr), `${p} twr ${got.twr.value} vs ${want.twr}`).toBe(true);
      for (const f of [got.xirr, got.twr]) { expect(f.asOf).toBe(golden.asOf); expect(f.source.length).toBeGreaterThan(0); }
    }
  });
  it("benchmark XIRR equals buying index units with each deposit (NZX 50 and S&P 500 rows exist)", () => {
    expect(BENCHMARKS.map((b) => b.name)).toEqual(["NZX 50", "S&P 500 (in NZ$)"]);
    const input: PerformanceInput = {
      asOf: "2026-04-01", endingNzd: 17600, source: "Example series",
      points: [{ date: "2025-04-01", valueBeforeNzd: 0, flowNzd: 10000 }, { date: "2025-10-01", valueBeforeNzd: 11000, flowNzd: 5000 }],
      benchmark: { name: "Example index", source: "Example series, delayed public data", prices: [{ date: "2025-04-01", level: 1000 }, { date: "2025-10-01", level: 1100 }, { date: "2026-04-01", level: 1210 }] },
    };
    const r = performanceReport(input);
    const units = 10000 / 1000 + 5000 / 1100;
    const want = bisectXirr([{ date: "2025-04-01", amt: -10000 }, { date: "2025-10-01", amt: -5000 }, { date: "2026-04-01", amt: units * 1210 }]);
    expect(close(r.benchmark!.value!, want)).toBe(true);
    expect(r.benchmark!.asOf).toBe("2026-04-01");
    expect(r.benchmark!.source).toMatch(/delayed/);
  });
  it("empty and one-trade books give reasons, never invented numbers", () => {
    const empty = performanceReport({ points: [], endingNzd: 0, asOf: "2026-04-01", source: "Paper cash balance" });
    for (const p of ["1M", "3M", "YTD", "1Y", "since"] as PerformancePeriod[]) {
      expect(empty.periods[p].xirr.value).toBeNull();
      expect(empty.periods[p].xirr.reason).toBeTruthy();
    }
    const one = performanceReport({ points: [{ date: "2026-03-01", valueBeforeNzd: 0, flowNzd: 1000 }], endingNzd: 1010, asOf: "2026-04-01", source: "Paper cash balance" });
    expect(one.periods["1Y"].xirr.value).toBeNull();
    expect(one.periods["1Y"].xirr.reason).toBeTruthy();
    expect(close(one.twr.value!, 0.01)).toBe(true);
    expect(one.xirr.annualised).toBe(false);
    expect(close(one.xirr.value!, 0.01)).toBe(true);
  });
});

describe("b95 M-7 one text green", () => {
  it("ticker and the dashboard 'No urgent exits' card use the text-gain token, not raw emerald text", () => {
    for (const f of ["src/components/MarketTicker.tsx", "src/components/dashboard/ActionableIntelligence.tsx"]) {
      expect(read(f)).not.toMatch(/text-emerald-(200|300|400)\b/);
    }
    expect(read("src/app/globals.css")).toContain("--color-gain: var(--text-green)");
  });
});

describe("b95 G-09 CSV lock wording", () => {
  it("every locked CSV control carries the exact label", () => {
    expect(CSV_LOCK_LABEL).toBe("CSV export: Starter and above");
    for (const f of ["src/components/tax/CsvExportButton.tsx", "src/components/dashboard/PortfolioDashboard.tsx", "src/components/dashboard/TransactionCenter.tsx", "src/components/tax/TaxPageContent.tsx"]) {
      expect(read(f), f).toMatch(/CSV_LOCK_LABEL|CSV export: Starter and above/);
    }
  });
});

describe("b95 CLS: the ticker feed note keeps a fixed one-line slot", () => {
  it("renders the slot whether or not a feed is amber", () => {
    const s = read("src/components/MarketTicker.tsx");
    expect(s).toContain('data-feed-note className="h-[1.625rem] truncate');
    expect(s).not.toMatch(/loaded && feedBadge\.tone !== "green" \? \(\s*<p/);
  });
});
