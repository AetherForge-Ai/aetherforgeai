/**
 * Round-2 walk-forward checks on the same decisions as the daily engine.
 * A rule is fit only on the earliest window. The middle window picks at most
 * one rule. The later window is scored once. Nothing here is a personal
 * recommendation, and the prices are delayed public prints.
 *
 * Hurdles below were set before this file was run on the later window.
 * Do not loosen them after seeing that window.
 */

import { quantile } from "@/lib/bot-calibration";
import {
  decisionsForSymbol,
  FIT_FRACTION,
  oneWayCostPct,
  runBacktest,
  TEST_FRACTION_START,
  type DailyBar,
} from "@/lib/bot-eval";

export const RETURN_HURDLE_PP = 0.05;
export const DRAWDOWN_SLACK_PP = 5;
export const COVERAGE_HURDLE = 0.01;
export const COVERAGE_TEST_MARGIN = 0.005;
export const RIDGE_LAMBDA = 10;
export const GBM_TREES = 20;
export const GBM_LEARNING_RATE = 0.1;
export const META_THRESHOLDS = [0.5, 0.55, 0.6] as const;

/**
 * Live shipment. Null means the later window did not confirm a better rule.
 * Koins stays off unless KOINS_MODEL_V2=on, even if a name is set here.
 */
export const SHIPPED_EDGE = {
  stox: null as string | null,
  koins: null as string | null,
  stoxRange: null as string | null,
  koinsRange: null as string | null,
};

export interface ContextPoint {
  symbol: string;
  kind: string;
  date: string;
  value: number;
}

export interface EdgeRow {
  symbol: string;
  market: DailyBar["market"];
  bot: "stox" | "koins";
  date: string;
  close: number;
  realizedPct: number;
  prior7Pct: number;
  score: number;
  driftPct: number;
  confidence: number;
  sigma7Pct: number;
  hit: 0 | 1 | null;
  ret5: number;
  ret20: number;
  ret60: number;
  vol20: number;
  ewmaSigma7: number;
  volumeRatio: number | null;
  smaGap: number;
  costPct: number;
  csRankBasket: number | null;
  csRankMarket: number | null;
  breadth: number | null;
  indexRet20: number | null;
  fxRet20: number | null;
  onchainRet20: number | null;
  regimeBullFit: number | null;
  regimeBullRefit: number | null;
  garchSigmaFit: number | null;
  garchSigmaRefit: number | null;
}

export interface WindowScore {
  n: number;
  longs: number;
  hitRate: number | null;
  alwaysUpHitRate: number | null;
  momentumHitRate: number | null;
  brier: number | null;
  coverage: number | null;
  meanStrategyReturnPct: number | null;
  meanBuyHoldReturnPct: number | null;
  maxDrawdownPct: number | null;
  buyHoldMaxDrawdownPct: number | null;
}

export interface CandidateResult {
  name: string;
  eligible: boolean;
  reason: string;
  validation: WindowScore;
  test: WindowScore;
  validationGapPp: number | null;
}

export interface RangeResult {
  name: string;
  validationError: number | null;
  testError: number | null;
  validationCoverage: number | null;
  testCoverage: number | null;
}

export interface BotEdge {
  before: WindowScore;
  currentValidation: WindowScore;
  currentTest: WindowScore;
  candidates: CandidateResult[];
  selected: string | null;
  shippedName: string | null;
  ranges: RangeResult[];
  shippedRange: string | null;
}

export interface EdgeStudy {
  testFrom: string;
  fitThrough: string;
  notes: string[];
  stox: BotEdge;
  koins: BotEdge;
}

interface Hmm {
  pi: [number, number];
  A: [[number, number], [number, number]];
  mu: [number, number];
  vari: [number, number];
}

interface Stump {
  feature: number;
  threshold: number;
  left: number;
  right: number;
}

interface LinearModel {
  beta: number[];
  mean: number[];
  std: number[];
}

interface Pack {
  ridge: LinearModel | null;
  gbm: Stump[] | null;
  meta: { model: LinearModel; threshold: number } | null;
  volTargetEwma: number;
  volTargetGarch: number;
}

const RULES = [
  "xs-basket-momentum",
  "xs-market-momentum",
  "xs-basket-reversal",
  "momentum-plus-reversal",
  "breadth-gate",
  "index-gate",
  "fx-gate",
  "vol-ewma-size",
  "vol-garch-size",
  "hmm-gate",
  "hmm-timing",
  "ridge",
  "gbm",
  "meta-label",
  "onchain-gate",
] as const;

type RuleName = (typeof RULES)[number];

export function parseContextCsv(text: string): ContextPoint[] {
  const out: ContextPoint[] = [];
  for (const line of text.trim().split(/\n/).slice(1)) {
    if (!line.trim()) continue;
    const [symbol, kind, date, value] = line.split(",");
    const parsed = Number(value);
    if (!symbol || !date || !Number.isFinite(parsed)) continue;
    out.push({ symbol, kind, date, value: parsed });
  }
  return out;
}

export function runEdgeStudy(bars: DailyBar[], context: ContextPoint[]): EdgeStudy {
  const baseline = runBacktest(bars);
  const rows = buildEdgeRows(bars);
  const dates = [...new Set(rows.map((row) => row.date))].sort();
  const fitCut = dates[Math.floor(dates.length * FIT_FRACTION)] || "";
  const testFrom = dates[Math.floor(dates.length * TEST_FRACTION_START)] || fitCut;
  const notes = attachContext(rows, bars, context, fitCut);
  attachGarch(rows, bars, fitCut, testFrom);
  attachRegime(rows, bars, context, fitCut, testFrom);
  assignRanks(rows);

  const study: EdgeStudy = {
    testFrom,
    fitThrough: fitCut,
    notes,
    stox: scoreBot(rows, "stox", fitCut, testFrom, baseline.stox.testCalibrated),
    koins: scoreBot(rows, "koins", fitCut, testFrom, baseline.koins.testCalibrated),
  };
  return study;
}

function scoreBot(
  all: EdgeRow[],
  bot: "stox" | "koins",
  fitCut: string,
  testFrom: string,
  beforeSource: {
    n: number;
    hitRate: number | null;
    alwaysUpHitRate: number | null;
    momentumHitRate: number | null;
    brier: number | null;
    coverage: number | null;
    meanStrategyReturnPct: number | null;
    meanBuyHoldReturnPct: number | null;
    maxDrawdownPct: number | null;
    buyHoldMaxDrawdownPct: number | null;
  }
): BotEdge {
  const rows = all.filter((row) => row.bot === bot);
  const fit = rows.filter((row) => row.date < fitCut);
  const validation = rows.filter((row) => row.date >= fitCut && row.date < testFrom);
  const test = rows.filter((row) => row.date >= testFrom);
  const fitPack = buildPack(fit, "fit");
  const refitPack = buildPack(rows.filter((row) => row.date < testFrom), "refit");
  const currentValidation = scoreRule(validation, "current", fitPack, "fit");
  const currentTest = scoreRule(test, "current", refitPack, "refit");
  const candidates: CandidateResult[] = RULES.map((name) => {
    const gate = eligibility(name, bot, validation, fit, fitPack);
    if (!gate.eligible) {
      return {
        name,
        eligible: false,
        reason: gate.reason,
        validation: blankScore(validation.length),
        test: blankScore(test.length),
        validationGapPp: null,
      };
    }
    const validationScore = scoreRule(validation, name, fitPack, "fit");
    const testScore = scoreRule(test, name, refitPack, "refit");
    const gap =
      validationScore.meanStrategyReturnPct != null && currentValidation.meanStrategyReturnPct != null
        ? validationScore.meanStrategyReturnPct - currentValidation.meanStrategyReturnPct
        : null;
    return { name, eligible: true, reason: gate.reason, validation: validationScore, test: testScore, validationGapPp: gap };
  });
  const selected = pickWinner(candidates, currentValidation);
  const selectedTest = candidates.find((row) => row.name === selected)?.test;
  const shippedName = selected && confirmReason(selectedTest, currentTest) == null ? selected : null;
  const ranges = rangeResults(fit, validation, test);
  const shippedRange = pickRange(ranges);
  const before = windowFromBaseline(beforeSource);
  return { before, currentValidation, currentTest, candidates, selected, shippedName, ranges, shippedRange };
}

