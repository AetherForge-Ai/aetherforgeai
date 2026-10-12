/**
 * Which snapshot figures the KPI header shows.
 * Periods other than All stay blank: the snapshot has no stored starting value.
 * This module does not reprice the book.
 */

import { XIRR_ANNUALISE_AFTER_DAYS } from "@/lib/performance-math";
import type { PortfolioSnapshot, SnapshotFigure } from "@/lib/portfolio-snapshot";
import { blankSnapshotFigure } from "@/lib/snapshot-figure";

export const PERIODS = [
  { id: "1D", label: "1D", days: 1 },
  { id: "1W", label: "1W", days: 7 },
  { id: "1M", label: "1M", days: 30 },
  { id: "3M", label: "3M", days: 90 },
  { id: "YTD", label: "YTD", days: null },
  { id: "1Y", label: "1Y", days: 365 },
  { id: "3Y", label: "3Y", days: 1095 },
  { id: "all", label: "All", days: null },
  { id: "custom", label: "Custom", days: null },
] as const;

export type PeriodId = (typeof PERIODS)[number]["id"];

export const BENCHMARKS = [
  { id: "nzx50", label: "NZX 50" },
  { id: "sp500", label: "S&P 500" },
  { id: "asx200", label: "ASX 200" },
  { id: "btc", label: "BTC" },
] as const;

export type BenchmarkId = (typeof BENCHMARKS)[number]["id"];
export type PercentMode = "simple" | "annualised";

export const PERIOD_START_REASON = "The market value at the start of this period was not stored.";
export const CHART_BLANK_REASON = "No value history was stored, so the chart is blank.";

const PERIOD_IDS = new Set<string>(PERIODS.map((period) => period.id));
const BENCHMARK_IDS = new Set<string>(BENCHMARKS.map((benchmark) => benchmark.id));

export function isPeriodId(value: string | null | undefined): value is PeriodId {
  return Boolean(value && PERIOD_IDS.has(value));
}

export function isBenchmarkId(value: string | null | undefined): value is BenchmarkId {
  return Boolean(value && BENCHMARK_IDS.has(value));
}

export function benchmarkLabel(id: BenchmarkId): string {
  return BENCHMARKS.find((benchmark) => benchmark.id === id)?.label || "Benchmark";
}

export function periodSpanDays(
  period: PeriodId,
  asOfIso: string,
  custom?: { from?: string; to?: string }
): number | null {
  if (period === "all") return null;
  if (period === "custom") {
    const from = custom?.from?.slice(0, 10) || "";
    const to = custom?.to?.slice(0, 10) || "";
    if (!from || !to) return null;
    return civilDays(from, to);
  }
  if (period === "YTD") {
    const day = asOfIso.slice(0, 10);
    const year = day.slice(0, 4);
    if (!/^\d{4}$/.test(year)) return null;
    return civilDays(`${year}-01-01`, day);
  }
  return PERIODS.find((item) => item.id === period)?.days ?? null;
}

export function annualisedAvailability(
  snapshot: PortfolioSnapshot,
  period: PeriodId,
  spanDays: number | null
): { enabled: boolean; reason: string } {
  if (period === "all") {
    const stored = snapshot.kpis.annualisedPct.reason || "";
    const blocked = stored.includes("90 days");
    return {
      enabled: !blocked,
      reason: blocked
        ? stored
        : "Per year is the money-weighted return. It is offered when the period is 90 days or longer.",
    };
  }
  if (spanDays == null) {
    return { enabled: false, reason: "Choose a start and end date before per year can be offered." };
  }
  if (spanDays < 0) {
    return { enabled: false, reason: "The start date is after the end date." };
  }
  if (spanDays < XIRR_ANNUALISE_AFTER_DAYS) {
    return { enabled: false, reason: "Per year is shown only when the period is 90 days or longer." };
  }
  return {
    enabled: true,
    reason: "Per year is the money-weighted return. This period has no stored starting value, so the figure stays blank.",
  };
}

export interface KpiView {
  netWorth: SnapshotFigure;
  today: SnapshotFigure;
  todayPct: SnapshotFigure;
  totalReturn: SnapshotFigure;
  segments: Array<{ id: "capital" | "income" | "currency" | "fees"; label: string; figure: SnapshotFigure }>;
  percent: SnapshotFigure;
  percentLabel: "Simple %" | "% p.a.";
  cash: SnapshotFigure;
  contributions: SnapshotFigure;
  benchmark: SnapshotFigure;
  benchmarkName: string;
  filteredNote: string | null;
  reconciliationLabel: string;
  periodNote: string | null;
  chartReason: string;
}

