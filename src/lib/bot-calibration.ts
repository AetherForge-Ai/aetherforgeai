/**
 * Frozen confidence and 7-day range calibration for the real-history engine.
 * Coefficients are fit on the earlier part of the public daily sample and
 * checked on later dates. Identity coefficients leave the raw model unchanged.
 * This is general information about a model, not a personal recommendation.
 */

import { koinsModelV2Enabled } from "@/lib/koins-model-flag";

export interface PlattMap {
  a: number;
  b: number;
}

export interface ResidualBand {
  /** Residual (realized − drift) / σ7 quantiles from the fit window. */
  q25: number;
  q75: number;
}

export interface FrozenCalibration {
  enabled: boolean;
  platt: PlattMap;
  band: ResidualBand;
  /** Last decision date included in the fit, inclusive. */
  fitThrough: string;
  note: string;
}

/**
 * Filled after the walk-forward check. Identity until that check accepts a map.
 * The backtest test fails if these numbers drift from a fresh fit.
 */
export const FROZEN_CALIBRATION: FrozenCalibration = {
  enabled: true,
  platt: { a: 0.007172619713346212, b: -0.0007096405604416145 },
  band: { q25: -0.5878379713493055, q75: 0.6999198412128145 },
  fitThrough: "2024-10-24",
  note: "Validation preferred this map. It pulls stated confidence to about 50% and widens the 50% band to the fit-window residual quartiles. Test dates were not used to choose it.",
};

export function logit(p: number): number {
  const x = Math.min(0.98, Math.max(0.02, p));
  return Math.log(x / (1 - x));
}

export function sigmoid(z: number): number {
  if (z > 30) return 1;
  if (z < -30) return 0;
  return 1 / (1 + Math.exp(-z));
}

export function applyPlatt(confidence: number, map: PlattMap): number {
  const p = sigmoid(map.a + map.b * logit(confidence / 100));
  return Math.round(Math.max(5, Math.min(95, p * 100)));
}

export function applyResidualBand(
  driftPct: number,
  sigma7Pct: number,
  band: ResidualBand
): { lowPct: number; highPct: number } {
  const sigma = Number.isFinite(sigma7Pct) && sigma7Pct > 0 ? sigma7Pct : 0;
  const low = driftPct + band.q25 * sigma;
  const high = driftPct + band.q75 * sigma;
  return {
    lowPct: Math.round(Math.min(low, high) * 100) / 100,
    highPct: Math.round(Math.max(low, high) * 100) / 100,
  };
}

export function quantile(values: number[], q: number): number {
  const xs = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!xs.length) return 0;
  const pos = (xs.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return xs[lo];
  return xs[lo] * (hi - pos) + xs[hi] * (pos - lo);
}

/** Logistic map from stated confidence to the rate at which the sign was right. */
export function fitPlatt(samples: { confidence: number; hit: 0 | 1 }[]): PlattMap {
  let a = 0;
  let b = 1;
  if (samples.length < 30) return { a, b };
  for (let iter = 0; iter < 30; iter++) {
    let g0 = 0;
    let g1 = 0;
    let h00 = 0;
    let h01 = 0;
    let h11 = 0;
    for (const sample of samples) {
      const x = logit(sample.confidence / 100);
      const pred = sigmoid(a + b * x);
      const w = Math.max(1e-6, pred * (1 - pred));
      const err = pred - sample.hit;
      g0 += err;
      g1 += err * x;
      h00 += w;
      h01 += w * x;
      h11 += w * x * x;
    }
    h00 += 1e-4;
    h11 += 1e-4;
    const det = h00 * h11 - h01 * h01;
    if (!(Math.abs(det) > 1e-12)) break;
    const da = (h11 * g0 - h01 * g1) / det;
    const db = (h00 * g1 - h01 * g0) / det;
    a -= da;
    b -= db;
    if (Math.abs(da) + Math.abs(db) < 1e-8) break;
  }
  if (!Number.isFinite(a) || !Number.isFinite(b)) return { a: 0, b: 1 };
  return { a, b };
}

export function fitResidualBand(
  rows: { driftPct: number; realizedPct: number; sigma7Pct: number }[]
): ResidualBand {
  const z: number[] = [];
  for (const row of rows) {
    if (!(row.sigma7Pct > 0)) continue;
    z.push((row.realizedPct - row.driftPct) / row.sigma7Pct);
  }
  if (z.length < 30) return { q25: -0.674, q75: 0.674 };
  return { q25: quantile(z, 0.25), q75: quantile(z, 0.75) };
}

export function calibrationApplies(assetClass: "stock" | "crypto", realHistory: boolean): boolean {
  if (!realHistory || !FROZEN_CALIBRATION.enabled) return false;
  if (assetClass === "crypto") return koinsModelV2Enabled();
  return true;
}