function blankScore(n: number): WindowScore {
  return {
    n,
    longs: 0,
    hitRate: null,
    alwaysUpHitRate: null,
    momentumHitRate: null,
    brier: null,
    coverage: null,
    meanStrategyReturnPct: null,
    meanBuyHoldReturnPct: null,
    maxDrawdownPct: null,
    buyHoldMaxDrawdownPct: null,
  };
}

/**
 * A higher return than the old rule is not enough.
 * The later window also has to beat buy-and-hold, and the drawdown cannot
 * be more than 5 points worse than the old rule.
 */
export function confirmReason(test: WindowScore | undefined, current: WindowScore): string | null {
  if (!test || test.meanStrategyReturnPct == null || current.meanStrategyReturnPct == null) return "The later window had no score.";
  if (!(test.meanStrategyReturnPct > current.meanStrategyReturnPct)) {
    return "The later weekly return did not beat the current rule.";
  }
  if (test.meanBuyHoldReturnPct != null && !(test.meanStrategyReturnPct > test.meanBuyHoldReturnPct)) {
    return "The later weekly return still lagged buy-and-hold.";
  }
  if (
    test.maxDrawdownPct != null &&
    current.maxDrawdownPct != null &&
    current.maxDrawdownPct - test.maxDrawdownPct > DRAWDOWN_SLACK_PP
  ) {
    return "The later drawdown was more than 5 points worse than the current rule.";
  }
  return null;
}

function pickWinner(candidates: CandidateResult[], current: WindowScore): string | null {
  let best: CandidateResult | null = null;
  for (const candidate of candidates) {
    if (!candidate.eligible || candidate.validationGapPp == null) continue;
    if (!beatsOnValidation(candidate.validation, current)) continue;
    if (!best || (candidate.validationGapPp ?? -Infinity) > (best.validationGapPp ?? -Infinity)) best = candidate;
  }
  return best?.name ?? null;
}

function beatsOnValidation(candidate: WindowScore, current: WindowScore): boolean {
  if (candidate.meanStrategyReturnPct == null || current.meanStrategyReturnPct == null) return false;
  if (candidate.maxDrawdownPct == null || current.maxDrawdownPct == null) return false;
  const drawdownWorse = current.maxDrawdownPct - candidate.maxDrawdownPct;
  if (drawdownWorse > DRAWDOWN_SLACK_PP) return false;
  return candidate.meanStrategyReturnPct > current.meanStrategyReturnPct + RETURN_HURDLE_PP;
}

function eligibility(
  name: RuleName,
  bot: "stox" | "koins",
  validation: EdgeRow[],
  fit: EdgeRow[],
  pack: Pack
): { eligible: boolean; reason: string } {
  if (name === "onchain-gate" && bot !== "koins") return { eligible: false, reason: "On-chain series is a coin proxy." };
  if (name === "index-gate" && bot === "koins") return { eligible: false, reason: "No equity index on the coin book." };
  if (name === "fx-gate" && bot === "koins") return { eligible: false, reason: "No local currency series on the coin book." };
  if ((name === "ridge" || name === "gbm") && (name === "ridge" ? !pack.ridge : !pack.gbm)) {
    return { eligible: false, reason: "The fit window did not have enough rows." };
  }
  if (name === "meta-label" && !pack.meta) return { eligible: false, reason: "Fewer than 40 scored longs in the fit window." };
  if (name === "vol-garch-size" && !(pack.volTargetGarch > 0)) return { eligible: false, reason: "GARCH variance was not fit." };
  if (name === "hmm-gate" || name === "hmm-timing") {
    const known = validation.filter((row) => row.regimeBullFit != null).length;
    if (known < validation.length * 0.8) return { eligible: false, reason: "Regime probability was missing on the validation window." };
  }
  if (name === "index-gate") {
    const known = validation.filter((row) => row.indexRet20 != null).length;
    if (known < validation.length * 0.8) return { eligible: false, reason: "Index history did not cover the validation window." };
  }
  if (name === "onchain-gate") {
    const known = validation.filter((row) => row.onchainRet20 != null).length;
    if (known < validation.length * 0.8) return { eligible: false, reason: "On-chain history did not cover the validation window." };
  }
  if (name === "fx-gate") {
    const known = fit.filter((row) => row.market === "NZX" || row.market === "ASX").length;
    if (!known) return { eligible: false, reason: "No NZX or ASX names in the fit window." };
  }
  return { eligible: true, reason: "Scored." };
}

function scoreRule(rows: EdgeRow[], name: RuleName | "current", pack: Pack, which: "fit" | "refit"): WindowScore {
  const weights = rows.map((row) => weightOf(row, name, pack, which));
  const probs = probabilityOf(rows, name, pack);
  return scorePath(rows, weights, probs);
}

function weightOf(row: EdgeRow, name: RuleName | "current", pack: Pack, which: "fit" | "refit"): number {
  const current = row.score >= 58 && row.driftPct > 0 ? 1 : 0;
  const regime = which === "fit" ? row.regimeBullFit : row.regimeBullRefit;
  const garch = which === "fit" ? row.garchSigmaFit : row.garchSigmaRefit;
  if (name === "current") return current;
  if (name === "xs-basket-momentum") return row.csRankBasket != null && row.csRankBasket >= 2 / 3 ? 1 : 0;
  if (name === "xs-market-momentum") return row.csRankMarket != null && row.csRankMarket >= 2 / 3 ? 1 : 0;
  if (name === "xs-basket-reversal") return row.csRankBasket != null && row.csRankBasket <= 1 / 3 ? 1 : 0;
  if (name === "momentum-plus-reversal") {
    return row.csRankBasket != null && row.csRankBasket >= 2 / 3 && row.ret5 < 0 ? 1 : 0;
  }
  if (name === "breadth-gate") return current && row.breadth != null && row.breadth >= 0.5 ? 1 : 0;
  if (name === "index-gate") return current && row.indexRet20 != null && row.indexRet20 > 0 ? 1 : 0;
  if (name === "fx-gate") {
    if (row.fxRet20 == null) return current;
    return current && row.fxRet20 > 0 ? 1 : 0;
  }
  if (name === "onchain-gate") return current && row.onchainRet20 != null && row.onchainRet20 > 0 ? 1 : 0;
  if (name === "vol-ewma-size") {
    if (!current || !(row.ewmaSigma7 > 0) || !(pack.volTargetEwma > 0)) return 0;
    return Math.min(1, pack.volTargetEwma / row.ewmaSigma7);
  }
  if (name === "vol-garch-size") {
    if (!current || !(garch && garch > 0) || !(pack.volTargetGarch > 0)) return 0;
    return Math.min(1, pack.volTargetGarch / garch);
  }
  if (name === "hmm-gate") return current && regime != null && regime >= 0.5 ? 1 : 0;
  if (name === "hmm-timing") return regime != null && regime >= 0.5 ? 1 : 0;
  if (name === "ridge" && pack.ridge) {
    const predicted = predictLinear(pack.ridge, featuresOf(row));
    return predicted > row.costPct ? 1 : 0;
  }
  if (name === "gbm" && pack.gbm) {
    const predicted = predictStumps(pack.gbm, featuresOf(row));
    return predicted > row.costPct ? 1 : 0;
  }
  if (name === "meta-label" && pack.meta) {
    const probability = clamp01(predictLinear(pack.meta.model, featuresOf(row)));
    return current && probability >= pack.meta.threshold ? 1 : 0;
  }
  return 0;
}

