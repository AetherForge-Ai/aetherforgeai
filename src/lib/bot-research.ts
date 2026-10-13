import { analyzeSecurity, type MarketCode } from "@/lib/market-intel";
import { oneWayCostPct, type DailyBar } from "@/lib/bot-eval";

/**
 * Monthly and weekly research study.
 *
 * The rules, the 18-trial count, and the ship bar below were written before
 * the held-out numbers were read. A rule ships only when the validation
 * window selects it, its deflated Sharpe clears 0.95, and the held-out
 * window beats both buy-and-hold and the current score rule. Koins still
 * ships nothing into the live bot from this file: SHIPPED_RESEARCH stays
 * null unless that bar is met, and a Koins winner would still sit behind
 * KOINS_MODEL_V2.
 */

export const HELD_OUT_FROM = "2024-10-24";
export const TRIALS_PER_BOOK = 18;
export const TARGET_VOL = 0.1;
export const SHIP_RULE = {
  minValidationReturns: 12,
  minTestReturns: 8,
  minDeflatedSharpe: 0.95,
  maxDrawdownSlack: 0.1,
  sharpeMatchSlack: 0.05,
  drawdownImprovement: 0.05,
} as const;

/** Null until a book clears SHIP_RULE on the held-out window. */
export const SHIPPED_RESEARCH: { stox: string | null; koins: string | null } = {
  stox: null,
  koins: null,
};

const ETF_SYMBOLS = new Set([
  "SPY", "QQQ", "IWM", "EWA", "ENZL",
  "XLK", "XLF", "XLE", "XLV", "XLY", "XLP", "XLI", "XLB", "XLRE", "XLU", "XLC",
]);

const EULER = 0.5772156649015329;

export type Snap = {
  symbol: string;
  market: MarketCode;
  price: number;
  r5: number | null;
  r21: number | null;
  r63: number | null;
  r252: number | null;
  r121: number | null;
  vol63: number | null;
  vol252: number | null;
};

type Field = "r5" | "r21" | "r63" | "r252" | "r121" | "vol63" | "vol252";
type Step = 5 | 21;

export type ResearchStrategy = {
  id: string;
  family: string;
  lookback: string;
  rebalance: "weekly" | "monthly";
  step: Step;
  kind: "tsmom" | "high" | "low";
  field: Field;
};

export const RESEARCH_STRATEGIES: ResearchStrategy[] = [
  { id: "tsmom-21-w", family: "Time-series momentum", lookback: "1 month", rebalance: "weekly", step: 5, kind: "tsmom", field: "r21" },
  { id: "tsmom-63-w", family: "Time-series momentum", lookback: "3 months", rebalance: "weekly", step: 5, kind: "tsmom", field: "r63" },
  { id: "tsmom-252-w", family: "Time-series momentum", lookback: "12 months", rebalance: "weekly", step: 5, kind: "tsmom", field: "r252" },
  { id: "tsmom-21-m", family: "Time-series momentum", lookback: "1 month", rebalance: "monthly", step: 21, kind: "tsmom", field: "r21" },
  { id: "tsmom-63-m", family: "Time-series momentum", lookback: "3 months", rebalance: "monthly", step: 21, kind: "tsmom", field: "r63" },
  { id: "tsmom-252-m", family: "Time-series momentum", lookback: "12 months", rebalance: "monthly", step: 21, kind: "tsmom", field: "r252" },
  { id: "csmom-21-w", family: "Cross-sectional momentum", lookback: "1 month", rebalance: "weekly", step: 5, kind: "high", field: "r21" },
  { id: "csmom-63-w", family: "Cross-sectional momentum", lookback: "3 months", rebalance: "weekly", step: 5, kind: "high", field: "r63" },
  { id: "csmom-12-1-w", family: "Cross-sectional momentum", lookback: "12-1 months", rebalance: "weekly", step: 5, kind: "high", field: "r121" },
  { id: "csmom-21-m", family: "Cross-sectional momentum", lookback: "1 month", rebalance: "monthly", step: 21, kind: "high", field: "r21" },
  { id: "csmom-63-m", family: "Cross-sectional momentum", lookback: "3 months", rebalance: "monthly", step: 21, kind: "high", field: "r63" },
  { id: "csmom-12-1-m", family: "Cross-sectional momentum", lookback: "12-1 months", rebalance: "monthly", step: 21, kind: "high", field: "r121" },
  { id: "lowvol-63-w", family: "Low volatility", lookback: "3-month vol", rebalance: "weekly", step: 5, kind: "low", field: "vol63" },
  { id: "lowvol-252-w", family: "Low volatility", lookback: "12-month vol", rebalance: "weekly", step: 5, kind: "low", field: "vol252" },
  { id: "lowvol-63-m", family: "Low volatility", lookback: "3-month vol", rebalance: "monthly", step: 21, kind: "low", field: "vol63" },
  { id: "lowvol-252-m", family: "Low volatility", lookback: "12-month vol", rebalance: "monthly", step: 21, kind: "low", field: "vol252" },
  { id: "reversal-5-w", family: "Short-term reversal", lookback: "1 week", rebalance: "weekly", step: 5, kind: "low", field: "r5" },
  { id: "reversal-21-m", family: "Short-term reversal", lookback: "1 month", rebalance: "monthly", step: 21, kind: "low", field: "r21" },
];

export type Perf = {
  n: number;
  annualizedReturn: number | null;
  annualizedVol: number | null;
  sharpe: number | null;
  sortino: number | null;
  maxDrawdown: number | null;
  totalReturn: number | null;
  avgExposure: number | null;
  avgTurnover: number | null;
  deflatedSharpe: number | null;
};

export type WindowPair = { validation: Perf; test: Perf };

export type StrategyEval = ResearchStrategy & WindowPair & { selected: boolean; drawdownSaver: boolean };

export type BookResult = {
  id: "stox" | "koins";
  label: string;
  symbols: number;
  rejected: string[];
  strategies: StrategyEval[];
  selectedId: string | null;
  drawdownSaverId: string | null;
  buyHold: Record<Step, WindowPair>;
  current: Record<Step, WindowPair>;
  ship: boolean;
  reason: string;
  saverNote: string;
};

