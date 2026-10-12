/**
 * Walk-forward check of the Stox / Koins real-history engine.
 * Each decision uses only closes up to that date. The next 7 closes are the
 * outcome. Costs are a model of spread and commission, not a broker tariff.
 * Public delayed daily bars only. Not a licensed or real-time exchange feed.
 */

import { createHash } from "node:crypto";
import { analyzeSecurity, type MarketCode } from "@/lib/market-intel";
import {
  applyPlatt,
  applyResidualBand,
  fitPlatt,
  fitResidualBand,
  type FrozenCalibration,
  type PlattMap,
  type ResidualBand,
} from "@/lib/bot-calibration";

export const MIN_HISTORY = 60;
export const HORIZON = 7;
export const FIT_FRACTION = 0.4;
export const TEST_FRACTION_START = 0.6;

export interface DailyBar {
  symbol: string;
  market: "NZX" | "ASX" | "US" | "CRYPTO";
  date: string;
  close: number;
  volume: number | null;
}

export interface DecisionRow {
  symbol: string;
  market: DailyBar["market"];
  date: string;
  outcomeDate: string;
  driftPct: number;
  confidence: number;
  sigma7Pct: number;
  lowPct: number;
  highPct: number;
  score: number;
  close: number;
  realizedPct: number;
  prior7Pct: number;
  hit: 0 | 1 | null;
  covered: 0 | 1;
  volumeRatio: number | null;
}

export interface SideMetrics {
  n: number;
  hitRate: number | null;
  alwaysUpHitRate: number | null;
  momentumHitRate: number | null;
  brier: number | null;
  coverage: number | null;
  coverageError: number | null;
  meanStrategyReturnPct: number | null;
  meanBuyHoldReturnPct: number | null;
  maxDrawdownPct: number | null;
  buyHoldMaxDrawdownPct: number | null;
}

export interface BotMetrics {
  bot: "stox" | "koins";
  fit: SideMetrics;
  validation: SideMetrics;
  testRaw: SideMetrics;
  testCalibrated: SideMetrics;
  noEdgeOnFit: boolean;
  noEdgeOnTest: boolean;
  volumeFilterTestHitRate: number | null;
}

export interface BacktestReport {
  decisions: DecisionRow[];
  stox: BotMetrics;
  koins: BotMetrics;
  calibration: FrozenCalibration;
  validationAcceptsCalibration: boolean;
  seal: string;
  rows: number;
}

export function oneWayCostPct(market: DailyBar["market"], price: number): number {
  if (market === "CRYPTO") return 0.15;
  if (market === "US") return 0.03;
  if (price < 2) return 0.25;
  return 0.08;
}

export function parseClosesCsv(text: string): DailyBar[] {
  const lines = text.trim().split(/\n/);
  const out: DailyBar[] = [];
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const [symbol, market, date, close, volume] = line.split(",");
    const px = Number(close);
    if (!symbol || !date || !(px > 0)) continue;
    if (market !== "NZX" && market !== "ASX" && market !== "US" && market !== "CRYPTO") continue;
    const vol = volume === "" || volume == null ? null : Number(volume);
    out.push({
      symbol,
      market,
      date,
      close: px,
      volume: vol != null && Number.isFinite(vol) ? vol : null,
    });
  }
  return out;
}

function marketCode(market: DailyBar["market"]): MarketCode {
  return market;
}