function probabilityOf(rows: EdgeRow[], name: RuleName | "current", pack: Pack): Array<number | null> {
  if (name === "meta-label" && pack.meta) {
    return rows.map((row) => clamp01(predictLinear(pack.meta!.model, featuresOf(row))));
  }
  return rows.map(() => null);
}

function scorePath(rows: EdgeRow[], weights: number[], probs: Array<number | null>): WindowScore {
  const hits: number[] = [];
  const up: number[] = [];
  const mom: number[] = [];
  const brier: number[] = [];
  const byDate = new Map<string, { strategy: number[]; hold: number[] }>();
  rows.forEach((row, index) => {
    const weight = weights[index] ?? 0;
    if (weight > 0 && Math.abs(row.realizedPct) >= 0.05) hits.push(row.realizedPct > 0 ? 1 : 0);
    if (Math.abs(row.realizedPct) >= 0.05) {
      up.push(row.realizedPct > 0 ? 1 : 0);
      if (Math.abs(row.prior7Pct) >= 0.05) mom.push(Math.sign(row.realizedPct) === Math.sign(row.prior7Pct) ? 1 : 0);
    }
    const probability = probs[index];
    if (probability != null && row.hit != null && weight > 0) brier.push((probability - row.hit) ** 2);
    const bucket = byDate.get(row.date) || { strategy: [], hold: [] };
    bucket.strategy.push(weight * row.realizedPct - weight * row.costPct);
    bucket.hold.push(row.realizedPct);
    byDate.set(row.date, bucket);
  });
  const ordered = [...byDate.keys()].sort();
  const strategy = ordered.map((date) => avg(byDate.get(date)?.strategy || []));
  const hold = ordered.map((date) => avg(byDate.get(date)?.hold || []));
  return {
    n: rows.length,
    longs: weights.filter((weight) => weight > 0).length,
    hitRate: avgOrNull(hits),
    alwaysUpHitRate: avgOrNull(up),
    momentumHitRate: avgOrNull(mom),
    brier: avgOrNull(brier),
    coverage: null,
    meanStrategyReturnPct: avgOrNull(strategy),
    meanBuyHoldReturnPct: avgOrNull(hold),
    maxDrawdownPct: maxDrawdown(strategy),
    buyHoldMaxDrawdownPct: maxDrawdown(hold),
  };
}

function windowFromBaseline(source: {
  n: number;
  hitRate: number | null;
  alwaysUpHitRate: number | null;
  momentumHitRate: number | null;
  brier: number | null;
  coverage: number | null;
  meanStrategyReturnPct: number | null;
  meanBuyHoldReturnPct: number | null;
  maxDrawdownPct: number | null;
  buyHoldMaxDrawdownPct: number | null;
}): WindowScore {
  return {
    n: source.n,
    longs: source.n,
    hitRate: source.hitRate,
    alwaysUpHitRate: source.alwaysUpHitRate,
    momentumHitRate: source.momentumHitRate,
    brier: source.brier,
    coverage: source.coverage,
    meanStrategyReturnPct: source.meanStrategyReturnPct,
    meanBuyHoldReturnPct: source.meanBuyHoldReturnPct,
    maxDrawdownPct: source.maxDrawdownPct,
    buyHoldMaxDrawdownPct: source.buyHoldMaxDrawdownPct,
  };
}

function buildPack(rows: EdgeRow[], which: "fit" | "refit"): Pack {
  const ridge = fitRidge(rows, rows.map((row) => row.realizedPct));
  const gbm = rows.length >= 80 ? fitStumps(rows.map(featuresOf), rows.map((row) => row.realizedPct)) : null;
  const metaRows = rows.filter((row) => row.score >= 58 && row.driftPct > 0 && row.hit != null);
  let meta: Pack["meta"] = null;
  if (metaRows.length >= 40) {
    const model = fitRidge(
      metaRows,
      metaRows.map((row) => row.hit as number)
    );
    if (model) {
      const threshold = pickMetaThreshold(rows, model);
      meta = { model, threshold };
    }
  }
  const ewma = rows.map((row) => row.ewmaSigma7).filter((value) => value > 0).sort((a, b) => a - b);
  const garchValues = rows
    .map((row) => (which === "fit" ? row.garchSigmaFit : row.garchSigmaRefit))
    .filter((value): value is number => value != null && value > 0)
    .sort((a, b) => a - b);
  return {
    ridge,
    gbm,
    meta,
    volTargetEwma: ewma.length ? ewma[Math.floor(ewma.length / 2)] : 0,
    volTargetGarch: garchValues.length ? garchValues[Math.floor(garchValues.length / 2)] : 0,
  };
}

function pickMetaThreshold(rows: EdgeRow[], model: LinearModel): number {
  let best: number = META_THRESHOLDS[0];
  let bestMean = -Infinity;
  for (const threshold of META_THRESHOLDS) {
    const weights = rows.map((row) => (clamp01(predictLinear(model, featuresOf(row))) >= threshold ? 1 : 0));
    const mean = scorePath(rows, weights, rows.map(() => null)).meanStrategyReturnPct;
    if (mean != null && mean > bestMean) {
      bestMean = mean;
      best = threshold;
    }
  }
  return best;
}

function featuresOf(row: EdgeRow): number[] {
  return [
    row.ret5,
    row.ret20,
    row.ret60,
    row.vol20,
    row.volumeRatio ?? 0,
    row.smaGap,
    row.csRankBasket ?? 0.5,
    row.breadth ?? 0.5,
    row.indexRet20 ?? 0,
    row.indexRet20 == null ? 1 : 0,
    row.fxRet20 ?? 0,
    row.fxRet20 == null ? 1 : 0,
    row.onchainRet20 ?? 0,
    row.onchainRet20 == null ? 1 : 0,
    row.score,
    row.driftPct,
    row.confidence,
  ];
}

function fitRidge(rows: EdgeRow[], target: number[]): LinearModel | null {
  if (rows.length < 80 || rows.length !== target.length) return null;
  const raw = rows.map(featuresOf);
  const { mean, std, z } = standardize(raw);
  const beta = ridgeBeta(z, target, RIDGE_LAMBDA);
  if (!beta) return null;
  return { beta, mean, std };
}

function standardize(raw: number[][]): { mean: number[]; std: number[]; z: number[][] } {
  const width = raw[0]?.length ?? 0;
  const mean = Array(width).fill(0);
  const std = Array(width).fill(0);
  for (const row of raw) for (let column = 0; column < width; column++) mean[column] += row[column];
  for (let column = 0; column < width; column++) mean[column] /= raw.length;
  for (const row of raw) {
    for (let column = 0; column < width; column++) std[column] += (row[column] - mean[column]) ** 2;
  }
  for (let column = 0; column < width; column++) {
    std[column] = Math.sqrt(std[column] / Math.max(1, raw.length - 1));
    if (!(std[column] > 1e-8)) std[column] = 1;
  }
  const z = raw.map((row) => row.map((value, column) => (value - mean[column]) / std[column]));
  return { mean, std, z };
}

