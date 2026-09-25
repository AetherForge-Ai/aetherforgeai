/**
 * Paper-trade review figures. Nothing here writes to the ledger.
 * Cash impact is signed (buys debit). NZ$ uses the same native→NZD helpers
 * as the server so a sub-1 USD quote is not applied as a multiplier.
 */

import {
  nativeToNzd,
  normalizeFxRates,
  type CurrencyCode,
  type FxRatesToNZD,
  BASELINE_FX_TO_NZD,
} from "@/lib/currency";

export type TradeSide = "buy" | "sell";

export interface TradePreviewInput {
  side: TradeSide;
  asset: string;
  assetName?: string;
  quantity: number;
  /** Native price per unit. */
  price: number;
  /** Native fee. */
  fee: number;
  currency: CurrencyCode;
  /** Current cash balance in NZD, before this trade. */
  cashNzd: number;
  rates?: FxRatesToNZD;
}

export interface TradePreview {
  side: TradeSide;
  asset: string;
  assetName: string;
  quantity: number;
  currency: CurrencyCode;
  priceNative: number;
  priceNzd: number;
  feeNative: number;
  feeNzd: number;
  /** Signed cash impact in the trade's native currency. */
  totalNative: number;
  /** Signed cash impact in NZD. */
  totalNzd: number;
  resultingCashNzd: number;
}

function round6(n: number): number {
  return Math.round((n + Number.EPSILON) * 1e6) / 1e6;
}

export function buildTradePreview(input: TradePreviewInput): TradePreview {
  const rates = normalizeFxRates(input.rates ?? BASELINE_FX_TO_NZD);
  const quantity = Math.max(0, Number(input.quantity) || 0);
  const price = Math.max(0, Number(input.price) || 0);
  const fee = Math.max(0, Number(input.fee) || 0);
  const gross = quantity * price;
  const totalNative = input.side === "buy" ? -(gross + fee) : gross - fee;
  const totalNzd = nativeToNzd(totalNative, input.currency, rates);
  const cashNzd = Number(input.cashNzd) || 0;
  return {
    side: input.side,
    asset: input.asset,
    assetName: input.assetName || input.asset,
    quantity,
    currency: input.currency,
    priceNative: price,
    priceNzd: nativeToNzd(price, input.currency, rates),
    feeNative: fee,
    feeNzd: nativeToNzd(fee, input.currency, rates),
    totalNative: round6(totalNative),
    totalNzd: round6(totalNzd),
    resultingCashNzd: round6(cashNzd + totalNzd),
  };
}
