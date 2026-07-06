/**
 * Totalum — cross-asset portfolio synthesis, optimisation, scenario & stress engine.
 *
 * This is the deterministic brain behind AetherForge's third flagship agent,
 * "Totalum — the Master Portfolio Architect". Where Stox reasons about equities
 * and Koins about crypto, Totalum unifies EVERYTHING the member owns — NZX/ASX/US
 * equities, digital assets and physical precious metals — into a single NZD-based
 * wealth system and then reasons across it:
 *
 *   • Portfolio Synthesis   — unified positions, asset-class allocation, weights
 *   • Concentration & Risk  — Herfindahl (HHI), single-name/asset-class risks
 *   • Scenario Simulator    — bull / base / bear pathways over 7/30/90d & 12mo
 *   • Stress Testing        — crypto winter, equity correction, risk-off flights
 *   • Strategy Builder      — goal-based model portfolios + rebalancing to target
 *
 * PURE module — no server-only imports, safe on client and server. The caller
 * supplies already-fetched live inputs (metals spot + FX), so this file never
 * performs I/O and stays perfectly deterministic and unit-testable.
 */

import { computeSummary, type Stock } from "@/lib/portfolio";
import {
  convertCurrency,
  BASELINE_FX_TO_NZD,
  type FxRatesToNZD,
} from "@/lib/currency";

/* ------------------------------------------------------------------ *
 * Inputs
 * ------------------------------------------------------------------ */

export type MetalKey = "gold" | "silver";

/** A member's physical precious-metal holding (as stored in `precious_metal`). */
export interface MetalHolding {
  _id: string;
  metal: MetalKey;
  ounces: number;
  /** Purchase price per troy ounce, stored in NZD. */
  purchase_price_per_oz: number;
}

/** Minimal spot shape (kept local so we never import the server-only metals lib). */
export interface MetalsSpotLite {
  gold: { nzdPerOz: number; usdPerOz: number };
  silver: { nzdPerOz: number; usdPerOz: number };
  live: boolean;
  asOf: string;
}

export interface SynthesisInput {
  stocks: Stock[];
  metals: MetalHolding[];
  spot: MetalsSpotLite;
  /** Live FX (1 unit → NZD); defaults to the baseline table. */
  fxToNZD?: FxRatesToNZD;
}

/* ------------------------------------------------------------------ *
 * Output types
 * ------------------------------------------------------------------ */

export type AssetClassKey = "equities" | "crypto" | "metals" | "cash";

export const CLASS_META: Record<
  AssetClassKey,
  { label: string; color: string; blurb: string }
> = {
  equities: { label: "Equities", color: "#10b981", blurb: "NZX · ASX · global stocks" },
  crypto: { label: "Crypto", color: "#f59e0b", blurb: "Digital assets" },
  metals: { label: "Precious Metals", color: "#eab308", blurb: "Gold & silver" },
  cash: { label: "Cash", color: "#64748b", blurb: "Dry powder & buffer" },
};

export interface UnifiedPosition {
  key: string;
  label: string;
  sublabel?: string;
  assetClass: AssetClassKey;
  valueNZD: number;
  costNZD: number;
  gainNZD: number;
  gainPct: number;
  weight: number; // % of total portfolio value
}

export interface ClassAllocation {
  assetClass: AssetClassKey;
  label: string;
  color: string;
  valueNZD: number;
  costNZD: number;
  weight: number; // %
  positions: number;
}

export interface ConcentrationRisk {
  label: string;
  weight: number;
  note: string;
  severity: "high" | "medium";
}

export interface ScenarioPoint {
  horizon: string; // "7D" | "30D" | "90D" | "12M"
  days: number;
  bullPct: number;
  basePct: number;
  bearPct: number;
  bullValue: number;
  baseValue: number;
  bearValue: number;
  bullPnl: number;
  basePnl: number;
  bearPnl: number;
}

export interface StressTest {
  key: string;
  name: string;
  description: string;
  impactNZD: number;
  impactPct: number;
  newValueNZD: number;
  severity: "low" | "medium" | "high";
}

export type GoalKey =
  | "aggressive_growth"
  | "balanced_growth"
  | "income_growth"
  | "capital_preservation"
  | "preservation_crypto";

export interface ModelPortfolio {
  key: GoalKey;
  name: string;
  description: string;
  riskLabel: string;
  targets: Record<AssetClassKey, number>; // % weights, sum = 100
}