export type ResearchReport = {
  universe: {
    symbols: number;
    nzx: number;
    asx: number;
    usStocks: number;
    etfs: number;
    coins: number;
    rejected: string[];
    first: string;
    last: string;
  };
  books: { stox: BookResult; koins: BookResult };
  shipped: { stox: string | null; koins: string | null };
};

type Prepared = {
  symbol: string;
  market: MarketCode;
  dates: string[];
  closes: number[];
  r5: (number | null)[];
  r21: (number | null)[];
  r63: (number | null)[];
  r252: (number | null)[];
  r121: (number | null)[];
  vol63: (number | null)[];
  vol252: (number | null)[];
};

type Period = {
  date: string;
  raw: number;
  excess: number;
  exposure: number;
  turnover: number;
};

type YieldCurve = { dates: string[]; yields: number[] };

export function parseYieldCsv(text: string): YieldCurve {
  const dates: string[] = [];
  const yields: number[] = [];
  for (const line of text.trim().split(/\n/).slice(1)) {
    if (!line.trim()) continue;
    const [date, value] = line.split(",");
    const y = Number(value);
    if (!date || !Number.isFinite(y)) continue;
    dates.push(date);
    yields.push(y);
  }
  return { dates, yields };
}

/** Acklam's inverse normal. Used by the deflated Sharpe hurdle. */
export function normInv(p: number): number {
  if (!(p > 0 && p < 1)) return p <= 0 ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const plow = 0.02425;
  const phigh = 1 - plow;
  let q: number;
  if (p < plow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > phigh) {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  q = p - 0.5;
  const r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

function normCdf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t) * Math.exp(-ax * ax);
  return 0.5 * (1 + sign * y);
}

/**
 * Bailey and López de Prado (2014). `returns` are per-period excess returns.
 * N is the number of rules tried. The Sharpe inside the formula is per period,
 * not annualized. The hurdle uses the estimation error of that Sharpe.
 */
export function deflatedSharpeRatio(returns: number[], trials: number): number | null {
  if (returns.length < 8 || trials < 1) return null;
  const n = returns.length;
  const mean = returns.reduce((s, v) => s + v, 0) / n;
  let m2 = 0;
  let m3 = 0;
  let m4 = 0;
  for (const v of returns) {
    const d = v - mean;
    m2 += d * d;
    m3 += d * d * d;
    m4 += d * d * d * d;
  }
  m2 /= n - 1;
  if (!(m2 > 0)) return null;
  const sd = Math.sqrt(m2);
  const sr = mean / sd;
  const pop = m2 * ((n - 1) / n);
  const popSd = Math.sqrt(pop);
  const skew = popSd > 0 ? m3 / n / (popSd ** 3) : 0;
  const kurt = popSd > 0 ? m4 / n / (popSd ** 4) : 3;
  const moment = 1 - skew * sr + ((kurt - 1) / 4) * sr * sr;
  if (!(moment > 0)) return null;
  const sigma = Math.sqrt(moment / (n - 1));
  const hurdle = trials <= 1
    ? 0
    : sigma * ((1 - EULER) * normInv(1 - 1 / trials) + EULER * normInv(1 - 1 / (trials * Math.E)));
  const z = (sr - hurdle) / sigma;
  const p = normCdf(z);
  return Number.isFinite(p) ? p : null;
}

export function weightsFromSnaps(strategy: ResearchStrategy, snaps: Snap[]): Map<string, number> {
  if (strategy.kind === "tsmom") return tsmomWeights(snaps, strategy.field);
  return rankWeights(snaps, strategy.field, strategy.kind);
}

function tsmomWeights(snaps: Snap[], field: Field): Map<string, number> {
  const rows: { symbol: string; w: number }[] = [];
  for (const snap of snaps) {
    const ret = snap[field];
    const vol = snap.vol63;
    if (typeof ret !== "number" || typeof vol !== "number") continue;
    if (!(ret > 0) || !(vol > 0)) continue;
    rows.push({ symbol: snap.symbol, w: TARGET_VOL / vol });
  }
  const sum = rows.reduce((s, row) => s + row.w, 0);
  const scale = sum > 1 ? 1 / sum : 1;
  return new Map(rows.map((row) => [row.symbol, row.w * scale]));
}

function rankWeights(snaps: Snap[], field: Field, direction: "high" | "low"): Map<string, number> {
  const rows = snaps.filter((snap) => typeof snap[field] === "number" && Number.isFinite(snap[field] as number));
  if (rows.length < 6) return new Map();
  rows.sort((a, b) => {
    const diff = direction === "high"
      ? (b[field] as number) - (a[field] as number)
      : (a[field] as number) - (b[field] as number);
    return diff || a.symbol.localeCompare(b.symbol);
  });
  const k = Math.max(1, Math.ceil(rows.length / 3));
  const weight = 1 / k;
  return new Map(rows.slice(0, k).map((snap) => [snap.symbol, weight]));
}

