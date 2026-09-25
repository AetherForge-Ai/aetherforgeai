/**
 * Historical sells booked before the market fee preset was applied show a
 * blank fee. This plans the fill (and the NZ$ cash the extra fee should have
 * withheld) without writing. A row already stamped, or one with a fee, is
 * skipped so a second dry-run is empty.
 */

import { defaultFeePresetId, estimateFee, FEE_PRESETS } from "@/lib/broker-fees";
import {
  currencyForTicker,
  nativeToNzd,
  type CurrencyCode,
  type FxRatesToNZD,
  BASELINE_FX_TO_NZD,
} from "@/lib/currency";

export const SELL_FEE_BACKFILL_MARK = "sell-fee-backfill-v1";

export interface SellFeeRow {
  _id: string;
  type?: string | null;
  ticker?: string | null;
  asset_type?: string | null;
  quantity?: number | null;
  price?: number | null;
  fees?: number | null;
  fees_native?: number | null;
  fees_nzd?: number | null;
  fx_rate?: number | null;
  cash_nzd?: number | null;
  total?: number | null;
  realized_pnl?: number | null;
  currency?: string | null;
  notes?: string | null;
}

export interface SellFeePlan {
  id: string;
  ticker: string;
  presetId: string;
  feeNative: number;
  feeNzd: number;
  /** Subtract from the user's NZ$ cash (the sell credited too much). */
  cashDeltaNzd: number;
  previousCashNzd: number | null;
  nextCashNzd: number | null;
  previousRealizedNzd: number | null;
  nextRealizedNzd: number | null;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function finite(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function ratesForRow(currency: CurrencyCode, storedRate: number): FxRatesToNZD {
  const rates = { ...BASELINE_FX_TO_NZD };
  if (storedRate > 0 && currency !== "NZD") rates[currency] = storedRate;
  return rates;
}

/**
 * Market default preset for this sell (US fixed US$3, crypto/metals ~1%,
 * NZ/AU retail). Explicit "no fee" sells are indistinguishable from the bug
 * that stored nothing, so a missing fee is planned; dry-run lists every row
 * before anything is written.
 */
export function planSellFeeBackfill(row: SellFeeRow): SellFeePlan | null {
  if (String(row.type || "").toLowerCase() !== "sell") return null;
  if (String(row.notes || "").includes(SELL_FEE_BACKFILL_MARK)) return null;
  const booked = Number(row.fees_native ?? row.fees);
  if (booked > 0) return null;

  const ticker = String(row.ticker || "").trim().toUpperCase();
  if (!ticker) return null;
  const qty = Number(row.quantity) || 0;
  const price = Number(row.price) || 0;
  if (!(qty > 0) || !(price > 0)) return null;

  const presetId = defaultFeePresetId(ticker, row.asset_type);
  const preset = FEE_PRESETS.find((p) => p.id === presetId);
  if (!preset) return null;
  const feeNative = estimateFee(qty * price, preset);
  if (!(feeNative > 0)) return null;

  const currency = currencyForTicker(ticker, (row.asset_type as "stock" | "crypto" | "metal") || "stock");
  const storedRate = Number(row.fx_rate);
  const feeNzd = round2(nativeToNzd(feeNative, currency, ratesForRow(currency, storedRate)));
  if (!(feeNzd > 0)) return null;

  const previousCash = finite(row.cash_nzd) ? row.cash_nzd : finite(row.total) ? row.total : null;
  const previousRealized = finite(row.realized_pnl) ? row.realized_pnl : null;
  return {
    id: row._id,
    ticker,
    presetId,
    feeNative: round2(feeNative),
    feeNzd,
    cashDeltaNzd: round2(-feeNzd),
    previousCashNzd: previousCash == null ? null : round2(previousCash),
    nextCashNzd: previousCash == null ? null : round2(previousCash - feeNzd),
    previousRealizedNzd: previousRealized == null ? null : round2(previousRealized),
    nextRealizedNzd: previousRealized == null ? null : round2(previousRealized - feeNzd),
  };
}

export function sumSellFeeCashDelta(plans: SellFeePlan[]): number {
  return round2(plans.reduce((sum, plan) => sum + plan.cashDeltaNzd, 0));
}