export interface RebalanceMove {
  assetClass: AssetClassKey;
  label: string;
  color: string;
  currentWeight: number;
  targetWeight: number;
  driftPct: number; // current - target (positive = overweight)
  action: "buy" | "sell" | "hold";
  amountNZD: number; // absolute $ to move to reach target
}

export interface StrategyBlueprint {
  goal: GoalKey;
  name: string;
  description: string;
  riskLabel: string;
  targets: Record<AssetClassKey, number>;
  entryRules: string[];
  exitRules: string[];
  riskParameters: {
    maxPositionWeight: number;
    stopLossPct: number;
    cashBufferPct: number;
    rebalanceCadence: string;
  };
  rebalance: RebalanceMove[];
  projectedReturnPct: number;
  projectedVolPct: number;
  narrative: string;
}

export interface TotalumSynthesis {
  baseCurrency: "NZD";
  totalValueNZD: number;
  totalCostNZD: number;
  totalGainNZD: number;
  totalGainPct: number;
  positions: UnifiedPosition[];
  classAllocation: ClassAllocation[];
  hhi: number; // 0-10000 (Herfindahl over individual positions)
  concentrationLabel: string;
  diversificationScore: number; // 0-100
  concentrationRisks: ConcentrationRisk[];
  correlationNotes: string[];
  expectedAnnualReturnPct: number;
  expectedAnnualVolPct: number;
  scenarios: ScenarioPoint[];
  stressTests: StressTest[];
  models: ModelPortfolio[];
  metalsLive: boolean;
  asOf: string;
  spot: { goldNzdPerOz: number; silverNzdPerOz: number };
  isEmpty: boolean;
}

/* ------------------------------------------------------------------ *
 * Capital-market assumptions (annualised) per asset class.
 * Deliberately conservative, transparent priors — the engine is honest that
 * these are model assumptions, not forecasts.
 * ------------------------------------------------------------------ */

const CMA: Record<AssetClassKey, { ret: number; vol: number }> = {
  equities: { ret: 0.09, vol: 0.16 },
  crypto: { ret: 0.32, vol: 0.72 },
  metals: { ret: 0.06, vol: 0.18 },
  cash: { ret: 0.04, vol: 0.01 },
};

export const MODEL_PORTFOLIOS: ModelPortfolio[] = [
  {
    key: "aggressive_growth",
    name: "Aggressive Growth",
    description: "Maximum compounding — heavy risk-asset tilt, small metals hedge.",
    riskLabel: "High Risk",
    targets: { equities: 45, crypto: 45, metals: 5, cash: 5 },
  },
  {
    key: "balanced_growth",
    name: "Balanced Growth",
    description: "Growth core with a real-asset ballast and a healthy cash buffer.",
    riskLabel: "Balanced",
    targets: { equities: 55, crypto: 20, metals: 15, cash: 10 },
  },
  {
    key: "income_growth",
    name: "Income + Growth",
    description: "Quality equities lead, metals for stability, minimal crypto.",
    riskLabel: "Moderate",
    targets: { equities: 65, crypto: 5, metals: 20, cash: 10 },
  },
  {
    key: "capital_preservation",
    name: "Capital Preservation",
    description: "Protect capital first — heavy metals & cash, defensive equity sleeve.",
    riskLabel: "Low Risk",
    targets: { equities: 35, crypto: 0, metals: 40, cash: 25 },
  },
  {
    key: "preservation_crypto",
    name: "Preservation + Crypto Exposure",
    description: "Capital-preservation backbone with a deliberate asymmetric crypto sleeve.",
    riskLabel: "Low-Moderate",
    targets: { equities: 40, crypto: 10, metals: 35, cash: 15 },
  },
];