/** Decisions for one symbol. The series passed to the engine stops at `i`. */
export function decisionsForSymbol(bars: DailyBar[]): DecisionRow[] {
  const ordered = [...bars].sort((a, b) => a.date.localeCompare(b.date));
  const closes = ordered.map((b) => b.close);
  const out: DecisionRow[] = [];
  for (let i = MIN_HISTORY; i + HORIZON < closes.length; i += HORIZON) {
    const window = closes.slice(0, i + 1);
    const last = window[window.length - 1];
    const intel = analyzeSecurity(
      ordered[i].symbol,
      last,
      ordered[i].symbol,
      marketCode(ordered[i].market),
      window,
      { calibrate: false }
    );
    const realizedPct = (closes[i + HORIZON] / closes[i] - 1) * 100;
    const prior7Pct = (closes[i] / closes[i - HORIZON] - 1) * 100;
    const sign = Math.sign(intel.projected7dPct);
    const hit: 0 | 1 | null =
      Math.abs(realizedPct) < 0.05 || sign === 0 ? null : Math.sign(realizedPct) === sign ? 1 : 0;
    const low = intel.outlook.base.lowPct;
    const high = intel.outlook.base.highPct;
    const vols = ordered.slice(Math.max(0, i - 19), i + 1).map((b) => b.volume).filter((v): v is number => v != null && v > 0);
    const avg = vols.length ? vols.reduce((s, v) => s + v, 0) / vols.length : null;
    const todayVol = ordered[i].volume;
    out.push({
      symbol: ordered[i].symbol,
      market: ordered[i].market,
      date: ordered[i].date,
      outcomeDate: ordered[i + HORIZON].date,
      driftPct: intel.projected7dPct,
      confidence: intel.confidence,
      sigma7Pct: intel.outlook.sigma7Pct,
      lowPct: low,
      highPct: high,
      score: intel.score,
      close: last,
      realizedPct,
      prior7Pct,
      hit,
      covered: realizedPct >= Math.min(low, high) && realizedPct <= Math.max(low, high) ? 1 : 0,
      volumeRatio: avg && todayVol != null && avg > 0 ? todayVol / avg : null,
    });
  }
  return out;
}

export function hashChain(lines: string[]): { hashes: string[]; seal: string } {
  let prev = "GENESIS";
  const hashes: string[] = [];
  for (const line of lines) {
    prev = createHash("sha256").update(`${prev}\n${line}`).digest("hex");
    hashes.push(prev);
  }
  return { hashes, seal: prev };
}

export function decisionsCsv(report: BacktestReport): string {
  const lines = ["symbol,date,outcomeDate,driftPct,confidence,lowPct,highPct,realizedPct,hit,covered,hash"];
  const body = report.decisions.map(decisionLine);
  const { hashes, seal } = hashChain(body);
  if (seal !== report.seal) throw new Error("decision log seal does not match the report");
  body.forEach((line, i) => lines.push(`${line},${hashes[i]}`));
  return lines.join("\n") + "\n";
}

export function decisionLine(row: DecisionRow): string {
  return [
    row.symbol,
    row.date,
    row.outcomeDate,
    row.driftPct.toFixed(4),
    row.confidence.toFixed(0),
    row.lowPct.toFixed(4),
    row.highPct.toFixed(4),
    row.realizedPct.toFixed(4),
    row.hit == null ? "" : String(row.hit),
    String(row.covered),
  ].join(",");
}

function mean(xs: number[]): number | null {
  if (!xs.length) return null;
  return xs.reduce((s, v) => s + v, 0) / xs.length;
}

function maxDrawdown(returnsPct: number[]): number | null {
  if (!returnsPct.length) return null;
  let equity = 1;
  let peak = 1;
  let worst = 0;
  for (const r of returnsPct) {
    equity *= 1 + r / 100;
    if (equity > peak) peak = equity;
    const dd = peak > 0 ? (equity / peak - 1) * 100 : 0;
    if (dd < worst) worst = dd;
  }
  return worst;
}

function strategyReturns(rows: DecisionRow[]): number[] {
  const byDate = new Map<string, number[]>();
  for (const row of rows) {
    const long = row.score >= 58 && row.driftPct > 0;
    const fee = long ? 2 * oneWayCostPct(row.market, row.close) : 0;
    const list = byDate.get(row.date) || [];
    list.push(long ? row.realizedPct - fee : 0);
    byDate.set(row.date, list);
  }
  return [...byDate.keys()].sort().map((date) => {
    const xs = byDate.get(date) || [];
    return xs.reduce((s, v) => s + v, 0) / xs.length;
  });
}