function predictLinear(model: LinearModel, features: number[]): number {
  let value = model.beta[0] ?? 0;
  for (let column = 0; column < features.length; column++) {
    const z = (features[column] - model.mean[column]) / model.std[column];
    value += (model.beta[column + 1] ?? 0) * z;
  }
  return value;
}

function ridgeBeta(z: number[][], target: number[], lambda: number): number[] | null {
  const width = z[0].length + 1;
  const xtx = Array.from({ length: width }, () => Array(width).fill(0));
  const xty = Array(width).fill(0);
  for (let rowIndex = 0; rowIndex < z.length; rowIndex++) {
    const row = [1, ...z[rowIndex]];
    for (let column = 0; column < width; column++) {
      xty[column] += row[column] * target[rowIndex];
      for (let other = 0; other < width; other++) xtx[column][other] += row[column] * row[other];
    }
  }
  for (let column = 1; column < width; column++) xtx[column][column] += lambda;
  return solveLinear(xtx, xty);
}

function solveLinear(matrix: number[][], vector: number[]): number[] | null {
  const size = vector.length;
  const work = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < size; column++) {
    let pivot = column;
    for (let row = column + 1; row < size; row++) {
      if (Math.abs(work[row][column]) > Math.abs(work[pivot][column])) pivot = row;
    }
    if (!(Math.abs(work[pivot][column]) > 1e-12)) return null;
    [work[column], work[pivot]] = [work[pivot], work[column]];
    const divisor = work[column][column];
    for (let cursor = column; cursor <= size; cursor++) work[column][cursor] /= divisor;
    for (let row = 0; row < size; row++) {
      if (row === column) continue;
      const factor = work[row][column];
      for (let cursor = column; cursor <= size; cursor++) work[row][cursor] -= factor * work[column][cursor];
    }
  }
  return work.map((row) => row[size]);
}

function fitStumps(features: number[][], target: number[]): Stump[] {
  const prediction = Array(target.length).fill(0);
  const stumps: Stump[] = [];
  const cuts = [0.2, 0.4, 0.5, 0.6, 0.8];
  const width = features[0]?.length ?? 0;
  for (let tree = 0; tree < GBM_TREES; tree++) {
    const residual = target.map((value, index) => value - prediction[index]);
    let best: Stump | null = null;
    let bestLoss = Infinity;
    for (let feature = 0; feature < width; feature++) {
      const values = features.map((row) => row[feature]).filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
      if (values.length < 40) continue;
      for (const quantileCut of cuts) {
        const threshold = values[Math.floor((values.length - 1) * quantileCut)];
        let leftSum = 0;
        let leftCount = 0;
        let rightSum = 0;
        let rightCount = 0;
        for (let index = 0; index < features.length; index++) {
          if (features[index][feature] <= threshold) {
            leftSum += residual[index];
            leftCount++;
          } else {
            rightSum += residual[index];
            rightCount++;
          }
        }
        if (leftCount < 20 || rightCount < 20) continue;
        const left = leftSum / leftCount;
        const right = rightSum / rightCount;
        let loss = 0;
        for (let index = 0; index < features.length; index++) {
          const error = residual[index] - (features[index][feature] <= threshold ? left : right);
          loss += error * error;
        }
        if (loss < bestLoss) {
          bestLoss = loss;
          best = { feature, threshold, left, right };
        }
      }
    }
    if (!best) break;
    stumps.push(best);
    for (let index = 0; index < features.length; index++) {
      const leaf = features[index][best.feature] <= best.threshold ? best.left : best.right;
      prediction[index] += GBM_LEARNING_RATE * leaf;
    }
  }
  return stumps;
}

function predictStumps(stumps: Stump[], features: number[]): number {
  let value = 0;
  for (const stump of stumps) {
    const leaf = features[stump.feature] <= stump.threshold ? stump.left : stump.right;
    value += GBM_LEARNING_RATE * leaf;
  }
  return value;
}

function rangeResults(fit: EdgeRow[], validation: EdgeRow[], test: EdgeRow[]): RangeResult[] {
  const specs: Array<{ name: string; sigma: (row: EdgeRow, which: "fit" | "refit") => number }> = [
    { name: "model-sigma", sigma: (row) => row.sigma7Pct },
    { name: "ewma-sigma", sigma: (row) => row.ewmaSigma7 },
    { name: "garch-sigma", sigma: (row, which) => (which === "fit" ? row.garchSigmaFit : row.garchSigmaRefit) ?? 0 },
  ];
  const baselineFit = fitBand(fit, (row) => row.sigma7Pct);
  const baselineRefit = fitBand([...fit, ...validation], (row) => row.sigma7Pct);
  const results: RangeResult[] = [];
  for (const spec of specs) {
    const fitOnly = fitBand(fit, (row) => spec.sigma(row, "fit"));
    const refit = fitBand([...fit, ...validation], (row) => spec.sigma(row, "refit"));
    const validationCoverage = coverage(validation, fitOnly, (row) => spec.sigma(row, "fit"));
    const testCoverage = coverage(test, refit, (row) => spec.sigma(row, "refit"));
    results.push({
      name: spec.name,
      validationCoverage,
      testCoverage,
      validationError: validationCoverage == null ? null : Math.abs(validationCoverage - 0.5),
      testError: testCoverage == null ? null : Math.abs(testCoverage - 0.5),
    });
  }
  const volCut = median(fit.map((row) => row.vol20).filter((value) => value > 0));
  if (volCut != null) {
    const lowFit = fit.filter((row) => row.vol20 <= volCut);
    const highFit = fit.filter((row) => row.vol20 > volCut);
    const lowBand = fitBand(lowFit, (row) => row.sigma7Pct);
    const highBand = fitBand(highFit, (row) => row.sigma7Pct);
    const lowRefit = fitBand(
      [...fit, ...validation].filter((row) => row.vol20 <= volCut),
      (row) => row.sigma7Pct
    );
    const highRefit = fitBand(
      [...fit, ...validation].filter((row) => row.vol20 > volCut),
      (row) => row.sigma7Pct
    );
    const validationCoverage = coverageSplit(validation, volCut, lowBand, highBand);
    const testCoverage = coverageSplit(test, volCut, lowRefit, highRefit);
    results.push({
      name: "vol-split",
      validationCoverage,
      testCoverage,
      validationError: validationCoverage == null ? null : Math.abs(validationCoverage - 0.5),
      testError: testCoverage == null ? null : Math.abs(testCoverage - 0.5),
    });
  }
  // The baseline is recorded so the hurdle is visible. It is not a candidate to replace itself.
  results.unshift({
    name: "current-residual",
    validationCoverage: coverage(validation, baselineFit, (row) => row.sigma7Pct),
    testCoverage: coverage(test, baselineRefit, (row) => row.sigma7Pct),
    validationError: null,
    testError: null,
  });
  const current = results[0];
  current.validationError = current.validationCoverage == null ? null : Math.abs(current.validationCoverage - 0.5);
  current.testError = current.testCoverage == null ? null : Math.abs(current.testCoverage - 0.5);
  return results;
}

function pickRange(results: RangeResult[]): string | null {
  const current = results.find((row) => row.name === "current-residual");
  if (!current || current.validationError == null || current.testError == null) return null;
  let best: RangeResult | null = null;
  for (const result of results) {
    if (result.name === "current-residual" || result.validationError == null || result.testError == null) continue;
    if (current.validationError - result.validationError < COVERAGE_HURDLE) continue;
    if (current.testError - result.testError < COVERAGE_TEST_MARGIN) continue;
    if (!best || (result.validationError ?? 1) < (best.validationError ?? 1)) best = result;
  }
  return best?.name ?? null;
}

