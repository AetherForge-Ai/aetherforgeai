/**
 * Money-weighted return (XIRR), time-weighted return, and a deposit-dated benchmark.
 * Amounts are NZ$. The caller supplies valuations and any index series.
 * A missing valuation is left blank. No price is invented.
 *
 * XIRR uses a 365-day year, the same day count as a spreadsheet XIRR.
 * Time-weighted return links the change in value between external cash flows.
 *
 * pull-check:batch2-2026-10-11 B2-2
 */

import { roundMoney } from "@/lib/currency";

export type PerformancePeriod = "1M" | "3M" | "YTD" | "1Y" | "since";

export interface BookPoint {
  date: string;
  /** Market value in NZ$ before the external cash flow on this date. */
  valueBeforeNzd: number;
  /** Money added to the book. A withdrawal is negative. */
  flowNzd: number;
}

export interface IndexPoint {
  date: string;
  /** Index level. Not a currency amount. */
  level: number;
}

export interface PerformanceFigure {
  /** Decimal return. 0.1 is 10%. Null when it cannot be computed. */
  value: number | null;
  reason: string | null;
  asOf: string;
  source: string;
}

export interface PerformanceReport {
  asOf: string;
  source: string;
  xirr: PerformanceFigure;
  twr: PerformanceFigure;
  benchmark: PerformanceFigure | null;
  periods: Record<PerformancePeriod, { xirr: PerformanceFigure; twr: PerformanceFigure }>;
}

export interface PerformanceInput {
  points: BookPoint[];
  endingNzd: number | null;
  asOf: string;
  source: string;
  benchmark?: {
    name: string;
    source: string;
    prices: IndexPoint[];
  };
}

const PERIODS: PerformancePeriod[] = ["1M", "3M", "YTD", "1Y", "since"];

