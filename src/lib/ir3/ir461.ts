/**
 * G-31: IR461 (April 2026) FIF rules as pure functions, in whole cents (half-up).
 * Source: Inland Revenue, IR461 Guide to foreign investment funds, April 2026.
 */
import { roundMoney } from "@/lib/currency";

const c = (v: number) => Math.round(roundMoney(v) * 100);

// Quick sale adjustment and FDR: see nz-tax-calc.ts (quickSaleAdjustment, fdrForHolding), used by the FIF paper.
export { quickSaleAdjustment, fdrForHolding } from "@/lib/nz-tax-calc";

export type FifMethod = "FDR" | "CV";

/**
 * Individual's portfolio choice: CV may be used for the whole portfolio when lower than FDR;
 * the CV result cannot be less than zero (no FIF loss).
 */
export function individualFifIncome(fdrNzd: number | null, cvNzd: number | null): { method: FifMethod; incomeNzd: number } | null {
  if (fdrNzd == null) return null;
  if (cvNzd == null) return { method: "FDR", incomeNzd: roundMoney(fdrNzd) };
  const cvFloored = Math.max(0, c(cvNzd));
  return cvFloored < c(fdrNzd) ? { method: "CV", incomeNzd: cvFloored / 100 } : { method: "FDR", incomeNzd: roundMoney(fdrNzd) };
}

/**
 * Portfolio dividend withholding caps from NZ's double tax agreements, only where checked.
 * CH 15% is IR461's worked example. Anything not listed returns null (no credit asserted).
 */
export const DTA_DIVIDEND_RATE: Readonly<Record<string, number>> = { CH: 0.15, US: 0.15, AU: 0.15, GB: 0.15 };

/** Foreign tax credit: needs a DTA; capped at the DTA rate; and at the NZ tax on that income when known. */
export function foreignTaxCredit(input: { jurisdiction: string; grossNzd: number; taxPaidNzd: number; nzTaxOnIncomeNzd?: number | null }): number | null {
  const rate = DTA_DIVIDEND_RATE[input.jurisdiction];
  if (rate == null) return null;
  let cap = Math.min(c(input.taxPaidNzd), c(input.grossNzd * rate));
  if (input.nzTaxOnIncomeNzd != null) cap = Math.min(cap, c(input.nzTaxOnIncomeNzd));
  return Math.max(0, cap) / 100;
}

/** Jurisdiction from the ticker suffix (unsuffixed = US listing). */
export function jurisdictionOf(ticker: string): string {
  const t = ticker.trim().toUpperCase();
  if (t.endsWith(".AX") || t.endsWith(".ASX")) return "AU";
  if (t.endsWith(".L")) return "GB";
  if (t.endsWith(".SW")) return "CH";
  if (!t.includes(".")) return "US";
  return "XX";
}
