/**
 * b51 P0 (NZ Tax Centre): pure NZ tax calculations, to the cent, each checked against an Inland
 * Revenue worked example (see nz-tax-calc.test.ts for the citations). Indicative, not tax advice.
 *
 * - FIF: annual FDR (5% of opening market value), CV, and the individual's portfolio choice — the
 *   lower of FDR and CV, where a CV loss on the whole portfolio is reduced to zero (IR461, April 2026,
 *   "Option to compare results with CV method", Bill Murphy example).
 * - FIF: the quick sale adjustment for the FDR method — the lesser of the peak holding method amount
 *   (5% × peak holding differential × average cost) and the actual gain (IR461, "Quick sale adjustment
 *   for the FDR method", Company A example).
 * - RWT on dividends: cash (a × (b + c)) − c and non-cash a/(1 − a) × b − c, a = 33% (IR284,
 *   October 2025, "Calculating RWT on cash dividends" / "on non-cash dividends").
 */
import { roundMoney } from "@/lib/currency";

export const FDR_RATE = 0.05;
export const DIVIDEND_RWT_RATE = 0.33;

export interface FifHolding {
  openingNzd: number;
  closingNzd: number;
  /** Sale proceeds and dividends received in the year (NZD). */
  gainsNzd?: number;
  /** Purchase costs in the year (NZD). */
  costsNzd?: number;
  /** FDR quick sale adjustment for this holding (NZD), if any. */
  quickSaleNzd?: number;
}

export interface FifPortfolioResult {
  fdrNzd: number;
  /** CV total before the individual's floor (can be negative). */
  cvNzd: number;
  /** CV as an individual may return it: a portfolio loss is reduced to zero. */
  cvReturnableNzd: number;
  /** The lower of FDR and returnable CV, and which one. */
  lowerNzd: number;
  lowerMethod: "FDR" | "CV";
}

/** Annual FDR for one holding: 5% × opening market value + any quick sale adjustment. */
export function fdrForHolding(h: Pick<FifHolding, "openingNzd" | "quickSaleNzd">): number {
  return roundMoney(roundMoney(h.openingNzd * FDR_RATE) + (h.quickSaleNzd ?? 0));
}

/** CV for one holding: (closing + gains) − (opening + costs). */
export function cvForHolding(h: FifHolding): number {
  return roundMoney(h.closingNzd + (h.gainsNzd ?? 0) - (h.openingNzd + (h.costsNzd ?? 0)));
}

/**
 * An individual's FIF income for the year: the same method across the portfolio; the total CV cannot
 * be less than zero; the lower of the two may be returned.
 */
export function fifPortfolioIncome(holdings: readonly FifHolding[]): FifPortfolioResult {
  const fdrNzd = roundMoney(holdings.reduce((s, h) => s + fdrForHolding(h), 0));
  const cvNzd = roundMoney(holdings.reduce((s, h) => s + cvForHolding(h), 0));
  const cvReturnableNzd = Math.max(0, cvNzd);
  const lowerMethod = cvReturnableNzd < fdrNzd ? "CV" : "FDR";
  return { fdrNzd, cvNzd, cvReturnableNzd, lowerNzd: lowerMethod === "CV" ? cvReturnableNzd : fdrNzd, lowerMethod };
}

export interface QuickSaleEvent {
  kind: "buy" | "sell";
  shares: number;
  /** Cost of a purchase or proceeds of a disposal (NZD). */
  amountNzd: number;
}

export interface QuickSaleResult {
  peakHoldingDifferential: number;
  averageCostNzd: number;
  peakHoldingAmountNzd: number;
  actualGainNzd: number;
  /** The lesser of the two; zero when shares were not both increased and decreased in the year. */
  quickSaleAdjustmentNzd: number;
}

/**
 * FDR quick sale adjustment for one share class in one income year. Events are in date order.
 * Average cost is across all purchases in the year; the actual gain counts each disposal only to the
 * extent it follows acquisitions made earlier in the year.
 */
export function quickSaleAdjustment(openingShares: number, events: readonly QuickSaleEvent[]): QuickSaleResult {
  let held = openingShares;
  let peak = openingShares;
  let boughtShares = 0;
  let boughtCost = 0;
  for (const e of events) {
    held += e.kind === "buy" ? e.shares : -e.shares;
    if (held > peak) peak = held;
    if (e.kind === "buy") {
      boughtShares += e.shares;
      boughtCost += e.amountNzd;
    }
  }
  const closing = held;
  const sold = events.some((e) => e.kind === "sell");
  const zero = { peakHoldingDifferential: 0, averageCostNzd: 0, peakHoldingAmountNzd: 0, actualGainNzd: 0, quickSaleAdjustmentNzd: 0 };
  if (!boughtShares || !sold) return zero;
  const averageCostNzd = boughtCost / boughtShares;
  const peakHoldingDifferential = Math.min(peak - openingShares, peak - closing);
  const peakHoldingAmountNzd = roundMoney(FDR_RATE * peakHoldingDifferential * averageCostNzd);
  // Actual gain: each disposal, to the extent it follows this year's earlier acquisitions.
  let acquiredSoFar = 0;
  let matched = 0;
  let actual = 0;
  for (const e of events) {
    if (e.kind === "buy") acquiredSoFar += e.shares;
    else {
      const qty = Math.min(e.shares, Math.max(0, acquiredSoFar - matched));
      if (qty > 0) {
        actual += (e.amountNzd / e.shares) * qty - qty * averageCostNzd;
        matched += qty;
      }
    }
  }
  const actualGainNzd = roundMoney(actual);
  const quickSaleAdjustmentNzd = Math.max(0, Math.min(peakHoldingAmountNzd, actualGainNzd));
  return { peakHoldingDifferential, averageCostNzd: roundMoney(averageCostNzd), peakHoldingAmountNzd, actualGainNzd, quickSaleAdjustmentNzd };
}

/** RWT on a cash dividend: (a × (b + c)) − c, never below zero. c = imputation + foreign withholding. */
export function rwtOnCashDividend(dividendNzd: number, creditsNzd: number, rate = DIVIDEND_RWT_RATE): { rwtNzd: number; grossNzd: number; netNzd: number } {
  const rwtNzd = Math.max(0, roundMoney(rate * (dividendNzd + creditsNzd) - creditsNzd));
  return { rwtNzd, grossNzd: roundMoney(dividendNzd + creditsNzd), netNzd: roundMoney(dividendNzd - rwtNzd) };
}

/** RWT on a non-cash dividend: a / (1 − a) × b − c; the shareholder's taxable dividend is b + c + RWT. */
export function rwtOnNonCashDividend(valueNzd: number, creditsNzd: number, rate = DIVIDEND_RWT_RATE): { rwtNzd: number; taxableNzd: number } {
  const rwtNzd = Math.max(0, roundMoney((rate / (1 - rate)) * valueNzd - creditsNzd));
  return { rwtNzd, taxableNzd: roundMoney(valueNzd + creditsNzd + rwtNzd) };
}
