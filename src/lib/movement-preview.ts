/**
 * Review figures for every recorded movement. Nothing here writes the ledger.
 * Cash change is signed: a buy, withdrawal or tax line is negative.
 */

import { nativeToNzd, type CurrencyCode, type FxRatesToNZD, BASELINE_FX_TO_NZD } from "@/lib/currency";
import { suggestedFee } from "@/lib/fee-rule";

export type RecordKind =
  | "buy"
  | "sell"
  | "dividend"
  | "deposit"
  | "withdraw"
  | "tax"
  | "opening_balance"
  | "correction";

export interface MovementInput {
  type: RecordKind;
  /** yyyy-mm-dd */
  date: string;
  asset?: string;
  assetName?: string;
  quantity?: number;
  /** Native price per unit, or the NZD amount for a cash movement. */
  price?: number;
  /** Native fee. Omit to use the default of zero. */
  fee?: number | null;
  currency?: CurrencyCode;
  /** NZD received for 1 unit of the trade currency. */
  fxRate?: number;
  cashNzd: number;
  /** True when an asset was chosen. Opening balance without one is opening cash. */
  hasAsset?: boolean;
}

export interface MovementPreview {
  type: RecordKind;
  date: string;
  asset: string;
  assetName: string;
  quantity: number;
  currency: CurrencyCode;
  priceNative: number;
  priceNzd: number;
  fxRate: number;
  feeNative: number;
  feeNzd: number;
  /** Signed cash change in NZD. */
  cashChangeNzd: number;
  cashAfterNzd: number;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function ratesFor(currency: CurrencyCode, fxRate: number): FxRatesToNZD {
  const rates = { ...BASELINE_FX_TO_NZD };
  if (fxRate > 0 && currency !== "NZD") rates[currency] = fxRate;
  return rates;
}

export function buildMovementPreview(input: MovementInput): MovementPreview {
  const type = input.type;
  const currency: CurrencyCode = input.currency || "NZD";
  const fxRate = currency === "NZD" ? 1 : input.fxRate && input.fxRate > 0 ? input.fxRate : BASELINE_FX_TO_NZD[currency];
  const rates = ratesFor(currency, fxRate);
  const quantity = Math.max(0, Number(input.quantity) || 0);
  const price = Math.max(0, Number(input.price) || 0);
  const cashOnly =
    type === "deposit" ||
    type === "withdraw" ||
    type === "tax" ||
    type === "dividend" ||
    (type === "opening_balance" && !input.hasAsset) ||
    type === "correction";
  const feeNative = cashOnly
    ? Math.max(0, Number(input.fee) || 0)
    : input.fee == null
      ? suggestedFee(type, quantity, price)
      : Math.max(0, Number(input.fee) || 0);
  const feeNzd = round2(nativeToNzd(feeNative, currency, rates));
  const priceNzd = round2(nativeToNzd(price, currency, rates));
  let cashChange = 0;
  if (type === "buy") {
    cashChange = -round2(nativeToNzd(quantity * price + feeNative, currency, rates));
  } else if (type === "sell") {
    cashChange = round2(nativeToNzd(quantity * price - feeNative, currency, rates));
  } else if (type === "deposit" || type === "dividend") {
    cashChange = round2(Math.max(0, price) - (currency === "NZD" ? feeNative : feeNzd));
  } else if (type === "withdraw" || type === "tax") {
    cashChange = -round2(Math.max(0, price) + (currency === "NZD" ? feeNative : feeNzd));
  } else if (type === "opening_balance" && !input.hasAsset) {
    cashChange = round2(Math.max(0, price));
  } else {
    cashChange = 0;
  }
  const cashNzd = Number(input.cashNzd) || 0;
  return {
    type,
    date: input.date,
    asset: input.asset || "",
    assetName: input.assetName || input.asset || "",
    quantity,
    currency: cashOnly ? "NZD" : currency,
    priceNative: price,
    priceNzd,
    fxRate,
    feeNative,
    feeNzd,
    cashChangeNzd: cashChange,
    cashAfterNzd: round2(cashNzd + cashChange),
  };
}