function buyHoldReturns(rows: DecisionRow[]): number[] {
  const byDate = new Map<string, number[]>();
  for (const row of rows) {
    const list = byDate.get(row.date) || [];
    list.push(row.realizedPct);
    byDate.set(row.date, list);
  }
  return [...byDate.keys()].sort().map((date) => {
    const xs = byDate.get(date) || [];
    return xs.reduce((s, v) => s + v, 0) / xs.length;
  });
}

export function scoreRows(rows: DecisionRow[], mode: "raw" | "calibrated", platt?: PlattMap, band?: ResidualBand): SideMetrics {
  const hits: number[] = [];
  const up: number[] = [];
  const mom: number[] = [];
  const brierParts: number[] = [];
  const covered: number[] = [];
  for (const row of rows) {
    if (row.hit != null) {
      hits.push(row.hit);
      const pRaw = row.confidence / 100;
      const p = mode === "calibrated" && platt ? applyPlatt(row.confidence, platt) / 100 : pRaw;
      brierParts.push((p - row.hit) ** 2);
    }
    if (Math.abs(row.realizedPct) >= 0.05) {
      up.push(row.realizedPct > 0 ? 1 : 0);
      if (Math.abs(row.prior7Pct) >= 0.05) mom.push(Math.sign(row.realizedPct) === Math.sign(row.prior7Pct) ? 1 : 0);
    }
    if (mode === "calibrated" && band) {
      const next = applyResidualBand(row.driftPct, row.sigma7Pct, band);
      covered.push(row.realizedPct >= next.lowPct && row.realizedPct <= next.highPct ? 1 : 0);
    } else {
      covered.push(row.covered);
    }
  }
  const coverage = mean(covered);
  const strat = strategyReturns(rows);
  const hold = buyHoldReturns(rows);
  return {
    n: rows.length,
    hitRate: mean(hits),
    alwaysUpHitRate: mean(up),
    momentumHitRate: mean(mom),
    brier: mean(brierParts),
    coverage,
    coverageError: coverage == null ? null : Math.abs(coverage - 0.5),
    meanStrategyReturnPct: mean(strat),
    meanBuyHoldReturnPct: mean(hold),
    maxDrawdownPct: maxDrawdown(strat),
    buyHoldMaxDrawdownPct: maxDrawdown(hold),
  };
}

function noEdge(metrics: SideMetrics): boolean {
  if (metrics.hitRate == null) return true;
  const baseline = Math.max(metrics.alwaysUpHitRate ?? 0, metrics.momentumHitRate ?? 0);
  return metrics.hitRate <= baseline + 0.02;
}

function better(next: SideMetrics, prev: SideMetrics): boolean {
  if (next.brier == null || prev.brier == null || next.coverageError == null || prev.coverageError == null) return false;
  const brierGain = prev.brier - next.brier;
  const coverGain = prev.coverageError - next.coverageError;
  if (brierGain < -0.005 || coverGain < -0.02) return false;
  return brierGain > 0.005 || coverGain > 0.02;
}