export function kpiView(
  snapshot: PortfolioSnapshot,
  opts: {
    period: PeriodId;
    percentMode: PercentMode;
    benchmarkId: BenchmarkId;
    spanDays: number | null;
    annualisedEnabled: boolean;
    filteredNote?: string | null;
  }
): KpiView {
  const asOf = snapshot.asOfLabel;
  const source = snapshot.source;
  const full = opts.period === "all" && (opts.spanDays == null || opts.spanDays >= 0);
  const customInvalid = opts.period === "custom" && opts.spanDays != null && opts.spanDays < 0;
  const periodReason = customInvalid ? "The start date is after the end date." : PERIOD_START_REASON;
  const blankReturn = blankSnapshotFigure(
    "A period return needs the market value at the start, minus flows.",
    periodReason,
    source,
    asOf
  );
  const name = benchmarkLabel(opts.benchmarkId);
  const storedBenchmark = snapshot.kpis.benchmark;
  const benchmark =
    full && storedBenchmark.value != null && storedBenchmark.maths.source === name
      ? storedBenchmark
      : blankSnapshotFigure(
          "The benchmark gap is the portfolio percent minus the benchmark percent.",
          full ? `No ${name} series was stored for this snapshot.` : periodReason,
          name,
          asOf
        );
  const today = snapshot.kpis.today;
  const todayPct = blankSnapshotFigure(
    "Today's percent is today's change divided by the previous close.",
    today.reason || "Today's percent was not stored.",
    source,
    asOf
  );
  const mode = opts.percentMode === "annualised" && opts.annualisedEnabled ? "annualised" : "simple";
  const percent = full
    ? mode === "annualised"
      ? snapshot.kpis.annualisedPct
      : snapshot.kpis.simplePct
    : blankReturn;
  const contributions = full
    ? snapshot.kpis.contributions
    : blankSnapshotFigure(
        "Period contributions are deposits minus withdrawals inside the period.",
        customInvalid
          ? periodReason
          : "Contributions for this period were not stored. The full-book net contributions are on All.",
        "Ledger",
        asOf
      );

  return {
    netWorth: snapshot.kpis.netWorth,
    today,
    todayPct,
    totalReturn: full ? snapshot.kpis.totalReturn : blankReturn,
    segments: [
      { id: "capital", label: "Capital", figure: full ? snapshot.kpis.capital : blankReturn },
      { id: "income", label: "Income", figure: full ? snapshot.kpis.income : blankReturn },
      { id: "currency", label: "Currency", figure: full ? snapshot.kpis.currency : blankReturn },
      { id: "fees", label: "Fees", figure: full ? snapshot.kpis.fees : blankReturn },
    ],
    percent,
    percentLabel: mode === "annualised" ? "% p.a." : "Simple %",
    cash: snapshot.kpis.cash,
    contributions,
    benchmark,
    benchmarkName: name,
    filteredNote: opts.filteredNote || null,
    reconciliationLabel: snapshot.reconciliation.label,
    periodNote: full ? null : "Net worth and cash are the book right now. Returns for this period need a stored starting value.",
    chartReason: CHART_BLANK_REASON,
  };
}

/** Visual weights for the four snapshot segments. Null when any segment is blank. Not a money total. */
export function returnSplitWeights(segments: KpiView["segments"]): number[] | null {
  if (segments.some((segment) => segment.figure.value == null)) return null;
  const magnitudes = segments.map((segment) => Math.abs(segment.figure.value || 0));
  const sum = magnitudes.reduce((total, value) => total + value, 0);
  if (sum === 0) return magnitudes.map(() => 0);
  return magnitudes.map((value) => (value / sum) * 100);
}

export function readHeaderState(params: URLSearchParams): {
  period: PeriodId;
  from: string;
  to: string;
  percentMode: PercentMode;
  benchmarkId: BenchmarkId;
} {
  const period = params.get("period");
  const percent = params.get("pct");
  const benchmark = params.get("bench");
  return {
    period: isPeriodId(period) ? period : "all",
    from: params.get("from") || "",
    to: params.get("to") || "",
    percentMode: percent === "pa" ? "annualised" : "simple",
    benchmarkId: isBenchmarkId(benchmark) ? benchmark : "nzx50",
  };
}

export function writeHeaderState(
  params: URLSearchParams,
  state: { period: PeriodId; from: string; to: string; percentMode: PercentMode; benchmarkId: BenchmarkId }
): void {
  setParam(params, "period", state.period, "all");
  setParam(params, "from", state.period === "custom" ? state.from : "", "");
  setParam(params, "to", state.period === "custom" ? state.to : "", "");
  setParam(params, "pct", state.percentMode === "annualised" ? "pa" : "simple", "simple");
  setParam(params, "bench", state.benchmarkId, "nzx50");
}

function setParam(params: URLSearchParams, key: string, value: string, fallback: string): void {
  if (!value || value === fallback) params.delete(key);
  else params.set(key, value);
}

function civilDays(start: string, end: string): number | null {
  const a = Date.parse(`${start.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${end.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
}