function fitBand(rows: EdgeRow[], sigmaOf: (row: EdgeRow) => number): { q25: number; q75: number } {
  const z: number[] = [];
  for (const row of rows) {
    const sigma = sigmaOf(row);
    if (!(sigma > 0)) continue;
    z.push((row.realizedPct - row.driftPct) / sigma);
  }
  if (z.length < 30) return { q25: -0.674, q75: 0.674 };
  return { q25: quantile(z, 0.25), q75: quantile(z, 0.75) };
}

function coverage(rows: EdgeRow[], band: { q25: number; q75: number }, sigmaOf: (row: EdgeRow) => number): number | null {
  if (!rows.length) return null;
  let hits = 0;
  for (const row of rows) {
    const sigma = sigmaOf(row);
    const low = row.driftPct + band.q25 * sigma;
    const high = row.driftPct + band.q75 * sigma;
    if (row.realizedPct >= Math.min(low, high) && row.realizedPct <= Math.max(low, high)) hits++;
  }
  return hits / rows.length;
}

function coverageSplit(
  rows: EdgeRow[],
  cut: number,
  lowBand: { q25: number; q75: number },
  highBand: { q25: number; q75: number }
): number | null {
  if (!rows.length) return null;
  let hits = 0;
  for (const row of rows) {
    const band = row.vol20 > cut ? highBand : lowBand;
    const low = row.driftPct + band.q25 * row.sigma7Pct;
    const high = row.driftPct + band.q75 * row.sigma7Pct;
    if (row.realizedPct >= Math.min(low, high) && row.realizedPct <= Math.max(low, high)) hits++;
  }
  return hits / rows.length;
}

export function buildEdgeRows(bars: DailyBar[]): EdgeRow[] {
  const bySymbol = new Map<string, DailyBar[]>();
  for (const bar of bars) {
    const list = bySymbol.get(bar.symbol) || [];
    list.push(bar);
    bySymbol.set(bar.symbol, list);
  }
  const rows: EdgeRow[] = [];
  for (const list of bySymbol.values()) {
    const ordered = [...list].sort((a, b) => a.date.localeCompare(b.date));
    const closes = ordered.map((bar) => bar.close);
    const ewma = ewmaSigma7(closes);
    const indexByDate = new Map(ordered.map((bar, index) => [bar.date, index]));
    for (const decision of decisionsForSymbol(ordered)) {
      const index = indexByDate.get(decision.date);
      if (index == null) continue;
      rows.push({
        symbol: decision.symbol,
        market: decision.market,
        bot: decision.market === "CRYPTO" ? "koins" : "stox",
        date: decision.date,
        close: decision.close,
        realizedPct: decision.realizedPct,
        prior7Pct: decision.prior7Pct,
        score: decision.score,
        driftPct: decision.driftPct,
        confidence: decision.confidence,
        sigma7Pct: decision.sigma7Pct,
        hit: decision.hit,
        ret5: trailingReturn(closes, index, 5),
        ret20: trailingReturn(closes, index, 20),
        ret60: trailingReturn(closes, index, 60),
        vol20: rollingVol(closes, index, 20),
        ewmaSigma7: ewma[index] ?? 0,
        volumeRatio: decision.volumeRatio,
        smaGap: gapFromAverage(closes, index, 50),
        costPct: 2 * oneWayCostPct(decision.market, decision.close),
        csRankBasket: null,
        csRankMarket: null,
        breadth: null,
        indexRet20: null,
        fxRet20: null,
        onchainRet20: null,
        regimeBullFit: null,
        regimeBullRefit: null,
        garchSigmaFit: null,
        garchSigmaRefit: null,
      });
    }
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.symbol.localeCompare(b.symbol));
  return rows;
}

/** A later close must not change features that were fixed on the decision date. */
export function featuresIgnoreFuture(bars: DailyBar[]): boolean {
  const ordered = [...bars].sort((a, b) => a.date.localeCompare(b.date));
  if (ordered.length < 80) return false;
  const index = 60;
  const later = ordered.map((bar, cursor) => (cursor > index ? { ...bar, close: bar.close * 3 } : bar));
  const before = buildEdgeRows(ordered).find((row) => row.date === ordered[index].date);
  const after = buildEdgeRows(later).find((row) => row.date === ordered[index].date);
  if (!before || !after) return false;
  return before.ret20 === after.ret20 && before.vol20 === after.vol20 && before.ewmaSigma7 === after.ewmaSigma7 && before.score === after.score;
}

function assignRanks(rows: EdgeRow[]): void {
  const baskets = new Map<string, EdgeRow[]>();
  for (const row of rows) {
    const key = `${row.bot}|${row.date}`;
    const list = baskets.get(key) || [];
    list.push(row);
    baskets.set(key, list);
  }
  for (const group of baskets.values()) rankGroup(group, "basket");
  const markets = new Map<string, EdgeRow[]>();
  for (const row of rows) {
    const key = `${row.market}|${row.date}`;
    const list = markets.get(key) || [];
    list.push(row);
    markets.set(key, list);
  }
  for (const group of markets.values()) rankGroup(group, "market");
}

function rankGroup(group: EdgeRow[], kind: "basket" | "market"): void {
  const usable = group.filter((row) => Number.isFinite(row.ret20));
  if (usable.length < 6) return;
  const breadth = usable.filter((row) => row.ret20 > 0).length / usable.length;
  for (const row of usable) {
    const below = usable.filter((other) => other.ret20 < row.ret20).length;
    const rank = below / (usable.length - 1);
    if (kind === "basket") {
      row.csRankBasket = rank;
      row.breadth = breadth;
    } else {
      row.csRankMarket = rank;
    }
  }
}

function attachContext(rows: EdgeRow[], bars: DailyBar[], context: ContextPoint[], fitCut: string): string[] {
  const notes: string[] = [];
  const bySymbol = new Map<string, ContextPoint[]>();
  for (const point of context) {
    const list = bySymbol.get(point.symbol) || [];
    list.push(point);
    bySymbol.set(point.symbol, list);
  }
  for (const list of bySymbol.values()) list.sort((a, b) => a.date.localeCompare(b.date));
  const fitDates = [...new Set(rows.filter((row) => row.date < fitCut).map((row) => row.date))];
  const usable = new Map<string, boolean>();
  for (const [symbol, list] of bySymbol) {
    const covered = fitDates.filter((date) => lastPoint(list, date) != null).length;
    const ok = fitDates.length > 0 && covered >= fitDates.length * 0.8;
    usable.set(symbol, ok);
    const first = list[0]?.date ?? "n/a";
    const last = list[list.length - 1]?.date ?? "n/a";
    notes.push(
      ok
        ? `${symbol} (${list[0]?.kind ?? "series"}) ${first} to ${last}, used. Delayed public series, not a licensed feed.`
        : `${symbol} (${list[0]?.kind ?? "series"}) ${first} to ${last}, not used. It does not cover the fit window, which ends ${fitCut}.`
    );
  }
  const btc = bars
    .filter((bar) => bar.symbol === "BTC-USD")
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((bar) => ({ symbol: "BTC-USD", kind: "coin", date: bar.date, value: bar.close }));
  notes.push(
    "BTC dominance history was not available from a free public chart in this environment, so it was not used. Coin rows use BTC's own 20-session return minus that coin's 20-session return instead. That is relative strength, not dominance."
  );
  notes.push("Binance funding history was not reachable from this environment (HTTP 451). OKX funding is kept only when it covers the fit window.");
  for (const row of rows) {
    const indexSymbol = row.market === "NZX" ? "^NZ50" : row.market === "ASX" ? "^AXJO" : row.market === "US" ? "^GSPC" : null;
    const fxSymbol = row.market === "NZX" ? "NZDUSD=X" : row.market === "ASX" ? "AUDUSD=X" : null;
    if (indexSymbol && usable.get(indexSymbol)) row.indexRet20 = trailingContextReturn(bySymbol.get(indexSymbol) || [], row.date, 20);
    if (fxSymbol && usable.get(fxSymbol)) row.fxRet20 = trailingContextReturn(bySymbol.get(fxSymbol) || [], row.date, 20);
    if (row.bot === "koins" && usable.get("BTC-TX")) row.onchainRet20 = trailingContextReturn(bySymbol.get("BTC-TX") || [], row.date, 20);
    if (row.bot === "koins") {
      const strength = trailingContextReturn(btc, row.date, 20);
      if (strength != null && row.ret20 != null) row.indexRet20 = strength - row.ret20;
    }
  }
  return notes;
}

