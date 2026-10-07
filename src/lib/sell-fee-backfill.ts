/**
 * A zero or missing sell fee is the default and is left alone.
 * This planner never invents a broker preset, so a dry-run adds nothing.
 */

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

/**
 * Never proposes a fee. A stored zero, a blank fee, and a sell that already
 * booked one are all left as they are.
 */
export function planSellFeeBackfill(_row: SellFeeRow): SellFeePlan | null {
  return null;
}

export function sumSellFeeCashDelta(plans: SellFeePlan[]): number {
  return Math.round((plans.reduce((sum, plan) => sum + plan.cashDeltaNzd, 0) + Number.EPSILON) * 100) / 100;
}