function lastIndex(dates: string[], date: string): number {
  let lo = 0;
  let hi = dates.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (dates[mid] <= date) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

function dayGap(earlier: string, later: string): number {
  const a = Date.parse(`${earlier}T00:00:00Z`);
  const b = Date.parse(`${later}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

function retSeries(closes: number[], back: number): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  for (let i = back; i < closes.length; i++) {
    const prev = closes[i - back];
    if (prev > 0) out[i] = closes[i] / prev - 1;
  }
  return out;
}

function volSeries(closes: number[], window: number): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  for (let i = window; i < closes.length; i++) {
    let sum = 0;
    const rs: number[] = [];
    let ok = true;
    for (let k = i - window + 1; k <= i; k++) {
      const prev = closes[k - 1];
      if (!(prev > 0)) {
        ok = false;
        break;
      }
      const r = closes[k] / prev - 1;
      rs.push(r);
      sum += r;
    }
    if (!ok || rs.length < 2) continue;
    const m = sum / rs.length;
    let v = 0;
    for (const r of rs) v += (r - m) ** 2;
    v /= rs.length - 1;
    if (v > 0) out[i] = Math.sqrt(v) * Math.sqrt(252);
  }
  return out;
}

function scrubSeries(dates: string[], closes: number[]): { dates: string[]; closes: number[] } | null {
  const keptDates: string[] = [];
  const keptCloses: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i > 0 && i < closes.length - 1) {
      const prev = closes[i - 1];
      const close = closes[i];
      const next = closes[i + 1];
      const upSpike = prev > 0 && next > 0 && close / prev >= 5 && close / next >= 5;
      const downSpike = close > 0 && prev / close >= 5 && next / close >= 5;
      if (upSpike || downSpike) continue;
    }
    keptDates.push(dates[i]);
    keptCloses.push(closes[i]);
  }
  for (let i = 1; i < keptCloses.length; i++) {
    const prev = keptCloses[i - 1];
    if (!(prev > 0)) return null;
    const move = keptCloses[i] / prev - 1;
    if (move > 2 || move < -0.9) return null;
  }
  return { dates: keptDates, closes: keptCloses };
}

function prepareSymbol(bars: DailyBar[]): Prepared | null {
  const ordered = [...bars].sort((a, b) => a.date.localeCompare(b.date));
  if (!ordered.length) return null;
  const dates: string[] = [];
  const closes: number[] = [];
  for (const bar of ordered) {
    if (dates.length && dates[dates.length - 1] === bar.date) {
      closes[closes.length - 1] = bar.close;
      continue;
    }
    dates.push(bar.date);
    closes.push(bar.close);
  }
  const scrubbed = scrubSeries(dates, closes);
  if (!scrubbed || scrubbed.closes.length < 80) return null;
  const cleanDates = scrubbed.dates;
  const cleanCloses = scrubbed.closes;
  const r252 = retSeries(cleanCloses, 252);
  const r121: (number | null)[] = new Array(cleanCloses.length).fill(null);
  for (let i = 252; i < cleanCloses.length; i++) {
    const start = cleanCloses[i - 252];
    const end = cleanCloses[i - 21];
    if (start > 0 && end > 0) r121[i] = end / start - 1;
  }
  return {
    symbol: ordered[0].symbol,
    market: ordered[0].market,
    dates: cleanDates,
    closes: cleanCloses,
    r5: retSeries(cleanCloses, 5),
    r21: retSeries(cleanCloses, 21),
    r63: retSeries(cleanCloses, 63),
    r252,
    r121,
    vol63: volSeries(cleanCloses, 63),
    vol252: volSeries(cleanCloses, 252),
  };
}

function groupBars(bars: DailyBar[]): Map<string, DailyBar[]> {
  const map = new Map<string, DailyBar[]>();
  for (const bar of bars) {
    const list = map.get(bar.symbol) || [];
    list.push(bar);
    map.set(bar.symbol, list);
  }
  return map;
}

function prepareBook(bars: DailyBar[], book: "stox" | "koins"): { series: Prepared[]; rejected: string[] } {
  const series: Prepared[] = [];
  const rejected: string[] = [];
  for (const [, rows] of groupBars(bars)) {
    const market = rows[0]?.market;
    if (!market) continue;
    if (book === "koins" && market !== "CRYPTO") continue;
    if (book === "stox" && market === "CRYPTO") continue;
    const prepared = prepareSymbol(rows);
    if (prepared && prepared.closes.length >= 80) series.push(prepared);
    else if (rows.length >= 80) rejected.push(rows[0].symbol);
  }
  series.sort((a, b) => a.symbol.localeCompare(b.symbol));
  rejected.sort();
  return { series, rejected };
}

function calendarOf(series: Prepared[]): string[] {
  const counts = new Map<string, number>();
  for (const s of series) {
    for (const date of s.dates) counts.set(date, (counts.get(date) || 0) + 1);
  }
  const minNames = Math.max(8, Math.floor(series.length * 0.5));
  return [...counts.entries()].filter(([, n]) => n >= minNames).map(([d]) => d).sort();
}

function snapOf(s: Prepared, date: string): Snap | null {
  const idx = lastIndex(s.dates, date);
  if (idx < 0) return null;
  if (dayGap(s.dates[idx], date) > 7) return null;
  return {
    symbol: s.symbol,
    market: s.market,
    price: s.closes[idx],
    r5: s.r5[idx],
    r21: s.r21[idx],
    r63: s.r63[idx],
    r252: s.r252[idx],
    r121: s.r121[idx],
    vol63: s.vol63[idx],
    vol252: s.vol252[idx],
  };
}

function forwardReturn(s: Prepared, calendar: string[], index: number, step: number): number {
  const i0 = lastIndex(s.dates, calendar[index]);
  const i1 = lastIndex(s.dates, calendar[index + step]);
  if (i0 < 0 || i1 < i0) return 0;
  const p0 = s.closes[i0];
  const p1 = s.closes[i1];
  if (!(p0 > 0) || !(p1 > 0)) return 0;
  return p1 / p0 - 1;
}

function yieldOn(curve: YieldCurve, date: string): number {
  const idx = lastIndex(curve.dates, date);
  if (idx < 0) return 0;
  return curve.yields[idx];
}

function periodRf(curve: YieldCurve, date: string, step: number): number {
  return (yieldOn(curve, date) / 100) * (step / 252);
}

function sumWeights(weights: Map<string, number>): number {
  let s = 0;
  for (const w of weights.values()) s += w;
  return s;
}

function driftWeights(weights: Map<string, number>, rets: Map<string, number>, rf: number): Map<string, number> {
  const cash = Math.max(0, 1 - sumWeights(weights));
  let nav = cash * (1 + rf);
  const gross = new Map<string, number>();
  for (const [symbol, weight] of weights) {
    const g = weight * (1 + (rets.get(symbol) ?? 0));
    gross.set(symbol, g);
    nav += g;
  }
  const out = new Map<string, number>();
  if (!(nav > 0)) return out;
  for (const [symbol, g] of gross) {
    if (g > 0) out.set(symbol, g / nav);
  }
  return out;
}

function priceOn(s: Prepared, date: string): number | null {
  const idx = lastIndex(s.dates, date);
  if (idx < 0) return null;
  return s.closes[idx];
}

type SimContext = {
  series: Prepared[];
  bySymbol: Map<string, Prepared>;
  calendar: string[];
  points: number[];
  step: Step;
  curve: YieldCurve;
  snaps: Snap[][];
  returns: Map<string, number>[];
};

function buildContext(series: Prepared[], step: Step, curve: YieldCurve): SimContext {
  const calendar = calendarOf(series);
  const points: number[] = [];
  for (let i = 252; i + step < calendar.length; i += step) points.push(i);
  const bySymbol = new Map(series.map((s) => [s.symbol, s]));
  const snaps = points.map((index) => {
    const date = calendar[index];
    const list: Snap[] = [];
    for (const s of series) {
      const snap = snapOf(s, date);
      if (snap && snap.price > 0) list.push(snap);
    }
    return list;
  });
  const returns = points.map((index) => {
    const map = new Map<string, number>();
    for (const s of series) map.set(s.symbol, forwardReturn(s, calendar, index, step));
    return map;
  });
  return { series, bySymbol, calendar, points, step, curve, snaps, returns };
}

function tradeCost(
  ctx: SimContext,
  point: number,
  carried: Map<string, number>,
  target: Map<string, number>,
): { cost: number; turnover: number } {
  const date = ctx.calendar[ctx.points[point]];
  const symbols = new Set<string>([...carried.keys(), ...target.keys()]);
  let cost = 0;
  let turnover = 0;
  for (const symbol of symbols) {
    const dw = Math.abs((target.get(symbol) || 0) - (carried.get(symbol) || 0));
    if (!(dw > 0)) continue;
    turnover += dw;
    const series = ctx.bySymbol.get(symbol);
    const price = series ? priceOn(series, date) : null;
    if (!series || !(price && price > 0)) continue;
    cost += dw * (oneWayCostPct(series.market, price) / 100);
  }
  return { cost, turnover };
}

function applyReturn(weights: Map<string, number>, rets: Map<string, number>, rf: number, cost: number): { raw: number; excess: number } {
  let asset = 0;
  for (const [symbol, weight] of weights) asset += weight * (rets.get(symbol) ?? 0);
  const cash = Math.max(0, 1 - sumWeights(weights)) * rf;
  const gross = asset + cash;
  const raw = (1 - cost) * (1 + gross) - 1;
  return { raw, excess: raw - rf };
}

function simulate(ctx: SimContext, targets: Map<string, number>[]): Period[] {
  let carried = new Map<string, number>();
  const periods: Period[] = [];
  for (let k = 0; k < ctx.points.length; k++) {
    const target = targets[k] || new Map<string, number>();
    const date = ctx.calendar[ctx.points[k]];
    const rf = periodRf(ctx.curve, date, ctx.step);
    const { cost, turnover } = tradeCost(ctx, k, carried, target);
    const { raw, excess } = applyReturn(target, ctx.returns[k], rf, cost);
    periods.push({ date, raw, excess, exposure: sumWeights(target), turnover });
    carried = driftWeights(target, ctx.returns[k], rf);
  }
  return periods;
}

function buyAndHoldPeriods(ctx: SimContext, window: "validation" | "test"): Period[] {
  const indexes = ctx.points
    .map((point, k) => ({ point, k, date: ctx.calendar[point] }))
    .filter((row) => (window === "test" ? row.date >= HELD_OUT_FROM : row.date < HELD_OUT_FROM));
  let weights: Map<string, number> | null = null;
  const periods: Period[] = [];
  for (const row of indexes) {
    const rf = periodRf(ctx.curve, row.date, ctx.step);
    let cost = 0;
    let turnover = 0;
    if (!weights) {
      const names = ctx.snaps[row.k];
      if (!names.length) continue;
      const w = 1 / names.length;
      weights = new Map(names.map((snap) => [snap.symbol, w]));
      const paid = tradeCost(ctx, row.k, new Map(), weights);
      cost = paid.cost;
      turnover = paid.turnover;
    }
    const { raw, excess } = applyReturn(weights, ctx.returns[row.k], rf, cost);
    periods.push({ date: row.date, raw, excess, exposure: sumWeights(weights), turnover });
    weights = driftWeights(weights, ctx.returns[row.k], rf);
  }
  return periods;
}

const longCache = new Map<string, boolean>();

function currentLong(s: Prepared, date: string): boolean {
  const idx = lastIndex(s.dates, date);
  if (idx < 60) return false;
  if (dayGap(s.dates[idx], date) > 7) return false;
  const key = `${s.symbol}|${idx}`;
  const cached = longCache.get(key);
  if (cached != null) return cached;
  const window = s.closes.slice(0, idx + 1);
  const intel = analyzeSecurity(s.symbol, window[window.length - 1], s.symbol, s.market, window, { calibrate: false });
  const long = intel.score >= 58;
  longCache.set(key, long);
  return long;
}

function currentTargets(ctx: SimContext): Map<string, number>[] {
  return ctx.points.map((point) => {
    const date = ctx.calendar[point];
    const longs: string[] = [];
    for (const s of ctx.series) {
      if (currentLong(s, date)) longs.push(s.symbol);
    }
    if (!longs.length) return new Map<string, number>();
    const w = 1 / longs.length;
    return new Map(longs.map((symbol) => [symbol, w]));
  });
}

function performance(periods: Period[], step: Step): Perf {
  const raw = periods.map((p) => p.raw);
  const excess = periods.map((p) => p.excess);
  const n = periods.length;
  const empty: Perf = {
    n,
    annualizedReturn: null,
    annualizedVol: null,
    sharpe: null,
    sortino: null,
    maxDrawdown: null,
    totalReturn: null,
    avgExposure: n ? periods.reduce((s, p) => s + p.exposure, 0) / n : null,
    avgTurnover: n ? periods.reduce((s, p) => s + p.turnover, 0) / n : null,
    deflatedSharpe: null,
  };
  if (n < 2) return empty;
  const periodsPerYear = 252 / step;
  let nav = 1;
  let peak = 1;
  let maxDd = 0;
  for (const r of raw) {
    nav *= 1 + r;
    if (nav > peak) peak = nav;
    const dd = peak > 0 ? nav / peak - 1 : 0;
    if (dd < maxDd) maxDd = dd;
  }
  const years = n / periodsPerYear;
  const mean = excess.reduce((s, v) => s + v, 0) / n;
  let v = 0;
  for (const r of excess) v += (r - mean) ** 2;
  v /= n - 1;
  const sd = Math.sqrt(v);
  let down = 0;
  for (const r of excess) if (r < 0) down += r * r;
  const downside = Math.sqrt(down / n);
  const volRaw = sampleStd(raw);
  return {
    ...empty,
    annualizedReturn: nav > 0 && years > 0 ? nav ** (1 / years) - 1 : null,
    annualizedVol: volRaw == null ? null : volRaw * Math.sqrt(periodsPerYear),
    sharpe: sd > 0 ? (mean / sd) * Math.sqrt(periodsPerYear) : null,
    sortino: downside > 0 ? (mean / downside) * Math.sqrt(periodsPerYear) : null,
    maxDrawdown: maxDd,
    totalReturn: nav - 1,
    deflatedSharpe: deflatedSharpeRatio(excess, TRIALS_PER_BOOK),
  };
}

function sampleStd(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = xs.reduce((s, v) => s + v, 0) / xs.length;
  let v = 0;
  for (const x of xs) v += (x - m) ** 2;
  v /= xs.length - 1;
  return Math.sqrt(v);
}

function splitPeriods(periods: Period[]): { validation: Period[]; test: Period[] } {
  return {
    validation: periods.filter((p) => p.date < HELD_OUT_FROM),
    test: periods.filter((p) => p.date >= HELD_OUT_FROM),
  };
}

function pair(periods: Period[], step: Step): WindowPair {
  const split = splitPeriods(periods);
  return { validation: performance(split.validation, step), test: performance(split.test, step) };
}

function finiteSharpe(perf: Perf): number | null {
  return perf.sharpe != null && Number.isFinite(perf.sharpe) ? perf.sharpe : null;
}

function selectWinner(rows: StrategyEval[]): StrategyEval | null {
  const eligible = rows.filter((row) => row.validation.n >= SHIP_RULE.minValidationReturns && finiteSharpe(row.validation) != null);
  eligible.sort((a, b) => (finiteSharpe(b.validation)! - finiteSharpe(a.validation)!) || a.id.localeCompare(b.id));
  return eligible[0] || null;
}

function selectSaver(rows: StrategyEval[], buyHold: Record<Step, WindowPair>): StrategyEval | null {
  const eligible = rows.filter((row) => {
    if (row.validation.n < SHIP_RULE.minValidationReturns) return false;
    const bh = buyHold[row.step].validation;
    const sharpe = finiteSharpe(row.validation);
    const bhSharpe = finiteSharpe(bh);
    if (sharpe == null || bhSharpe == null || row.validation.maxDrawdown == null || bh.maxDrawdown == null) return false;
    if (sharpe < bhSharpe - SHIP_RULE.sharpeMatchSlack) return false;
    return row.validation.maxDrawdown >= bh.maxDrawdown + SHIP_RULE.drawdownImprovement;
  });
  eligible.sort((a, b) => (b.validation.maxDrawdown! - a.validation.maxDrawdown!) || a.id.localeCompare(b.id));
  return eligible[0] || null;
}

function shipReason(winner: StrategyEval | null, buyHold: Record<Step, WindowPair>, current: Record<Step, WindowPair>): { ship: boolean; reason: string } {
  if (!winner) return { ship: false, reason: "No rule had 12 or more validation returns, so nothing was selected." };
  const dsr = winner.validation.deflatedSharpe;
  const bh = buyHold[winner.step].test;
  const cur = current[winner.step].test;
  const parts = [`${winner.id} had the highest validation Sharpe (${fmtNum(winner.validation.sharpe)}).`];
  let ship = true;
  if (dsr == null || dsr <= SHIP_RULE.minDeflatedSharpe) {
    ship = false;
    parts.push(
      dsr == null
        ? "Its deflated Sharpe could not be computed."
        : `Its validation deflated Sharpe is ${dsr.toFixed(2)}, which does not clear 0.95 after 18 trials.`,
    );
  } else {
    parts.push(`Its validation deflated Sharpe is ${dsr.toFixed(2)}.`);
  }
  if (winner.test.n < SHIP_RULE.minTestReturns || finiteSharpe(winner.test) == null || finiteSharpe(bh) == null || finiteSharpe(cur) == null) {
    ship = false;
    parts.push("The held-out window does not have a comparable Sharpe for the rule, buy-and-hold, and the current score rule.");
  } else if (!(winner.test.sharpe! > bh.sharpe! && winner.test.sharpe! > cur.sharpe!)) {
    ship = false;
    parts.push(
      `On the held-out window its Sharpe is ${fmtNum(winner.test.sharpe)}, against buy-and-hold ${fmtNum(bh.sharpe)} and the current score rule ${fmtNum(cur.sharpe)}.`,
    );
  } else {
    parts.push(
      `On the held-out window its Sharpe is ${fmtNum(winner.test.sharpe)}, ahead of buy-and-hold ${fmtNum(bh.sharpe)} and the current score rule ${fmtNum(cur.sharpe)}.`,
    );
  }
  if (winner.test.maxDrawdown == null || bh.maxDrawdown == null) {
    ship = false;
    parts.push("The held-out drawdown could not be compared with buy-and-hold.");
  } else if (winner.test.maxDrawdown < bh.maxDrawdown - SHIP_RULE.maxDrawdownSlack) {
    ship = false;
    parts.push(
      `Its held-out max drawdown is ${fmtPct(winner.test.maxDrawdown)}, more than 10 points worse than buy-and-hold at ${fmtPct(bh.maxDrawdown)}.`,
    );
  }
  parts.push(ship ? "It clears the bar." : "It does not ship.");
  return { ship, reason: parts.join(" ") };
}

function saverNote(saver: StrategyEval | null, buyHold: Record<Step, WindowPair>): string {
  if (!saver) {
    return "No rule cut the validation max drawdown by at least 5 points while keeping a validation Sharpe within 0.05 of buy-and-hold.";
  }
  const bhVal = buyHold[saver.step].validation;
  const bhTest = buyHold[saver.step].test;
  return `${saver.id} is the validation drawdown saver: validation Sharpe ${fmtNum(saver.validation.sharpe)} versus buy-and-hold ${fmtNum(bhVal.sharpe)}, validation max drawdown ${fmtPct(saver.validation.maxDrawdown)} versus ${fmtPct(bhVal.maxDrawdown)}. Held out, its Sharpe is ${fmtNum(saver.test.sharpe)} versus buy-and-hold ${fmtNum(bhTest.sharpe)}, and its max drawdown is ${fmtPct(saver.test.maxDrawdown)} versus ${fmtPct(bhTest.maxDrawdown)}. A drawdown saver is reported even when it does not clear the ship bar.`;
}

function runBook(bars: DailyBar[], book: "stox" | "koins", curve: YieldCurve): BookResult {
  const { series, rejected } = prepareBook(bars, book);
  const contexts = new Map<Step, SimContext>();
  for (const step of [5, 21] as Step[]) contexts.set(step, buildContext(series, step, curve));
  const buyHold = {
    5: pair(buyAndHoldPeriods(contexts.get(5)!, "validation").concat(buyAndHoldPeriods(contexts.get(5)!, "test")), 5),
    21: pair(buyAndHoldPeriods(contexts.get(21)!, "validation").concat(buyAndHoldPeriods(contexts.get(21)!, "test")), 21),
  } as Record<Step, WindowPair>;
  // buy-and-hold is restarted inside each window, so the concatenated dates still split correctly.
  const current = {
    5: pair(simulate(contexts.get(5)!, currentTargets(contexts.get(5)!)), 5),
    21: pair(simulate(contexts.get(21)!, currentTargets(contexts.get(21)!)), 21),
  } as Record<Step, WindowPair>;
  const strategies: StrategyEval[] = RESEARCH_STRATEGIES.map((strategy) => {
    const ctx = contexts.get(strategy.step)!;
    const targets = ctx.snaps.map((snaps) => weightsFromSnaps(strategy, snaps));
    const windows = pair(simulate(ctx, targets), strategy.step);
    return { ...strategy, ...windows, selected: false, drawdownSaver: false };
  });
  const winner = selectWinner(strategies);
  const saver = selectSaver(strategies, buyHold);
  for (const row of strategies) {
    row.selected = winner?.id === row.id;
    row.drawdownSaver = saver?.id === row.id;
  }
  const decision = shipReason(winner, buyHold, current);
  return {
    id: book,
    label: book === "stox" ? "Stox" : "Koins",
    symbols: series.length,
    rejected,
    strategies,
    selectedId: winner?.id ?? null,
    drawdownSaverId: saver?.id ?? null,
    buyHold,
    current,
    ship: decision.ship,
    reason: decision.reason,
    saverNote: saverNote(saver, buyHold),
  };
}

export function runResearch(bars: DailyBar[], yields: YieldCurve): ResearchReport {
  if (RESEARCH_STRATEGIES.length !== TRIALS_PER_BOOK) {
    throw new Error(`Expected ${TRIALS_PER_BOOK} pre-registered rules, found ${RESEARCH_STRATEGIES.length}.`);
  }
  longCache.clear();
  const symbols = new Set(bars.map((bar) => bar.symbol));
  const dates = bars.map((bar) => bar.date).sort();
  const stox = runBook(bars, "stox", yields);
  const koins = runBook(bars, "koins", yields);
  const shipped = {
    stox: stox.ship ? stox.selectedId : null,
    koins: koins.ship ? koins.selectedId : null,
  };
  return {
    universe: {
      symbols: symbols.size,
      nzx: countMarket(bars, "NZX"),
      asx: countMarket(bars, "ASX"),
      usStocks: new Set(bars.filter((bar) => bar.market === "US" && !ETF_SYMBOLS.has(bar.symbol)).map((bar) => bar.symbol)).size,
      etfs: new Set(bars.filter((bar) => ETF_SYMBOLS.has(bar.symbol)).map((bar) => bar.symbol)).size,
      coins: countMarket(bars, "CRYPTO"),
      rejected: [...stox.rejected, ...koins.rejected],
      first: dates[0] || "",
      last: dates[dates.length - 1] || "",
    },
    books: { stox, koins },
    shipped,
  };
}

function countMarket(bars: DailyBar[], market: MarketCode): number {
  return new Set(bars.filter((bar) => bar.market === market).map((bar) => bar.symbol)).size;
}

function fmtNum(value: number | null): string {
  return value == null || !Number.isFinite(value) ? "—" : value.toFixed(2);
}

function fmtPct(value: number | null): string {
  return value == null || !Number.isFinite(value) ? "—" : `${(value * 100).toFixed(1)}%`;
}

function rowLine(name: string, window: string, perf: Perf, dsr: boolean): string {
  return `| ${name} | ${window} | ${perf.n} | ${fmtPct(perf.annualizedReturn)} | ${fmtPct(perf.annualizedVol)} | ${fmtNum(perf.sharpe)} | ${fmtNum(perf.sortino)} | ${fmtPct(perf.maxDrawdown)} | ${fmtPct(perf.avgExposure)} | ${dsr ? fmtNum(perf.deflatedSharpe) : "—"} |`;
}

function bookTable(book: BookResult): string {
  const lines = [
    "| Rule | Window | N | Ann. return | Vol | Sharpe | Sortino | Max DD | Invested | DSR |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];
  for (const step of [5, 21] as Step[]) {
    const label = step === 5 ? "weekly" : "monthly";
    lines.push(rowLine(`Buy and hold (${label})`, "validation", book.buyHold[step].validation, false));
    lines.push(rowLine(`Buy and hold (${label})`, "held out", book.buyHold[step].test, false));
    lines.push(rowLine(`Current score ≥ 58 (${label})`, "validation", book.current[step].validation, false));
    lines.push(rowLine(`Current score ≥ 58 (${label})`, "held out", book.current[step].test, false));
  }
  for (const strategy of book.strategies) {
    const mark = strategy.selected ? " · selected" : "";
    const name = `${strategy.id}${mark}`;
    lines.push(rowLine(name, "validation", strategy.validation, true));
    lines.push(rowLine(name, "held out", strategy.test, true));
  }
  return lines.join("\n");
}

export function weightsOnDate(
  bars: DailyBar[],
  book: "stox" | "koins",
  strategyId: string,
  date: string,
): Record<string, number> {
  const strategy = RESEARCH_STRATEGIES.find((row) => row.id === strategyId);
  if (!strategy) throw new Error(`Unknown rule ${strategyId}`);
  const snaps: Snap[] = [];
  for (const series of prepareBook(bars, book).series) {
    const snap = snapOf(series, date);
    if (snap && snap.price > 0) snaps.push(snap);
  }
  return Object.fromEntries([...weightsFromSnaps(strategy, snaps).entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

export function renderResearch(report: ResearchReport): string {
  const u = report.universe;
  const shippedAny = report.shipped.stox || report.shipped.koins;
  const lead = shippedAny
    ? `One rule cleared the bar. Stox ships ${report.shipped.stox ?? "nothing"}. Koins ships ${report.shipped.koins ?? "nothing"}, and a Koins change stays behind KOINS_MODEL_V2, which stays off.`
    : "It does not, on this sample. Nothing was added to the live Stox or Koins bots. `KOINS_MODEL_V2` stays off. Crypto projections stay paused.";
  const closing = shippedAny
    ? "Only the rule named above cleared validation, the deflated Sharpe, and the held-out comparison. The held-out column was not used to pick the winner."
    : "No live threshold, prompt, or model flag changed with this study. The held-out column was not used to pick the winner.";
  return `# Can a longer horizon beat buy-and-hold?

The earlier studies asked whether the live 7-day score could call the sign of next week's return. It could not, once costs were charged. This note asks a different question, taken from the research that has actually survived a second look: at a one-month, three-month, or twelve-month horizon, with weekly or monthly rebalancing, does a long-only version of those rules beat buy-and-hold and the current score on a risk-adjusted basis after costs?

${lead}

Stox: ${report.books.stox.reason}

Koins: ${report.books.koins.reason}

## Sources

These are the papers the rules come from. The numbers below are our own. Where a paper reports a Sharpe, that Sharpe is about the paper's market and sample, not about this file.

- **Time-series momentum.** Moskowitz, Ooi, and Pedersen, "Time series momentum," *Journal of Financial Economics* 104 (2012). The past 12-month return of a futures contract points the same way as the next month. They scale each position by its own volatility. A diversified long-short book of those positions had a Sharpe above 1 in their sample, with little correlation to the underlying markets. Hurst, Ooi, and Pedersen, "A Century of Evidence on Trend-Following Investing," *Journal of Portfolio Management* (2017), run the same idea, volatility-scaled, across a much longer futures history and still find a positive trend premium.
- **12-1 cross-sectional momentum.** Jegadeesh and Titman, "Returns to Buying Winners and Selling Losers," *Journal of Finance* 48 (1993), show that stocks which led their peers over 3 to 12 months tend to keep leading for the next few months. The version that skips the most recent month, the 12-1 return used in the Ken French momentum factor and in Carhart, "On Persistence in Mutual Fund Performance," *Journal of Finance* 52 (1997), is the one that avoids the short-term reversal below.
- **Low volatility.** Ang, Hodrick, Xing, and Zhang, "The Cross-Section of Volatility and Expected Returns," *Journal of Finance* 61 (2006), find that high recent volatility predicts low subsequent return. Frazzini and Pedersen, "Betting Against Beta," *Journal of Financial Economics* 111 (2014), find the same shape in beta. The rule tested here is the simple one: hold the third of the book with the lowest realised volatility. It is not a beta-neutral book.
- **Short-term reversal.** Jegadeesh, "Evidence of Predictable Behavior of Security Returns," *Journal of Finance* 45 (1990), documents a one-month reversal. Lehmann, "Fads, Martingales, and Market Efficiency," *Quarterly Journal of Economics* 105 (1990), documents a one-week reversal. Both are expensive to trade. They are included because they are the reason the 12-1 momentum factor skips a month, and because the 7-day horizon in the earlier studies sits inside this window.
- **Post-earnings drift.** Ball and Brown, *Journal of Accounting Research* (1968), and Bernard and Thomas, "Post-Earnings-Announcement Drift," *Journal of Accounting Research* 27 (1989), find that prices keep moving in the direction of an earnings surprise. Using it requires the surprise as it was known on the announcement day. Yahoo's current earnings pages are the latest view of those figures, not a point-in-time archive. No free point-in-time surprise file was available, so post-earnings drift was not tested. No earnings numbers were invented to fill the gap.
- **Crypto trend.** Liu and Tsyvinski, "Risks and Returns of Cryptocurrency," *Review of Financial Studies* 34 (2021), find a strong time-series momentum effect in coins. Liu, Tsyvinski, and Wu, NBER Working Paper 25882 (2019), build a crypto momentum factor from one-week to four-week returns. The test here asks whether that idea, and the longer Moskowitz horizons, still help after costs on the coins Yahoo actually publishes.
- **Multiple testing.** Bailey and López de Prado, "The Deflated Sharpe Ratio: Correcting for Selection Bias, Backtest Overfitting, and Non-Normality," *Journal of Portfolio Management* 40 (2014). Trying 18 rules inflates the best Sharpe even when every rule is noise. The deflated Sharpe is the probability that the selected rule's true Sharpe beats the Sharpe you would expect to find by taking the best of 18 noise trials, after a penalty for skew and fat tails. A value above 0.95 is the usual bar. The trials are correlated, so treating them as 18 independent tries is the harsher reading, and that is the reading used here.

## What was tested

Eighteen rules, chosen before the held-out numbers were read. Each book, Stox and Koins, is searched separately, so the penalty is 18 per book rather than 36.

| Family | What it holds | Horizons | Rebalance |
| --- | --- | --- | --- |
| Time-series momentum | Names with a positive own return, weighted by 10% divided by their 3-month volatility, with the book capped at 100% and the rest left in cash | 1, 3, and 12 months | weekly and monthly |
| Cross-sectional momentum | The top third by own return. The 12-month version skips the most recent month (12-1). Equal weight | 1, 3, and 12-1 months | weekly and monthly |
| Low volatility | The third with the lowest realised volatility. Equal weight, fully invested | 3-month and 12-month volatility | weekly and monthly |
| Short-term reversal | The worst third over the past week, rebalanced weekly, and the worst third over the past month, rebalanced monthly | 1 week and 1 month | matching the horizon |

A name is eligible on a date only if it has a price within the last 7 days. A coin that listed in 2023 does not appear in 2021. Lookbacks use that name's own history, so a 12-month signal stays blank until the name has 12 months of closes. Signals use prices up to the decision date. The return is the move from that date to the next rebalance. Weights never depend on a later close.

The published versions of these rules are long-short, and the futures versions use leverage to hit a volatility target. These bots do not short and do not borrow. Every rule here is the long leg only. Time-series momentum holds cash when few names are in an uptrend. The other rules stay fully invested in their third of the book.

Costs use the same one-way schedule as the earlier studies: 3 bps in the US, 8 bps on NZX and ASX names priced at $2 or more, 25 bps below $2, and 15 bps in crypto. They are charged on turnover. A position that is kept is not charged a fresh round trip. Cash earns the US 13-week T-bill yield from Yahoo \`^IRX\`, pro-rated by the length of the holding period. Sharpe and Sortino use the return minus that T-bill rate. Annualised return, volatility, and max drawdown use the portfolio's own value, so a drawdown is a drawdown in the account rather than a drawdown versus bills. The risk-free rate is a US yield applied to a book that also holds NZD and AUD shares. That is a common yardstick, not a perfect local cash rate.

Buy-and-hold is restarted, equal weight, at the first date of each window, among the names tradable that day, and then left alone. The current score rule is the live one: a name is held when \`analyzeSecurity\` gives it a score of 58 or more, which is the Buy threshold in \`signalFromScore\`. Those names are equal-weighted and the rest is cash. The score is computed from closes up to the decision date only.

The validation window is every decision before 24 October 2024, after a 252-session burn-in so the 12-month signal exists. The held-out window is every decision on or after 24 October 2024. The winner is the rule with the highest validation Sharpe. Its deflated Sharpe is computed on the validation returns. The held-out window is then read once. A rule ships only if all of these are true:

- validation deflated Sharpe above 0.95
- held-out Sharpe above buy-and-hold and above the current score rule, on the same rebalance grid
- held-out max drawdown no more than 10 points worse than buy-and-hold

Separately, a rule that keeps a validation Sharpe within 0.05 of buy-and-hold and cuts the validation max drawdown by at least 5 points is reported as a drawdown saver. That report does not, by itself, ship the rule.

## Universe

Daily adjusted closes from Yahoo, the same source as the earlier studies. ${u.symbols} names from ${u.first} to ${u.last}: ${u.nzx} NZX, ${u.asx} ASX, ${u.usStocks} US stocks, ${u.etfs} US and regional ETFs (SPY, QQQ, IWM, EWA, ENZL, and the SPDR sector funds), and ${u.coins} coin files. Four NZX tickers Yahoo does not list (GMT, PPH, FRE, ARV) were left out. Uniswap, Aptos, and Sui are included under Yahoo's long tickers \`UNI7083-USD\`, \`APT21794-USD\`, and \`SUI20947-USD\`, because the short tickers returned nothing. Aptos and Sui do not cover the full five years, and they enter only once their own history is long enough.

A downloaded series is dropped if, after removing an isolated print that is at least five times both neighbouring closes, any remaining one-day move is larger than 200% or worse than -90%. That rule removed ${u.rejected.length ? u.rejected.join(", ") : "no names"}. ARB-USD, OP-USD, and TON-USD jump between a fraction of a cent and a dollar and stay at the new level, so they are not a tradable history. Render, Fetch, and Maker (\`RENDER-USD\`, \`FET-USD\`, \`MKR-USD\`) are in the file in their place and pass the same check. The first Koins pass, before this rule, showed annualised volatility in the thousands of percent. That figure was the bad prints, not a market. The ship bar was not changed for the rerun. No row was filled in by hand.

## Stox

${u.nzx + u.asx + u.usStocks + u.etfs} names in the file, ${report.books.stox.symbols} with enough history to enter the book. The book mixes single stocks and ETFs, so a cross-sectional rank can prefer a sector fund to a stock. Time-series momentum does not need that comparison.

${report.books.stox.reason}

${report.books.stox.saverNote}

${bookTable(report.books.stox)}

## Koins

${report.books.koins.symbols} coins. The same 18 rules. A Koins rule that cleared the bar would still not be switched on for members: \`KOINS_MODEL_V2\` stays off.

${report.books.koins.reason}

${report.books.koins.saverNote}

${bookTable(report.books.koins)}

## What this means for the bots

The live score is a 7-day indicator blend. The research that has held up out of sample lives at a monthly horizon, usually in a long-short or leveraged futures book, and it does not automatically transfer to a long-only book of NZ, Australian, US, and crypto names over a two-year holdout. Where a rule looks better on the raw held-out Sharpe, the validation deflated Sharpe is the check on whether that was the best of 18 tries. The tables above are the whole search.

${closing}
`;
}
