/**
 * b88 AI-BUY-1 (Lukas, 28 Oct 2026): a "Buy" label on a bot ticker card when the bot's own 7-day
 * prediction is above the current price, and a "Sell" label when it is below. Uses only the bot's
 * existing prediction; never makes one up. No prediction, no live price, no daily history, or a flat
 * prediction (within ±0.1% of the price) means no label.
 */
import type { TickerAnalysis } from "@/lib/bot-report";

export const BUY_LABEL = "Buy";
export const SELL_LABEL = "Sell";
export const LABEL_TOOLTIP = "Based on the bot's 7-day prediction versus today's price. A paper-portfolio signal only. Not financial advice.";
/** A predicted move smaller than this (in %) is flat: no label. */
export const FLAT_BAND_PCT = 0.1;

export type LabelBasis = "base-range" | "seven-day-path";
export interface DirectionLabel {
  label: typeof BUY_LABEL | typeof SELL_LABEL;
  basis: LabelBasis;
  predictedPct: number;
}

type Input = Pick<TickerAnalysis, "price" | "priceUnavailable" | "analysisUnavailable" | "call" | "shortTerm">;

/** The bot's own predicted 7-day move in %, or null when it has none. */
export function predictedMovePct(t: Input): { pct: number; basis: LabelBasis } | null {
  const price = Number(t.price);
  if (t.priceUnavailable || t.analysisUnavailable || !(price > 0) || !Number.isFinite(price)) return null;
  const base = t.call?.base;
  if (base && Number.isFinite(base[0]) && Number.isFinite(base[1]) && base[0] > 0 && base[1] > 0) {
    // The bot's 7-day base-case target: the midpoint of its base range.
    return { pct: (((base[0] + base[1]) / 2) / price - 1) * 100, basis: "base-range" };
  }
  const days = (t.shortTerm || []).filter((d) => Number.isFinite(d.movePct));
  if (days.length < 7) return null;
  return { pct: (days.reduce((acc, d) => acc * (1 + d.movePct / 100), 1) - 1) * 100, basis: "seven-day-path" };
}

export function directionLabel(t: Input): DirectionLabel | null {
  const p = predictedMovePct(t);
  if (!p || !Number.isFinite(p.pct) || Math.abs(p.pct) < FLAT_BAND_PCT) return null;
  return { label: p.pct > 0 ? BUY_LABEL : SELL_LABEL, basis: p.basis, predictedPct: Math.round(p.pct * 100) / 100 };
}
