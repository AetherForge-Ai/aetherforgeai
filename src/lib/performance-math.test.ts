import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  cashBookPoints,
  externalFlowsFromLedger,
  performanceReport,
  solveXirr,
  xirrNpv,
  type PerformanceInput,
  type SolverFlow,
} from "@/lib/performance-math";

function independentXirr(flows: SolverFlow[]): number | null {
  const ordered = [...flows].sort((a, b) => a.date.localeCompare(b.date));
  const npv = (rate: number) => {
    const first = Date.parse(`${ordered[0].date}T00:00:00Z`);
    let total = 0;
    for (const flow of ordered) {
      const days = (Date.parse(`${flow.date}T00:00:00Z`) - first) / 86400000;
      total += flow.amountNzd / (1 + rate) ** (days / 365);
    }
    return total;
  };
  let low = -0.9;
  let high = 5;
  if (npv(low) * npv(high) > 0) return null;
  for (let i = 0; i < 80; i++) {
    const mid = (low + high) / 2;
    if (npv(low) * npv(mid) <= 0) high = mid;
    else low = mid;
  }
  return (low + high) / 2;
}

describe("B2-2 performance maths", () => {
  it("matches an independent solver on 20 example transactions within 0.01%", () => {
    const golden = JSON.parse(
      readFileSync(path.join(process.cwd(), "src/lib/fixtures/performance-golden.json"), "utf8")
    ) as PerformanceInput & { label: string };
    expect(golden.label).toMatch(/Example/);
    expect(golden.points).toHaveLength(20);
    const report = performanceReport(golden);
    expect(report.xirr.asOf).toBe("2025-09-01");
    expect(report.xirr.source).toBe("Example series");
    expect(report.twr.value).toBeCloseTo(0.25, 10);
    expect(report.xirr.value).not.toBeNull();

    const flows: SolverFlow[] = golden.points.map((point) => ({
      date: point.date,
      amountNzd: -point.flowNzd,
    }));
    flows.push({ date: golden.asOf, amountNzd: golden.endingNzd || 0 });
    const other = independentXirr(flows);
    expect(other).not.toBeNull();
    const solved = report.xirr.value || 0;
    expect(Math.abs(solved - (other || 0)) / Math.abs(other || 1)).toBeLessThan(0.0001);
    expect(Math.abs(xirrNpv(flows, solved))).toBeLessThan(0.01);
    expect(report.benchmark?.source).toMatch(/delayed/);
    expect(report.benchmark?.value).not.toBeNull();
    expect(report.periods.since.xirr.value).toBeCloseTo(solved, 10);
    expect(report.periods["1Y"].twr.value).not.toBeNull();
    expect(report.periods.YTD.xirr.asOf).toBe(golden.asOf);
  });

  it("links two 10% periods to a 21% time-weighted return", () => {
    const report = performanceReport({
      asOf: "2026-04-01",
      endingNzd: 17600,
      source: "Example series",
      points: [
        { date: "2025-04-01", valueBeforeNzd: 0, flowNzd: 10000 },
        { date: "2025-10-01", valueBeforeNzd: 11000, flowNzd: 5000 },
      ],
      benchmark: {
        name: "Example index",
        source: "Example series, delayed public data, not a direct NZX or ASX feed",
        prices: [
          { date: "2025-04-01", level: 1000 },
          { date: "2025-10-01", level: 1100 },
          { date: "2026-04-01", level: 1210 },
        ],
      },
    });
    expect(report.twr.value).toBeCloseTo(0.21, 10);
    expect(report.xirr.value).not.toBeNull();
    expect(Math.abs(xirrNpv(
      [
        { date: "2025-04-01", amountNzd: -10000 },
        { date: "2025-10-01", amountNzd: -5000 },
        { date: "2026-04-01", amountNzd: 17600 },
      ],
      report.xirr.value || 0
    ))).toBeLessThan(0.01);
    expect(report.benchmark?.value).not.toBeNull();
    expect(report.xirr.asOf).toBe("2026-04-01");
    expect(report.twr.source).toBe("Example series");
  });

  it("handles an empty book and a single deposit", () => {
    const empty = performanceReport({
      points: [],
      endingNzd: null,
      asOf: "2026-04-01",
      source: "Paper cash balance",
    });
    expect(empty.xirr.value).toBeNull();
    expect(empty.twr.value).toBeNull();
    expect(empty.xirr.reason).toBeTruthy();

    const single = performanceReport({
      points: [{ date: "2026-04-01", valueBeforeNzd: 0, flowNzd: 500 }],
      endingNzd: 500,
      asOf: "2026-04-02",
      source: "Paper cash balance",
    });
    expect(single.xirr.value).toBeCloseTo(0, 6);
    expect(single.twr.value).toBeCloseTo(0, 10);
    expect(solveXirr([{ date: "2026-04-01", amountNzd: -500 }])).toBeNull();
  });

  it("builds a cash-only book from deposits and refuses a balance that does not match", () => {
    const flows = externalFlowsFromLedger([
      { type: "buy", cash_nzd: -50, executed_at: "2026-01-02" },
      { type: "deposit", cash_nzd: 100, trade_date: "2026-01-01" },
      { type: "withdraw", cash_nzd: -40, executed_at: "2026-02-01" },
    ]);
    expect(flows).toEqual([
      { date: "2026-01-01", amountNzd: 100 },
      { date: "2026-02-01", amountNzd: -40 },
    ]);
    expect(cashBookPoints(flows, 60)?.endingNzd).toBe(60);
    expect(cashBookPoints(flows, 10)).toBeNull();
  });
});