function attachGarch(rows: EdgeRow[], bars: DailyBar[], fitCut: string, testFrom: string): void {
  for (const bot of ["stox", "koins"] as const) {
    const symbols = [...new Set(rows.filter((row) => row.bot === bot).map((row) => row.symbol))];
    const series = new Map<string, { date: string; close: number }[]>();
    for (const symbol of symbols) {
      series.set(
        symbol,
        bars
          .filter((bar) => bar.symbol === symbol)
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((bar) => ({ date: bar.date, close: bar.close }))
      );
    }
    const fitParams = fitGarch(series, fitCut);
    const refitParams = fitGarch(series, testFrom);
    for (const symbol of symbols) {
      const pathFit = fitParams ? garchSigmaPath(series.get(symbol) || [], fitParams) : new Map<string, number>();
      const pathRefit = refitParams ? garchSigmaPath(series.get(symbol) || [], refitParams) : new Map<string, number>();
      for (const row of rows) {
        if (row.symbol !== symbol) continue;
        row.garchSigmaFit = pathFit.get(row.date) ?? null;
        row.garchSigmaRefit = pathRefit.get(row.date) ?? null;
      }
    }
  }
}

function fitGarch(
  series: Map<string, { date: string; close: number }[]>,
  cut: string
): { omega: number; alpha: number; beta: number } | null {
  const returns: number[][] = [];
  for (const points of series.values()) {
    const slice: number[] = [];
    for (let index = 1; index < points.length; index++) {
      if (points[index].date >= cut) break;
      const previous = points[index - 1].close;
      if (!(previous > 0)) continue;
      slice.push(points[index].close / previous - 1);
    }
    if (slice.length >= 30) returns.push(slice);
  }
  if (!returns.length) return null;
  const flat = returns.flat();
  const mean = flat.reduce((sum, value) => sum + value, 0) / flat.length;
  const variance = flat.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, flat.length - 1);
  if (!(variance > 0)) return null;
  let best: { omega: number; alpha: number; beta: number; loss: number } | null = null;
  for (const alpha of [0.03, 0.06, 0.1, 0.15]) {
    for (const beta of [0.8, 0.85, 0.9, 0.94]) {
      if (alpha + beta >= 0.995) continue;
      const omega = variance * (1 - alpha - beta);
      const loss = garchLoss(returns, omega, alpha, beta);
      if (!best || loss < best.loss) best = { omega, alpha, beta, loss };
    }
  }
  return best ? { omega: best.omega, alpha: best.alpha, beta: best.beta } : null;
}

function garchLoss(returns: number[][], omega: number, alpha: number, beta: number): number {
  let loss = 0;
  let count = 0;
  for (const series of returns) {
    let variance = series.slice(0, 20).reduce((sum, value) => sum + value * value, 0) / 20;
    for (const value of series) {
      const squared = value * value;
      if (variance > 1e-12) {
        loss += Math.log(variance) + squared / variance;
        count++;
      }
      variance = Math.max(1e-12, omega + alpha * squared + beta * variance);
    }
  }
  return loss / Math.max(1, count);
}

function garchSigmaPath(
  points: { date: string; close: number }[],
  params: { omega: number; alpha: number; beta: number }
): Map<string, number> {
  const out = new Map<string, number>();
  if (points.length < 21) return out;
  let variance = 0;
  for (let index = 1; index <= 20 && index < points.length; index++) {
    const value = points[index].close / points[index - 1].close - 1;
    variance += value * value;
  }
  variance /= 20;
  for (let index = 1; index < points.length; index++) {
    const value = points[index].close / points[index - 1].close - 1;
    variance = Math.max(1e-12, params.omega + params.alpha * value * value + params.beta * variance);
    out.set(points[index].date, Math.sqrt(variance * 7) * 100);
  }
  return out;
}

function attachRegime(
  rows: EdgeRow[],
  bars: DailyBar[],
  context: ContextPoint[],
  fitCut: string,
  testFrom: string
): void {
  const gspc = context.filter((point) => point.symbol === "^GSPC").sort((a, b) => a.date.localeCompare(b.date));
  const btc = bars
    .filter((bar) => bar.symbol === "BTC-USD")
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((bar) => ({ date: bar.date, value: bar.close }));
  const equityFit = regimePath(gspc.map((point) => ({ date: point.date, value: point.value })), fitCut);
  const equityRefit = regimePath(gspc.map((point) => ({ date: point.date, value: point.value })), testFrom);
  const coinFit = regimePath(btc, fitCut);
  const coinRefit = regimePath(btc, testFrom);
  for (const row of rows) {
    const fitPath = row.bot === "koins" ? coinFit : equityFit;
    const refitPath = row.bot === "koins" ? coinRefit : equityRefit;
    row.regimeBullFit = probabilityAsOf(fitPath, row.date);
    row.regimeBullRefit = probabilityAsOf(refitPath, row.date);
  }
}

function regimePath(points: { date: string; value: number }[], cut: string): { dates: string[]; probs: number[] } | null {
  const returns: { date: string; value: number }[] = [];
  for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1].value;
    if (!(previous > 0)) continue;
    returns.push({ date: points[index].date, value: points[index].value / previous - 1 });
  }
  const training = returns.filter((point) => point.date < cut).map((point) => point.value);
  const model = fitHmm(training);
  if (!model) return null;
  const bull = model.mu[1] >= model.mu[0] ? 1 : 0;
  const filtered = filterHmm(returns.map((point) => point.value), model);
  return { dates: returns.map((point) => point.date), probs: filtered.map((pair) => pair[bull]) };
}

function probabilityAsOf(path: { dates: string[]; probs: number[] } | null, date: string): number | null {
  if (!path) return null;
  const index = lastDateIndex(path.dates, date);
  if (index < 0) return null;
  const value = path.probs[index];
  return Number.isFinite(value) ? value : null;
}

