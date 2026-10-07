/**
 * Portfolio return split: price move, dividends, and the exchange-rate move.
 */

import { nativeToNzd, type CurrencyCode, type FxRatesToNZD, BASELINE_FX_TO_NZD } from "@/lib/currency";

export interface ReturnPosition {
  quantity: number;
  costPrice: number;
  markPrice: number;
  currency: CurrencyCode;
  /** NZD per 1 unit of currency on the buy. Missing means the currency effect stays in capital gain. */
  fxAtCost?: number | null;
  fxNow: number;
}

export interface ReturnSplit {
  capitalGainNzd: number;
  incomeNzd: number;
  currencyEffectNzd: number;
  capitalNote: string;
  incomeNote: string;
  currencyNote: string;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function rates(fx: number, currency: CurrencyCode): FxRatesToNZD {
  const table = { ...BASELINE_FX_TO_NZD };
  if (currency !== "NZD" && fx > 0) table[currency] = fx;
  return table;
}

export function splitReturns(positions: ReturnPosition[], incomeNzd: number): ReturnSplit {
  let capital = 0;
  let currencyEffect = 0;
  let pricedFx = false;
  for (const p of positions) {
    const qty = Number(p.quantity) || 0;
    const cost = Number(p.costPrice) || 0;
    const mark = Number(p.markPrice) || 0;
    const fxNow = p.currency === "NZD" ? 1 : p.fxNow > 0 ? p.fxNow : BASELINE_FX_TO_NZD[p.currency];
    const priceMoveNative = (mark - cost) * qty;
    capital += nativeToNzd(priceMoveNative, p.currency, rates(fxNow, p.currency));
    const fxThen = p.currency === "NZD" ? 1 : Number(p.fxAtCost);
    if (p.currency !== "NZD" && fxThen > 0) {
      pricedFx = true;
      currencyEffect += cost * qty * (fxNow - fxThen);
    }
  }
  const income = Number(incomeNzd) || 0;
  return {
    capitalGainNzd: round2(capital),
    incomeNzd: round2(income),
    currencyEffectNzd: round2(currencyEffect),
    capitalNote:
      "Capital gain is the change in price since you bought, turned into NZ dollars at today's exchange rate. It is not a forecast.",
    incomeNote: "Income is the dividends recorded in the ledger. It is cash received, and it does not change how many units you hold.",
    currencyNote: pricedFx
      ? "Currency effect is the NZ dollar change caused only by the exchange rate moving since the buy. The price move stays in capital gain."
      : "Currency effect is the NZ dollar change caused only by the exchange rate since the buy. It is zero when the holding is in NZ dollars, or when that buy did not store an exchange rate — the price move then stays in capital gain.",
  };
}