export function modelByKey(key?: string | null): ModelPortfolio | undefined {
  return MODEL_PORTFOLIOS.find((m) => m.key === key);
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function round(v: number, dp = 2): number {
  if (!isFinite(v)) return 0;
  const f = Math.pow(10, dp);
  return Math.round(v * f) / f;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

const HORIZONS: { horizon: string; days: number }[] = [
  { horizon: "7D", days: 7 },
  { horizon: "30D", days: 30 },
  { horizon: "90D", days: 90 },
  { horizon: "12M", days: 365 },
];

/* ------------------------------------------------------------------ *
 * Core: build the unified cross-asset synthesis
 * ------------------------------------------------------------------ */

export function buildSynthesis(input: SynthesisInput): TotalumSynthesis {
  const fx = input.fxToNZD ?? BASELINE_FX_TO_NZD;
  const stocks = input.stocks ?? [];
  const metals = input.metals ?? [];
  const spot = input.spot;

  // Equities + crypto come from the shared portfolio engine (already NZD-based).
  const summary = computeSummary(stocks, { baseCurrency: "NZD", fxToNZD: fx });

  const positions: UnifiedPosition[] = [];

  summary.holdings.forEach((h) => {
    const assetClass: AssetClassKey = h.asset_type === "crypto" ? "crypto" : "equities";
    const costNZD = convertCurrency(h.costBasis, h.currency, "NZD", fx);
    const valueNZD = h.baseValue;
    positions.push({
      key: `stk_${h._id}`,
      label: h.ticker,
      sublabel: h.company_name || undefined,
      assetClass,
      valueNZD: round(valueNZD),
      costNZD: round(costNZD),
      gainNZD: round(valueNZD - costNZD),
      gainPct: costNZD > 0 ? round(((valueNZD - costNZD) / costNZD) * 100) : 0,
      weight: 0,
    });
  });

  // Precious metals — value on today's spot, cost from the stored purchase price.
  metals.forEach((m) => {
    const ounces = Number(m.ounces) || 0;
    const nzdPerOz = m.metal === "gold" ? spot.gold.nzdPerOz : spot.silver.nzdPerOz;
    const valueNZD = ounces * nzdPerOz;
    const costNZD = ounces * (Number(m.purchase_price_per_oz) || 0);
    positions.push({
      key: `met_${m._id}`,
      label: m.metal === "gold" ? "Gold" : "Silver",
      sublabel: `${ounces} oz`,
      assetClass: "metals",
      valueNZD: round(valueNZD),
      costNZD: round(costNZD),
      gainNZD: round(valueNZD - costNZD),
      gainPct: costNZD > 0 ? round(((valueNZD - costNZD) / costNZD) * 100) : 0,
      weight: 0,
    });
  });

  const totalValueNZD = round(positions.reduce((s, p) => s + p.valueNZD, 0));
  const totalCostNZD = round(positions.reduce((s, p) => s + p.costNZD, 0));
  const totalGainNZD = round(totalValueNZD - totalCostNZD);
  const totalGainPct = totalCostNZD > 0 ? round((totalGainNZD / totalCostNZD) * 100) : 0;

  positions.forEach((p) => {
    p.weight = totalValueNZD > 0 ? round((p.valueNZD / totalValueNZD) * 100) : 0;
  });
  positions.sort((a, b) => b.valueNZD - a.valueNZD);

  // Asset-class allocation.
  const classKeys: AssetClassKey[] = ["equities", "crypto", "metals"];
  const classAllocation: ClassAllocation[] = classKeys
    .map((key) => {
      const inClass = positions.filter((p) => p.assetClass === key);
      const value = round(inClass.reduce((s, p) => s + p.valueNZD, 0));
      const cost = round(inClass.reduce((s, p) => s + p.costNZD, 0));
      return {
        assetClass: key,
        label: CLASS_META[key].label,
        color: CLASS_META[key].color,
        valueNZD: value,
        costNZD: cost,
        weight: totalValueNZD > 0 ? round((value / totalValueNZD) * 100) : 0,
        positions: inClass.length,
      };
    })
    .filter((c) => c.positions > 0);

  // Herfindahl concentration index over individual positions (0-10000).
  const hhi = round(
    positions.reduce((s, p) => s + Math.pow(p.weight, 2), 0),
    0
  );
  const concentrationLabel =
    hhi >= 4000 ? "Highly Concentrated" : hhi >= 2000 ? "Concentrated" : hhi >= 1200 ? "Moderate" : "Well Diversified";

  // Diversification score: reward multiple classes + low HHI.
  const classCount = classAllocation.length;
  const hhiScore = clamp(100 - (hhi - 1000) / 60, 0, 100);
  const classScore = clamp((classCount / 3) * 100, 0, 100);
  const diversificationScore = round(clamp(0.65 * hhiScore + 0.35 * classScore, 0, 100), 0);

  // Concentration risks — single names >25% and asset classes >70%.
  const concentrationRisks: ConcentrationRisk[] = [];
  positions.forEach((p) => {
    if (p.weight >= 25) {
      concentrationRisks.push({
        label: p.label,
        weight: p.weight,
        note: `${p.label} is ${p.weight.toFixed(1)}% of total wealth — a single-position shock hits the whole book.`,
        severity: p.weight >= 40 ? "high" : "medium",
      });
    }
  });
  classAllocation.forEach((c) => {
    if (c.weight >= 70) {
      concentrationRisks.push({
        label: `${c.label} class`,
        weight: c.weight,
        note: `${c.weight.toFixed(1)}% of the portfolio sits in ${c.label.toLowerCase()} — limited cross-asset diversification.`,
        severity: c.weight >= 85 ? "high" : "medium",
      });
    }
  });

  // Correlation notes (qualitative, deterministic).
  const correlationNotes = buildCorrelationNotes(classAllocation);

  // Expected portfolio return & volatility from class weights (fractions).
  const wByClass: Record<AssetClassKey, number> = { equities: 0, crypto: 0, metals: 0, cash: 0 };
  classAllocation.forEach((c) => {
    wByClass[c.assetClass] = c.weight / 100;
  });
  const expReturn = (Object.keys(CMA) as AssetClassKey[]).reduce(
    (s, k) => s + wByClass[k] * CMA[k].ret,
    0
  );
  // Conservative: weighted-average vol (ignores diversification benefit → upper bound).
  const expVol = (Object.keys(CMA) as AssetClassKey[]).reduce(
    (s, k) => s + wByClass[k] * CMA[k].vol,
    0
  );
  const expectedAnnualReturnPct = round(expReturn * 100, 1);
  const expectedAnnualVolPct = round(expVol * 100, 1);

  const scenarios = buildScenarios(totalValueNZD, expReturn, expVol);
  const stressTests = buildStressTests(totalValueNZD, wByClass);

  return {
    baseCurrency: "NZD",
    totalValueNZD,
    totalCostNZD,
    totalGainNZD,
    totalGainPct,
    positions,
    classAllocation,
    hhi,
    concentrationLabel,
    diversificationScore,
    concentrationRisks,
    correlationNotes,
    expectedAnnualReturnPct,
    expectedAnnualVolPct,
    scenarios,
    stressTests,
    models: MODEL_PORTFOLIOS,
    metalsLive: spot.live,
    asOf: spot.asOf,
    spot: { goldNzdPerOz: round(spot.gold.nzdPerOz), silverNzdPerOz: round(spot.silver.nzdPerOz) },
    isEmpty: positions.length === 0,
  };
}

function buildCorrelationNotes(alloc: ClassAllocation[]): string[] {
  const notes: string[] = [];
  const has = (k: AssetClassKey) => alloc.some((c) => c.assetClass === k && c.weight > 0);
  const w = (k: AssetClassKey) => alloc.find((c) => c.assetClass === k)?.weight ?? 0;

  if (has("equities") && has("crypto")) {
    notes.push(
      "Equities and crypto have become increasingly correlated in risk-off events — both can sell off together, so they diversify less than they appear during drawdowns."
    );
  }
  if (has("metals")) {
    notes.push(
      "Precious metals are your natural hedge — gold in particular is historically negatively correlated with risk assets during flights to safety."
    );
  } else {
    notes.push(
      "You hold no precious-metals hedge. A gold/silver sleeve is negatively correlated with equities & crypto in crises and can cushion drawdowns."
    );
  }
  if (w("crypto") >= 40) {
    notes.push(
      "Crypto dominates your risk budget. Its ~70% annualised volatility drives most of the portfolio's swing — size it deliberately."
    );
  }
  return notes;
}

function buildScenarios(total: number, expReturn: number, expVol: number): ScenarioPoint[] {
  const Z = 1.0; // ~1 standard deviation band for bull/bear
  return HORIZONS.map(({ horizon, days }) => {
    const t = days / 365;
    const drift = expReturn * t;
    const band = expVol * Math.sqrt(t) * Z;
    const basePct = round(drift * 100, 2);
    const bullPct = round((drift + band) * 100, 2);
    const bearPct = round((drift - band) * 100, 2);
    const baseValue = round(total * (1 + drift));
    const bullValue = round(total * (1 + drift + band));
    const bearValue = round(total * (1 + drift - band));
    return {
      horizon,
      days,
      basePct,
      bullPct,
      bearPct,
      baseValue,
      bullValue,
      bearValue,
      basePnl: round(baseValue - total),
      bullPnl: round(bullValue - total),
      bearPnl: round(bearValue - total),
    };
  });
}

interface Shock {
  key: string;
  name: string;
  description: string;
  moves: Partial<Record<AssetClassKey, number>>; // fractional shock per class
}

const STRESS_SHOCKS: Shock[] = [
  {
    key: "crypto_winter",
    name: "Crypto Winter",
    description: "Digital assets fall 45% in a prolonged bear market.",
    moves: { crypto: -0.45 },
  },
  {
    key: "equity_correction",
    name: "Equity Correction",
    description: "Global equities correct 15% on a growth scare.",
    moves: { equities: -0.15 },
  },
  {
    key: "risk_off_flight",
    name: "Risk-Off Flight to Safety",
    description: "Equities −10%, crypto −25%, gold catches a +8% safe-haven bid.",
    moves: { equities: -0.1, crypto: -0.25, metals: 0.08 },
  },
  {
    key: "severe_drawdown",
    name: "Severe Market Drawdown",
    description: "A 2008/2022-style shock: equities −25%, crypto −55%, metals −5%.",
    moves: { equities: -0.25, crypto: -0.55, metals: -0.05 },
  },
  {
    key: "gold_rally",
    name: "Precious-Metals Rally",
    description: "Monetary debasement drives gold & silver +20%.",
    moves: { metals: 0.2 },
  },
];

function buildStressTests(
  total: number,
  wByClass: Record<AssetClassKey, number>
): StressTest[] {
  if (total <= 0) return [];
  return STRESS_SHOCKS.map((shock) => {
    let impact = 0;
    (Object.keys(shock.moves) as AssetClassKey[]).forEach((k) => {
      impact += total * wByClass[k] * (shock.moves[k] || 0);
    });
    const impactPct = round((impact / total) * 100, 2);
    const absPct = Math.abs(impactPct);
    return {
      key: shock.key,
      name: shock.name,
      description: shock.description,
      impactNZD: round(impact),
      impactPct,
      newValueNZD: round(total + impact),
      severity: absPct >= 15 ? "high" : absPct >= 6 ? "medium" : "low",
    };
  });
}

/* ------------------------------------------------------------------ *
 * Strategy Builder — turn a goal into a concrete blueprint + rebalancing plan
 * ------------------------------------------------------------------ */

export function buildStrategy(synthesis: TotalumSynthesis, goal: GoalKey): StrategyBlueprint {
  const model = modelByKey(goal) ?? MODEL_PORTFOLIOS[1];
  const total = synthesis.totalValueNZD;

  // Current weights by class (cash currently 0 — members hold no tracked cash).
  const current: Record<AssetClassKey, number> = { equities: 0, crypto: 0, metals: 0, cash: 0 };
  synthesis.classAllocation.forEach((c) => {
    current[c.assetClass] = c.weight;
  });

  const classes: AssetClassKey[] = ["equities", "crypto", "metals", "cash"];
  const rebalance: RebalanceMove[] = classes.map((key) => {
    const currentWeight = round(current[key], 1);
    const targetWeight = model.targets[key];
    const driftPct = round(currentWeight - targetWeight, 1);
    const amountNZD = round((Math.abs(driftPct) / 100) * total);
    const action: RebalanceMove["action"] =
      Math.abs(driftPct) < 3 ? "hold" : driftPct > 0 ? "sell" : "buy";
    return {
      assetClass: key,
      label: CLASS_META[key].label,
      color: CLASS_META[key].color,
      currentWeight,
      targetWeight,
      driftPct,
      action,
      amountNZD,
    };
  });

  // Projected characteristics of the TARGET allocation.
  const tFrac = (k: AssetClassKey) => model.targets[k] / 100;
  const projReturn = round(
    classes.reduce((s, k) => s + tFrac(k) * CMA[k].ret, 0) * 100,
    1
  );
  const projVol = round(
    classes.reduce((s, k) => s + tFrac(k) * CMA[k].vol, 0) * 100,
    1
  );

  const riskParameters = riskParamsForGoal(goal);
  const { entryRules, exitRules } = rulesForGoal(goal, riskParameters);

  const biggestBuy = [...rebalance].filter((r) => r.action === "buy").sort((a, b) => b.amountNZD - a.amountNZD)[0];
  const biggestSell = [...rebalance].filter((r) => r.action === "sell").sort((a, b) => b.amountNZD - a.amountNZD)[0];

  const narrative =
    `The ${model.name} blueprint targets ${model.targets.equities}% equities · ` +
    `${model.targets.crypto}% crypto · ${model.targets.metals}% metals · ${model.targets.cash}% cash. ` +
    (biggestSell
      ? `Trim ~NZ$${biggestSell.amountNZD.toLocaleString()} from ${biggestSell.label.toLowerCase()} `
      : "") +
    (biggestBuy
      ? `${biggestSell ? "and rotate into" : "Deploy ~NZ$" + biggestBuy.amountNZD.toLocaleString() + " toward"} ${biggestBuy.label.toLowerCase()} `
      : "") +
    `to align with a ${model.riskLabel.toLowerCase()} posture (≈${projReturn}% expected annual return at ≈${projVol}% volatility).`;

  return {
    goal,
    name: model.name,
    description: model.description,
    riskLabel: model.riskLabel,
    targets: model.targets,
    entryRules,
    exitRules,
    riskParameters,
    rebalance,
    projectedReturnPct: projReturn,
    projectedVolPct: projVol,
    narrative,
  };
}

function riskParamsForGoal(goal: GoalKey): StrategyBlueprint["riskParameters"] {
  switch (goal) {
    case "aggressive_growth":
      return { maxPositionWeight: 25, stopLossPct: 12, cashBufferPct: 5, rebalanceCadence: "Monthly" };
    case "balanced_growth":
      return { maxPositionWeight: 20, stopLossPct: 10, cashBufferPct: 10, rebalanceCadence: "Quarterly" };
    case "income_growth":
      return { maxPositionWeight: 15, stopLossPct: 8, cashBufferPct: 10, rebalanceCadence: "Quarterly" };
    case "capital_preservation":
      return { maxPositionWeight: 12, stopLossPct: 6, cashBufferPct: 25, rebalanceCadence: "Semi-annual" };
    case "preservation_crypto":
      return { maxPositionWeight: 15, stopLossPct: 8, cashBufferPct: 15, rebalanceCadence: "Quarterly" };
  }
}

function rulesForGoal(
  goal: GoalKey,
  rp: StrategyBlueprint["riskParameters"]
): { entryRules: string[]; exitRules: string[] } {
  const common = {
    entry: [
      `Cap any single position at ${rp.maxPositionWeight}% of total wealth on entry.`,
      `Keep at least ${rp.cashBufferPct}% in cash as dry powder for volatility spikes.`,
      "Scale into new positions in 2–3 tranches rather than a single fill.",
    ],
    exit: [
      `Set a hard stop-loss ${rp.stopLossPct}% below cost on each position.`,
      `Rebalance to target weights on a ${rp.rebalanceCadence.toLowerCase()} cadence.`,
      "Trim any position that drifts more than 5% above its target weight.",
    ],
  };
  switch (goal) {
    case "aggressive_growth":
      return {
        entryRules: [
          "Concentrate into the highest-conviction Strong-Buy signals from Stox & Koins.",
          ...common.entry,
          "Add on strength — pyramid winners rather than averaging down losers.",
        ],
        exitRules: [
          "Let winners run; use trailing stops instead of fixed profit targets.",
          ...common.exit,
        ],
      };
    case "capital_preservation":
      return {
        entryRules: [
          "Favour defensive, cash-generative equities (utilities, healthcare, staples).",
          "Anchor the book with a 40% gold/silver allocation as a crisis hedge.",
          ...common.entry,
        ],
        exitRules: [
          "Cut any holding on the first flagged weakness — protect capital first.",
          ...common.exit,
        ],
      };
    case "preservation_crypto":
      return {
        entryRules: [
          "Build a preservation core (metals + quality equities) first, then add the crypto sleeve.",
          "Treat the crypto allocation as asymmetric, high-conviction, position-sized to survive a 55% drawdown.",
          ...common.entry,
        ],
        exitRules: [
          "Take profits on crypto into strength to keep the sleeve within its target weight.",
          ...common.exit,
        ],
      };
    default:
      return {
        entryRules: [
          "Hold a diversified core across at least three asset classes.",
          ...common.entry,
        ],
        exitRules: [...common.exit],
      };
  }
}