export function fitHmm(values: number[]): Hmm | null {
  if (values.length < 80) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted[Math.floor(sorted.length / 2)];
  const low = values.filter((value) => value <= mid);
  const high = values.filter((value) => value > mid);
  if (low.length < 10 || high.length < 10) return null;
  const mu: [number, number] = [average(low), average(high)];
  const vari: [number, number] = [sampleVariance(low, mu[0]), sampleVariance(high, mu[1])];
  const A: [[number, number], [number, number]] = [
    [0.9, 0.1],
    [0.1, 0.9],
  ];
  const pi: [number, number] = [0.5, 0.5];
  const length = values.length;
  for (let iter = 0; iter < 25; iter++) {
    const alpha: number[][] = [];
    const scale: number[] = [];
    for (let time = 0; time < length; time++) {
      const row = [0, 0];
      for (let state = 0; state < 2; state++) {
        const previous =
          time === 0 ? pi[state] : alpha[time - 1][0] * A[0][state] + alpha[time - 1][1] * A[1][state];
        row[state] = previous * gaussian(values[time], mu[state], vari[state]);
      }
      const sum = row[0] + row[1];
      scale[time] = sum > 0 ? sum : 1e-300;
      row[0] /= scale[time];
      row[1] /= scale[time];
      alpha.push(row);
    }
    const beta: number[][] = Array.from({ length }, () => [0, 0]);
    beta[length - 1] = [1, 1];
    for (let time = length - 2; time >= 0; time--) {
      for (let state = 0; state < 2; state++) {
        let sum = 0;
        for (let next = 0; next < 2; next++) {
          sum += A[state][next] * gaussian(values[time + 1], mu[next], vari[next]) * beta[time + 1][next];
        }
        beta[time][state] = sum / scale[time + 1];
      }
    }
    const xi = [
      [0, 0],
      [0, 0],
    ];
    const gammaSum = [0, 0];
    const weighted = [0, 0];
    const start = [0, 0];
    for (let time = 0; time < length; time++) {
      const normaliser = alpha[time][0] * beta[time][0] + alpha[time][1] * beta[time][1] || 1e-300;
      const gamma0 = (alpha[time][0] * beta[time][0]) / normaliser;
      const gamma1 = (alpha[time][1] * beta[time][1]) / normaliser;
      if (time === 0) {
        start[0] = gamma0;
        start[1] = gamma1;
      }
      gammaSum[0] += gamma0;
      gammaSum[1] += gamma1;
      weighted[0] += gamma0 * values[time];
      weighted[1] += gamma1 * values[time];
      if (time < length - 1) {
        let xNorm = 0;
        const step = [
          [0, 0],
          [0, 0],
        ];
        for (let state = 0; state < 2; state++) {
          for (let next = 0; next < 2; next++) {
            step[state][next] =
              alpha[time][state] * A[state][next] * gaussian(values[time + 1], mu[next], vari[next]) * beta[time + 1][next];
            xNorm += step[state][next];
          }
        }
        xNorm = xNorm || 1e-300;
        for (let state = 0; state < 2; state++) for (let next = 0; next < 2; next++) xi[state][next] += step[state][next] / xNorm;
      }
      if (time === length - 1) {
        vari[0] = Math.max(1e-8, gammaSum[0] > 1e-8 ? gammaMoment(values, alpha, beta, 0, weighted[0] / gammaSum[0]) : vari[0]);
        vari[1] = Math.max(1e-8, gammaSum[1] > 1e-8 ? gammaMoment(values, alpha, beta, 1, weighted[1] / gammaSum[1]) : vari[1]);
      }
    }
    pi[0] = start[0];
    pi[1] = start[1];
    for (let state = 0; state < 2; state++) {
      const rowSum = xi[state][0] + xi[state][1] || 1e-300;
      A[state][0] = xi[state][0] / rowSum;
      A[state][1] = xi[state][1] / rowSum;
      mu[state] = gammaSum[state] > 1e-8 ? weighted[state] / gammaSum[state] : mu[state];
    }
  }
  if (!mu.every(Number.isFinite) || !vari.every((value) => value > 0 && Number.isFinite(value))) return null;
  return { pi, A, mu, vari };
}

function gammaMoment(values: number[], alpha: number[][], beta: number[][], state: number, mean: number): number {
  let weight = 0;
  let moment = 0;
  for (let time = 0; time < values.length; time++) {
    const normaliser = alpha[time][0] * beta[time][0] + alpha[time][1] * beta[time][1] || 1e-300;
    const gamma = (alpha[time][state] * beta[time][state]) / normaliser;
    weight += gamma;
    moment += gamma * (values[time] - mean) ** 2;
  }
  return weight > 1e-8 ? moment / weight : 1e-8;
}

function filterHmm(values: number[], model: Hmm): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let prior: [number, number] = [...model.pi];
  for (const value of values) {
    const joint: [number, number] = [
      prior[0] * gaussian(value, model.mu[0], model.vari[0]),
      prior[1] * gaussian(value, model.mu[1], model.vari[1]),
    ];
    const sum = joint[0] + joint[1] || 1e-300;
    const post: [number, number] = [joint[0] / sum, joint[1] / sum];
    out.push(post);
    prior = [
      post[0] * model.A[0][0] + post[1] * model.A[1][0],
      post[0] * model.A[0][1] + post[1] * model.A[1][1],
    ];
  }
  return out;
}

function gaussian(value: number, mean: number, variance: number): number {
  const safe = variance > 1e-12 ? variance : 1e-12;
  const z = value - mean;
  return Math.exp((-0.5 * z * z) / safe) / Math.sqrt(2 * Math.PI * safe);
}

function trailingContextReturn(points: { date: string; value: number }[], date: string, sessions: number): number | null {
  if (!points.length) return null;
  const index = lastDateIndex(
    points.map((point) => point.date),
    date
  );
  if (index < sessions) return null;
  const previous = points[index - sessions]?.value;
  const current = points[index]?.value;
  if (!(previous > 0) || !Number.isFinite(current)) return null;
  return (current / previous - 1) * 100;
}

function lastPoint(points: { date: string }[], date: string): { date: string } | null {
  const index = lastDateIndex(
    points.map((point) => point.date),
    date
  );
  return index < 0 ? null : points[index];
}