export function runBacktest(bars: DailyBar[]): BacktestReport {
  const bySymbol = new Map<string, DailyBar[]>();
  for (const bar of bars) {
    const list = bySymbol.get(bar.symbol) || [];
    list.push(bar);
    bySymbol.set(bar.symbol, list);
  }
  const decisions: DecisionRow[] = [];
  for (const list of bySymbol.values()) decisions.push(...decisionsForSymbol(list));
  decisions.sort((a, b) => a.date.localeCompare(b.date) || a.symbol.localeCompare(b.symbol));

  const dates = [...new Set(decisions.map((row) => row.date))].sort();
  const fitCut = dates[Math.floor(dates.length * FIT_FRACTION)] || dates[0] || "";
  const testCut = dates[Math.floor(dates.length * TEST_FRACTION_START)] || fitCut;

  const fit = (bot: "stox" | "koins") =>
    decisions.filter((row) => (bot === "koins" ? row.market === "CRYPTO" : row.market !== "CRYPTO") && row.date < fitCut);
  const val = (bot: "stox" | "koins") =>
    decisions.filter(
      (row) => (bot === "koins" ? row.market === "CRYPTO" : row.market !== "CRYPTO") && row.date >= fitCut && row.date < testCut
    );
  const test = (bot: "stox" | "koins") =>
    decisions.filter((row) => (bot === "koins" ? row.market === "CRYPTO" : row.market !== "CRYPTO") && row.date >= testCut);

  const fitRows = decisions.filter((row) => row.date < fitCut);
  const platt = fitPlatt(
    fitRows.filter((row) => row.hit != null).map((row) => ({ confidence: row.confidence, hit: row.hit as 0 | 1 }))
  );
  const band = fitResidualBand(fitRows);

  const pooledValRaw = scoreRows(
    decisions.filter((row) => row.date >= fitCut && row.date < testCut),
    "raw"
  );
  const pooledValCal = scoreRows(
    decisions.filter((row) => row.date >= fitCut && row.date < testCut),
    "calibrated",
    platt,
    band
  );
  const validationAcceptsCalibration = better(pooledValCal, pooledValRaw);

  const refitRows = decisions.filter((row) => row.date < testCut);
  const shippedPlatt = validationAcceptsCalibration
    ? fitPlatt(refitRows.filter((row) => row.hit != null).map((row) => ({ confidence: row.confidence, hit: row.hit as 0 | 1 })))
    : { a: 0, b: 1 };
  const shippedBand = validationAcceptsCalibration ? fitResidualBand(refitRows) : { q25: -0.674, q75: 0.674 };

  const calibration: FrozenCalibration = {
    enabled: validationAcceptsCalibration,
    platt: shippedPlatt,
    band: shippedBand,
    fitThrough: testCut,
    note: validationAcceptsCalibration
      ? "Validation window preferred the recalibrated confidence and the residual band. Test dates were not used to choose it."
      : "Validation window did not prefer recalibration. The raw model stays.",
  };

  function botMetrics(bot: "stox" | "koins"): BotMetrics {
    const fitM = scoreRows(fit(bot), "raw");
    const valM = scoreRows(val(bot), "raw");
    const testRaw = scoreRows(test(bot), "raw");
    const testCalibrated = scoreRows(test(bot), "calibrated", shippedPlatt, shippedBand);
    const volHits = test(bot).filter((row) => row.hit != null && row.volumeRatio != null && row.volumeRatio >= 1 && row.score >= 58);
    return {
      bot,
      fit: fitM,
      validation: valM,
      testRaw,
      testCalibrated: validationAcceptsCalibration ? testCalibrated : testRaw,
      noEdgeOnFit: noEdge(fitM),
      noEdgeOnTest: noEdge(testRaw),
      volumeFilterTestHitRate: volHits.length ? volHits.reduce((s, row) => s + (row.hit || 0), 0) / volHits.length : null,
    };
  }

  const lines = decisions.map(decisionLine);
  const { seal } = hashChain(lines);
  return {
    decisions,
    stox: botMetrics("stox"),
    koins: botMetrics("koins"),
    calibration,
    validationAcceptsCalibration,
    seal,
    rows: decisions.length,
  };
}

function fmt(n: number | null, digits = 3): string {
  if (n == null || !Number.isFinite(n)) return "n/a";
  return n.toFixed(digits);
}

function pct(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "n/a";
  return `${(n * 100).toFixed(1)}%`;
}