function utcDay(iso: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return NaN;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function isoFromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function periodStart(asOf: string, period: PerformancePeriod): string | null {
  const start = utcDay(asOf);
  if (!Number.isFinite(start)) return null;
  if (period === "since") return null;
  if (period === "YTD") return `${asOf.slice(0, 4)}-01-01`;
  const date = new Date(start);
  if (period === "1M") date.setUTCMonth(date.getUTCMonth() - 1);
  if (period === "3M") date.setUTCMonth(date.getUTCMonth() - 3);
  if (period === "1Y") date.setUTCFullYear(date.getUTCFullYear() - 1);
  return isoFromUtc(date.getTime());
}

function yearFraction(from: string, to: string): number {
  return (utcDay(to) - utcDay(from)) / (365 * 86400000);
}

export interface SolverFlow {
  date: string;
  /** Spreadsheet sign: money into the book is negative, money out is positive. */
  amountNzd: number;
}

/** Net present value of spreadsheet-signed flows at a decimal rate. */
export function xirrNpv(flows: SolverFlow[], rate: number): number {
  if (!(rate > -1)) return Number.NaN;
  const first = flows[0]?.date;
  if (!first) return Number.NaN;
  let total = 0;
  for (const flow of flows) {
    const t = yearFraction(first, flow.date);
    total += flow.amountNzd / (1 + rate) ** t;
  }
  return total;
}

/**
 * Money-weighted return. Null when the flows do not change sign or the
 * solver does not settle. Newton, then bisection.
 */
export function solveXirr(flows: SolverFlow[]): number | null {
  const usable = flows.filter((flow) => flow.amountNzd !== 0 && Number.isFinite(utcDay(flow.date)));
  if (usable.length < 2) return null;
  const ordered = [...usable].sort((a, b) => a.date.localeCompare(b.date));
  const hasIn = ordered.some((flow) => flow.amountNzd < 0);
  const hasOut = ordered.some((flow) => flow.amountNzd > 0);
  if (!hasIn || !hasOut) return null;

  const npv = (rate: number) => xirrNpv(ordered, rate);
  let rate = 0.1;
  for (let i = 0; i < 50; i++) {
    const value = npv(rate);
    if (!Number.isFinite(value)) break;
    if (Math.abs(value) < 1e-7) return rate;
    let slope = 0;
    const first = ordered[0].date;
    for (const flow of ordered) {
      const t = yearFraction(first, flow.date);
      slope += (-t * flow.amountNzd) / (1 + rate) ** (t + 1);
    }
    if (!Number.isFinite(slope) || slope === 0) break;
    const next = rate - value / slope;
    if (!(next > -0.9 && next < 10) || !Number.isFinite(next)) break;
    if (Math.abs(next - rate) < 1e-12) return next;
    rate = next;
  }

  const guesses = [-0.9, -0.5, -0.2, 0, 0.1, 0.25, 0.5, 1, 2, 5, 10];
  let low = Number.NaN;
  let high = Number.NaN;
  let lowNpv = Number.NaN;
  for (let i = 0; i < guesses.length - 1; i++) {
    const left = npv(guesses[i]);
    const right = npv(guesses[i + 1]);
    if (Number.isFinite(left) && Number.isFinite(right) && left * right <= 0) {
      low = guesses[i];
      high = guesses[i + 1];
      lowNpv = left;
      break;
    }
  }
  if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
  for (let i = 0; i < 80; i++) {
    const mid = (low + high) / 2;
    const midNpv = npv(mid);
    if (!Number.isFinite(midNpv) || Math.abs(midNpv) < 1e-8) return mid;
    if (lowNpv * midNpv <= 0) {
      high = mid;
    } else {
      low = mid;
      lowNpv = midNpv;
    }
  }
  return (low + high) / 2;
}

function figure(value: number | null, reason: string | null, asOf: string, source: string): PerformanceFigure {
  return { value, reason, asOf, source };
}

function spreadsheetFlows(points: BookPoint[], endingNzd: number, asOf: string): SolverFlow[] {
  const flows: SolverFlow[] = points
    .filter((point) => point.flowNzd !== 0)
    .map((point) => ({ date: point.date, amountNzd: roundMoney(-point.flowNzd) }));
  flows.push({ date: asOf, amountNzd: roundMoney(endingNzd) });
  return flows;
}

export function timeWeightedReturn(points: BookPoint[], endingNzd: number, asOf: string): number | null {
  const ordered = [...points].sort((a, b) => a.date.localeCompare(b.date));
  if (!ordered.length || !(endingNzd >= 0) || !Number.isFinite(utcDay(asOf))) return null;
  let growth = 1;
  let linked = false;
  for (let i = 0; i < ordered.length; i++) {
    const start = roundMoney(ordered[i].valueBeforeNzd + ordered[i].flowNzd);
    const end = i + 1 < ordered.length ? ordered[i + 1].valueBeforeNzd : endingNzd;
    if (!(start > 0) || !(end >= 0)) continue;
    growth *= end / start;
    linked = true;
  }
  if (!linked) return null;
  return growth - 1;
}

function blankPeriods(asOf: string, source: string, reason: string): PerformanceReport["periods"] {
  return {
    "1M": { xirr: figure(null, reason, asOf, source), twr: figure(null, reason, asOf, source) },
    "3M": { xirr: figure(null, reason, asOf, source), twr: figure(null, reason, asOf, source) },
    YTD: { xirr: figure(null, reason, asOf, source), twr: figure(null, reason, asOf, source) },
    "1Y": { xirr: figure(null, reason, asOf, source), twr: figure(null, reason, asOf, source) },
    since: { xirr: figure(null, reason, asOf, source), twr: figure(null, reason, asOf, source) },
  };
}

function sliceForPeriod(input: PerformanceInput, period: PerformancePeriod): PerformanceInput | null {
  if (period === "since") return input;
  const start = periodStart(input.asOf, period);
  if (!start || input.endingNzd == null) return null;
  const ordered = [...input.points].sort((a, b) => a.date.localeCompare(b.date));
  const prior = [...ordered].reverse().find((point) => point.date <= start);
  if (!prior) return null;
  const later = ordered.filter((point) => point.date > start);
  const startValue = roundMoney(prior.valueBeforeNzd + prior.flowNzd);
  const onStart = ordered.find((point) => point.date === start);
  const points: BookPoint[] = onStart
    ? [onStart, ...later.filter((point) => point.date !== start)]
    : [{ date: start, valueBeforeNzd: startValue, flowNzd: 0 }, ...later];
  return { ...input, points };
}

export function benchmarkXirr(input: PerformanceInput): number | null {
  const series = input.benchmark;
  if (!series || input.endingNzd == null) return null;
  const priceOn = (date: string) => {
    const hits = series.prices.filter((point) => point.date <= date && point.level > 0);
    if (!hits.length) return null;
    return hits.sort((a, b) => a.date.localeCompare(b.date)).at(-1)?.level ?? null;
  };
  let units = 0;
  const flows: SolverFlow[] = [];
  for (const point of [...input.points].sort((a, b) => a.date.localeCompare(b.date))) {
    if (point.flowNzd === 0) continue;
    const level = priceOn(point.date);
    if (level == null) return null;
    units += point.flowNzd / level;
    flows.push({ date: point.date, amountNzd: roundMoney(-point.flowNzd) });
  }
  const endLevel = priceOn(input.asOf);
  if (endLevel == null || !(units !== 0)) return null;
  flows.push({ date: input.asOf, amountNzd: roundMoney(units * endLevel) });
  return solveXirr(flows);
}

export function performanceReport(input: PerformanceInput): PerformanceReport {
  const asOf = input.asOf;
  const source = input.source;
  const missing = "A valuation with a source and an as-of date is required.";
  if (!Number.isFinite(utcDay(asOf)) || input.endingNzd == null || !(input.endingNzd >= 0)) {
    return {
      asOf,
      source,
      xirr: figure(null, missing, asOf, source),
      twr: figure(null, missing, asOf, source),
      benchmark: input.benchmark ? figure(null, missing, asOf, input.benchmark.source) : null,
      periods: blankPeriods(asOf, source, missing),
    };
  }
  if (!input.points.length) {
    const reason = "This book has no deposit or withdrawal to measure.";
    return {
      asOf,
      source,
      xirr: figure(null, reason, asOf, source),
      twr: figure(null, reason, asOf, source),
      benchmark: input.benchmark ? figure(null, reason, asOf, input.benchmark.source) : null,
      periods: blankPeriods(asOf, source, reason),
    };
  }

  const flows = spreadsheetFlows(input.points, input.endingNzd, asOf);
  const xirr = solveXirr(flows);
  const twr = timeWeightedReturn(input.points, input.endingNzd, asOf);
  const xirrReason = xirr == null ? "The money-weighted return did not settle." : null;
  const twrReason = twr == null ? "The time-weighted return needs a starting value above zero." : null;
  const bench = input.benchmark ? benchmarkXirr(input) : null;
  const benchReason =
    input.benchmark && bench == null ? "The benchmark needs a public price on each deposit date and on the as-of date." : null;

  const periods = {} as PerformanceReport["periods"];
  for (const period of PERIODS) {
    const slice = sliceForPeriod(input, period);
    if (!slice || slice.endingNzd == null) {
      periods[period] = {
        xirr: figure(null, "No valuation at the start of this period.", asOf, source),
        twr: figure(null, "No valuation at the start of this period.", asOf, source),
      };
      continue;
    }
    const periodFlows = spreadsheetFlows(slice.points, slice.endingNzd, asOf);
    const periodXirr = solveXirr(periodFlows);
    const periodTwr = timeWeightedReturn(slice.points, slice.endingNzd, asOf);
    periods[period] = {
      xirr: figure(periodXirr, periodXirr == null ? "The money-weighted return did not settle." : null, asOf, source),
      twr: figure(periodTwr, periodTwr == null ? "The time-weighted return needs a starting value above zero." : null, asOf, source),
    };
  }

  return {
    asOf,
    source,
    xirr: figure(xirr, xirrReason, asOf, source),
    twr: figure(twr, twrReason, asOf, source),
    benchmark: input.benchmark ? figure(bench, benchReason, asOf, input.benchmark.source) : null,
    periods,
  };
}

export interface LedgerCashRow {
  type?: string | null;
  executed_at?: string | null;
  trade_date?: string | null;
  cash_nzd?: number | null;
  total?: number | null;
}

/** Deposits and withdrawals only. Buys, sells and dividends stay inside the book. */
export function externalFlowsFromLedger(rows: LedgerCashRow[]): { date: string; amountNzd: number }[] {
  const flows: { date: string; amountNzd: number }[] = [];
  for (const row of rows) {
    const type = String(row.type || "").toLowerCase();
    if (type !== "deposit" && type !== "withdraw") continue;
    const date = String(row.trade_date || row.executed_at || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const signed = Number(row.cash_nzd ?? row.total);
    if (!Number.isFinite(signed) || signed === 0) continue;
    const amount = type === "deposit" ? Math.abs(signed) : -Math.abs(signed);
    flows.push({ date, amountNzd: roundMoney(amount) });
  }
  return flows.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Rebuild value-before for a cash-only book that started at zero.
 * Returns null when the cash balance does not equal net deposits minus withdrawals.
 */
export function cashBookPoints(
  flows: { date: string; amountNzd: number }[],
  cashNzd: number
): { points: BookPoint[]; endingNzd: number } | null {
  let running = 0;
  const points: BookPoint[] = [];
  for (const flow of flows) {
    points.push({ date: flow.date, valueBeforeNzd: roundMoney(running), flowNzd: flow.amountNzd });
    running = roundMoney(running + flow.amountNzd);
  }
  if (roundMoney(running) !== roundMoney(cashNzd)) return null;
  return { points, endingNzd: roundMoney(cashNzd) };
}