function lastDateIndex(dates: string[], date: string): number {
  let low = 0;
  let high = dates.length - 1;
  let answer = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (dates[mid] <= date) {
      answer = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return answer;
}

function trailingReturn(closes: number[], index: number, lookback: number): number {
  if (index - lookback < 0 || !(closes[index - lookback] > 0)) return 0;
  return (closes[index] / closes[index - lookback] - 1) * 100;
}

function rollingVol(closes: number[], index: number, lookback: number): number {
  if (index < lookback) return 0;
  const values: number[] = [];
  for (let cursor = index - lookback + 1; cursor <= index; cursor++) {
    const previous = closes[cursor - 1];
    if (!(previous > 0)) continue;
    values.push(closes[cursor] / previous - 1);
  }
  if (values.length < 5) return 0;
  return Math.sqrt(sampleVariance(values, average(values))) * 100;
}

function gapFromAverage(closes: number[], index: number, lookback: number): number {
  if (index + 1 < lookback) return 0;
  let sum = 0;
  for (let cursor = index - lookback + 1; cursor <= index; cursor++) sum += closes[cursor];
  const averageClose = sum / lookback;
  if (!(averageClose > 0)) return 0;
  return (closes[index] / averageClose - 1) * 100;
}

function ewmaSigma7(closes: number[]): number[] {
  const out = Array(closes.length).fill(0);
  const seed: number[] = [];
  let variance = 0;
  let started = false;
  for (let index = 1; index < closes.length; index++) {
    const previous = closes[index - 1];
    const value = previous > 0 ? closes[index] / previous - 1 : 0;
    if (!started) {
      seed.push(value);
      if (seed.length >= 20) {
        variance = sampleVariance(seed, average(seed));
        started = true;
      }
    } else {
      variance = 0.94 * variance + 0.06 * value * value;
    }
    out[index] = Math.sqrt(Math.max(variance, 0) * 7) * 100;
  }
  return out;
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sampleVariance(values: number[], mean: number): number {
  if (values.length < 2) return 1e-8;
  return Math.max(1e-8, values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1));
}

function avg(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function avgOrNull(values: number[]): number | null {
  if (!values.length) return null;
  return avg(values);
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function maxDrawdown(returnsPct: number[]): number | null {
  if (!returnsPct.length) return null;
  let equity = 1;
  let peak = 1;
  let worst = 0;
  for (const value of returnsPct) {
    equity *= 1 + value / 100;
    if (equity > peak) peak = equity;
    const drawdown = peak > 0 ? (equity / peak - 1) * 100 : 0;
    if (drawdown < worst) worst = drawdown;
  }
  return worst;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(0.98, Math.max(0.02, value));
}

const RULE_LABEL: Record<string, string> = {
  "xs-basket-momentum": "basket relative strength",
  "xs-market-momentum": "within-market relative strength",
  "xs-basket-reversal": "basket reversal",
  "momentum-plus-reversal": "strength after a short dip",
  "breadth-gate": "current rule when breadth is positive",
  "index-gate": "current rule when the index is up",
  "fx-gate": "current rule when the local currency is up",
  "vol-ewma-size": "current rule sized by smoothed volatility",
  "vol-garch-size": "current rule sized by GARCH volatility",
  "hmm-gate": "current rule in an up regime",
  "hmm-timing": "long in an up regime",
  ridge: "linear ensemble",
  gbm: "stump ensemble",
  "meta-label": "current rule only when fit probability clears",
  "onchain-gate": "current rule when transaction count is rising",
};

function ruleLabel(name: string): string {
  return RULE_LABEL[name] ?? name;
}

function pct(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `${(value * 100).toFixed(1)}%`;
}

function num(value: number | null, digits = 3): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return value.toFixed(digits);
}

function tableRow(label: string, score: WindowScore): string {
  return `| ${label} | ${score.n} | ${pct(score.hitRate)} | ${pct(score.alwaysUpHitRate)} | ${pct(score.momentumHitRate)} | ${num(score.brier, 4)} | ${pct(score.coverage)} | ${num(score.meanStrategyReturnPct, 3)} | ${num(score.meanBuyHoldReturnPct, 3)} | ${num(score.maxDrawdownPct, 2)} | ${num(score.buyHoldMaxDrawdownPct, 2)} |`;
}

const TABLE_HEADER = [
  "| Window | Decisions | Direction hit | Always-up | Momentum | Brier | 50% band coverage | Strategy mean % | Buy-and-hold mean % | Strategy max drawdown | Buy-and-hold max drawdown |",
  "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
].join("\n");

export function formatEdgeMarkdown(study: EdgeStudy): string {
  const block = (title: string, bot: BotEdge) => {
    const after = bot.shippedName
      ? bot.candidates.find((candidate) => candidate.name === bot.shippedName)?.test
      : null;
    const checked = bot.selected ? bot.candidates.find((candidate) => candidate.name === bot.selected) : null;
    const lines = [
      `### ${title}`,
      "",
      "Before is the round-1 model on the later window: the sign from the daily engine, confidence mapped to about 50%, and the residual 50% band. A candidate is eligible when the middle window beats that model's weekly return by more than 0.05 percentage points without a drawdown more than 5 points worse. It is shipped only when the later window beats both that model and buy-and-hold, and the drawdown is not more than 5 points worse.",
      "",
      TABLE_HEADER,
      tableRow("Before, later window", bot.before),
    ];
    if (after && bot.shippedName) {
      lines.push(tableRow(`After, ${ruleLabel(bot.shippedName)}`, { ...after, coverage: bot.before.coverage, brier: after.brier ?? bot.before.brier }));
    } else {
      lines.push(tableRow("After, unchanged", bot.before));
    }
    if (checked && !bot.shippedName) {
      lines.push(tableRow(`Checked (${ruleLabel(checked.name)}), not shipped`, checked.test));
    }
    const reason = confirmReason(checked?.test, bot.currentTest);
    lines.push("", bot.shippedName ? `Shipped rule: ${ruleLabel(bot.shippedName)}.` : "No rule shipped.");
    if (checked && !bot.shippedName && reason) {
      lines.push(`The middle window preferred ${ruleLabel(checked.name)}. ${reason}`);
    }
    lines.push("", "Middle-window gaps are the candidate weekly return minus the current rule. The later-window column is disclosed and was not used to pick the winner.", "");
    lines.push("| Rule | Eligible | Validation gap (pp) | Validation mean % | Validation max drawdown | Later mean % | Later max drawdown |");
    lines.push("| --- | --- | ---: | ---: | ---: | ---: | ---: |");
    lines.push(
      `| current | yes | 0 | ${num(bot.currentValidation.meanStrategyReturnPct, 3)} | ${num(bot.currentValidation.maxDrawdownPct, 2)} | ${num(bot.currentTest.meanStrategyReturnPct, 3)} | ${num(bot.currentTest.maxDrawdownPct, 2)} |`
    );
    for (const candidate of bot.candidates) {
      lines.push(
        `| ${ruleLabel(candidate.name)} | ${candidate.eligible ? "yes" : "no"} | ${candidate.validationGapPp == null ? "n/a" : num(candidate.validationGapPp, 3)} | ${num(candidate.validation.meanStrategyReturnPct, 3)} | ${num(candidate.validation.maxDrawdownPct, 2)} | ${num(candidate.test.meanStrategyReturnPct, 3)} | ${num(candidate.test.maxDrawdownPct, 2)} |`
      );
    }
    lines.push("", "50% band coverage. A replacement must be at least 1 point closer to 50% on the middle window and still closer on the later window.", "");
    lines.push("| Band | Middle-window coverage | Middle-window error | Later coverage | Later error |");
    lines.push("| --- | ---: | ---: | ---: | ---: |");
    for (const range of bot.ranges) {
      lines.push(
        `| ${range.name}${range.name === bot.shippedRange ? " (shipped)" : ""} | ${pct(range.validationCoverage)} | ${num(range.validationError, 3)} | ${pct(range.testCoverage)} | ${num(range.testError, 3)} |`
      );
    }
    lines.push("", bot.shippedRange ? `Shipped band: ${bot.shippedRange}.` : "No band shipped. The existing residual band stays.");
    return lines.join("\n");
  };
  return [
    "# Stox and Koins round-2 check",
    "",
    "Same delayed public daily closes as the first check. Not a licensed or real-time NZX, ASX, or crypto feed.",
    "Each feature uses only closes up to the decision date. The outcome is the close 7 sessions later. Decision weeks do not overlap.",
    `The fit window ends at ${study.fitThrough}. The later window starts at ${study.testFrom}. The later window was not used to choose a rule.`,
    "A long pays the same round-trip cost as the first check. Buy-and-hold on the same weeks pays no repeated cost.",
    "Direction hit for a new rule counts only the weeks that rule is long. Always-up and momentum stay on every week in the window.",
    "",
    block("Stox (NZX, ASX, US)", study.stox),
    "",
    block("Koins (major coins)", study.koins),
    "",
    "## Series that were and were not used",
    "",
    ...study.notes.map((note) => `- ${note}`),
    "",
    "Cross-sectional ranks compare the basket on that decision date. Volatility sizing uses an EWMA or a GARCH(1,1) variance frozen from the fit window, then scaled so a typical week is fully invested and a louder week is smaller. The linear model and the stump ensemble predict the next 7-day percent from momentum, reversal, volume, breadth, and the context series above. The regime filter is a two-state hidden Markov model on the S&P 500 for shares and on BTC for coins. Meta-labelling keeps a current long only when a fit-window probability clears a threshold chosen on that same fit window.",
    "",
    "This is a count of how these rules behaved on past delayed prices. It is not a forecast and it is not personal advice.",
    "",
  ].join("\n");
}