export function formatBacktestMarkdown(report: BacktestReport): string {
  const row = (label: string, m: SideMetrics) =>
    `| ${label} | ${m.n} | ${pct(m.hitRate)} | ${pct(m.alwaysUpHitRate)} | ${pct(m.momentumHitRate)} | ${fmt(m.brier, 4)} | ${pct(m.coverage)} | ${fmt(m.meanStrategyReturnPct, 3)} | ${fmt(m.meanBuyHoldReturnPct, 3)} | ${fmt(m.maxDrawdownPct, 2)} | ${fmt(m.buyHoldMaxDrawdownPct, 2)} |`;
  const block = (bot: BotMetrics) =>
    [
      `### ${bot.bot === "stox" ? "Stox (NZX, ASX, US)" : "Koins (major coins)"}`,
      "",
      bot.noEdgeOnFit
        ? "On the fit window the directional call did not beat the better naive baseline by 2 percentage points. That is a no-edge result for the fit window."
        : "On the fit window the directional call beat the better naive baseline by more than 2 percentage points.",
      bot.noEdgeOnTest
        ? "On the later test window the raw directional call also did not beat that baseline by 2 percentage points."
        : "On the later test window the raw directional call beat that baseline by more than 2 percentage points.",
      "",
      "| Window | Decisions | Direction hit | Always-up | Momentum | Brier | 50% band coverage | Strategy mean % | Buy-and-hold mean % | Strategy max drawdown | Buy-and-hold max drawdown |",
      "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
      row("Fit (raw)", bot.fit),
      row("Validation (raw)", bot.validation),
      row("Test, raw model", bot.testRaw),
      row("Test, after the frozen map", bot.testCalibrated),
      "",
      `Volume filter (test longs with volume at or above the 20-session average): hit rate ${pct(bot.volumeFilterTestHitRate)}.`,
      "",
    ].join("\n");
  return [
    "# Stox and Koins walk-forward check",
    "",
    "Delayed public daily closes from Yahoo Finance. Not a licensed or real-time NZX, ASX, or crypto feed.",
    "Each decision uses only closes up to that date. The outcome is the close 7 sessions later. Decisions do not overlap.",
    "The fit window is the earliest 40% of decision dates. The validation window is the next 20%. The test window is the last 40%. The test window was not used to choose the calibration.",
    "A long is taken when the score is at least 58 and the 7-day drift is positive. Otherwise the strategy is in cash for that week.",
    "Round-trip cost is 6 bps for a US name at or above 2, 16 bps for an NZX or ASX name at or above 2, 50 bps for a name under 2, and 30 bps for a coin. Buy-and-hold is the same weeks with no repeated cost.",
    "Hit rate ignores weeks where the outcome moved less than 0.05%. Brier scores the stated confidence as the probability that the sign is right. The 50% band should contain the outcome about half the time.",
    "",
    report.validationAcceptsCalibration
      ? "The validation window preferred recalibrated confidence and a residual 50% band. Those coefficients are frozen in the real-history engine for equities. Koins uses them only when KOINS_MODEL_V2=on, which is off."
      : "The validation window did not prefer recalibration. The live engine keeps the raw confidence and the raw band.",
    "",
    `Fit through (test dates start at) ${report.calibration.fitThrough}. Rows ${report.rows}. Seal ${report.seal}.`,
    "",
    block(report.stox),
    block(report.koins),
    "",
    "This is a count of how a model behaved on past delayed prices. It is not a forecast and it is not personal advice.",
    "",
  ].join("\n");
}

/** A later close must not change a decision that was made before it. */
export function decisionIgnoresFuture(bars: DailyBar[]): boolean {
  const symbolBars = bars.filter((b) => b.symbol === bars[0]?.symbol).sort((a, b) => a.date.localeCompare(b.date));
  if (symbolBars.length < MIN_HISTORY + HORIZON + 5) return false;
  const i = MIN_HISTORY;
  const spiked = symbolBars.map((bar, idx) => (idx > i && idx <= i + 5 ? { ...bar, close: bar.close * 3 } : bar));
  const a = decisionsForSymbol(symbolBars);
  const b = decisionsForSymbol(spiked);
  if (!a.length || !b.length) return false;
  return a[0].driftPct === b[0].driftPct && a[0].confidence === b[0].confidence && a[0].score === b[0].score && a[0].lowPct === b[0].lowPct;
}
