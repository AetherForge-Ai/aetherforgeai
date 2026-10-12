/**
 * Portfolio return split: price move, dividends, and the exchange-rate move.
 *
 * When a lot stored the buy rate, currency effect is
 * (FX at valuation − quantity-weighted FX at buy) × foreign value.
 * Foreign value is quantity times the latest price in the foreign currency.
 * The quantity-weighted buy rate is sum(q_i × fx_i) / Q.
 * Capital gain is the foreign value at that rate, minus cost at the
 * cost-weighted buy rate. Those two lines, plus income, are the economic
 * P/L. Other is only rounding.
 *
 * When the buy rate was not stored, the lines still add up to the P/L that
 * converts cost and value at today's rate. Other is that rounding gap.
 */

import {
  freshQuotedFill,
  nativeToNzd,
  nzdAtBookRate,
  roundMoney,
  type CurrencyCode,
  type FxRatesToNZD,
  BASELINE_FX_TO_NZD,
} from "@/lib/currency";

export interface ReturnPosition {
  quantity: number;
  costPrice: number;
  markPrice: number;
  currency: CurrencyCode;
  /**
   * Quantity-weighted NZD per 1 unit of currency on the open lots.
   * The currency line uses this rate. Missing means that line stays at zero.
   */
  fxAtCost?: number | null;
  /**
   * Cost-weighted NZD rate on the same lots. Cost stays on this rate.
   * When omitted, the quantity-weighted rate is used for cost as well.
   */
  costBasisFx?: number | null;
  fxNow: number;
  /** Used only so a same-day fill is treated the same way as the P/L card. */
  purchaseDate?: string | null;
}

export interface ReturnSplit {
  capitalGainNzd: number;
  incomeNzd: number;
  currencyEffectNzd: number;
  otherNzd: number;
  totalNzd: number;
  capitalNote: string;
  incomeNote: string;
  currencyNote: string;
  otherNote: string;
  totalNote: string;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function rates(fx: number, currency: CurrencyCode): FxRatesToNZD {
  const table = { ...BASELINE_FX_TO_NZD };
  if (currency !== "NZD" && fx > 0) table[currency] = fx;
  return table;
}

export function splitReturns(
  positions: ReturnPosition[],
  incomeNzd: number,
  reportedPnlNzd?: number | null
): ReturnSplit {
  let capital = 0;
  let currencyEffect = 0;
  let valueSum = 0;
  let costSum = 0;
  let pricedEconomic = 0;
  let unpricedBook = 0;
  let pricedFx = false;
  for (const p of positions) {
    const qty = Number(p.quantity) || 0;
    const cost = Number(p.costPrice) || 0;
    const rawMark = Number(p.markPrice) || 0;
    const mark = rawMark > 0 ? rawMark : cost;
    const fxNow = p.currency === "NZD" ? 1 : p.fxNow > 0 ? p.fxNow : BASELINE_FX_TO_NZD[p.currency];
    const table = rates(fxNow, p.currency);
    const fresh = freshQuotedFill(cost, mark, p.purchaseDate);
    const costNative = cost * qty;
    const markNative = mark * qty;
    const costNzd = roundMoney(nzdAtBookRate(costNative, p.currency, table));
    const valueNzd = fresh ? costNzd : roundMoney(nzdAtBookRate(markNative, p.currency, table));
    costSum += costNzd;
    valueSum += valueNzd;
    const fxQty = p.currency === "NZD" ? 1 : Number(p.fxAtCost);
    const fxCost = p.currency === "NZD" ? 1 : Number(p.costBasisFx ?? p.fxAtCost);
    const hasBuyFx = p.currency !== "NZD" && fxQty > 0 && fxCost > 0 && !fresh;
    if (hasBuyFx) {
      pricedFx = true;
      const foreignValue = mark * qty;
      capital += foreignValue * fxQty - cost * qty * fxCost;
      currencyEffect += foreignValue * (fxNow - fxQty);
      pricedEconomic += foreignValue * fxNow - cost * qty * fxCost;
    } else if (!fresh) {
      capital += nativeToNzd((mark - cost) * qty, p.currency, table);
      unpricedBook += valueNzd - costNzd;
    }
  }
  const income = round2(Number(incomeNzd) || 0);
  const capitalGainNzd = round2(capital);
  const currencyEffectNzd = round2(currencyEffect);
  const bookGain = roundMoney(valueSum - costSum);
  const reported = reportedPnlNzd == null || !Number.isFinite(Number(reportedPnlNzd)) ? bookGain : round2(Number(reportedPnlNzd));
  const anchor = pricedFx ? round2(pricedEconomic + unpricedBook) : reported;
  const otherNzd = round2(anchor - capitalGainNzd - (pricedFx ? 0 : income) - currencyEffectNzd);
  const totalNzd = round2(capitalGainNzd + income + currencyEffectNzd + otherNzd);
  return {
    capitalGainNzd,
    incomeNzd: income,
    currencyEffectNzd,
    otherNzd,
    totalNzd,
    capitalNote: pricedFx
      ? "Capital gain is the latest foreign value at the quantity-weighted buy rate, minus the cost at the cost-weighted buy rate. It is not a forecast."
      : "Capital gain is the change in price since you bought, turned into NZ dollars in one step at today's exchange rate. It is not a forecast.",
    incomeNote: "Income is the dividends recorded in the ledger. It is cash received, and it does not change how many units you hold.",
    currencyNote: pricedFx
      ? "Currency effect is (the exchange rate at valuation minus the quantity-weighted exchange rate at buy) times the foreign value of each lot. Foreign value is the quantity times the latest price in the foreign currency. The quantity-weighted rate is the sum of each open lot's quantity times its buy rate, divided by the quantity still held. Cost stays at the cost-weighted buy rate. Currency effect counts open lots only; realised FX is in Realised."
      : "Currency effect is the NZ dollar change caused only by the exchange rate since the buy. It is zero when the holding is in NZ dollars, or when that buy did not store an exchange rate. Currency effect counts open lots only; realised FX is in Realised.",
    otherNote: pricedFx
      ? "Other is rounding so these lines add up to the economic P/L. Economic P/L is the foreign value at the valuation exchange rate minus the cost at the buy's exchange rate. It stays small."
      : "Other is what is left so these lines add up to the P/L at the latest price. That P/L turns each holding's cost and its market value into NZ dollars separately, at today's rate rounded to 4 decimal places. Capital gain turns the price change into NZ dollars in one step. The holding does not store the buy's exchange rate, so this gap is not a currency move.",
    totalNote: pricedFx
      ? "The total equals the economic P/L at the latest price, plus income."
      : "The total equals the P/L at the latest price.",
  };
}
