/**
 * Portfolio return split: price move, dividends, and the exchange-rate move.
 *
 * When a lot stored the buy rate:
 *   unrealised FX = quantity × buy price × (rate now − cost-weighted buy rate)
 *   capital       = quantity × (mark − buy price) × rate now
 * Those two lines sum to mark × quantity × rate now − cost × quantity × buy rate.
 * Realised FX (quantity closed × buy price × (sell rate − buy rate)) and
 * foreign cash (balance × (rate now − booked rate)) are added to the currency
 * line. The four output lines are rounded once.
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

/** Foreign cash booked at one rate and valued at another. NZD balances are skipped. */
export interface ForeignCashBalance {
  amount: number;
  currency: CurrencyCode;
  fxBook: number;
  fxNow: number;
}

export interface ReturnSplitExtras {
  /** Unrounded sum of quantity × buy fill × (sell FX − buy FX) on closed lots. */
  realisedFxNzd?: number | null;
  foreignCash?: ForeignCashBalance[] | null;
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
  reportedPnlNzd?: number | null,
  extras?: ReturnSplitExtras | null
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
      capital += (mark - cost) * qty * fxNow;
      currencyEffect += cost * qty * (fxNow - fxCost);
      pricedEconomic += mark * qty * fxNow - cost * qty * fxCost;
    } else if (!fresh) {
      capital += nativeToNzd((mark - cost) * qty, p.currency, table);
      unpricedBook += valueNzd - costNzd;
    }
  }
  let fxAddon = 0;
  const realised = Number(extras?.realisedFxNzd);
  if (Number.isFinite(realised)) fxAddon += realised;
  for (const cash of extras?.foreignCash || []) {
    if (!cash || cash.currency === "NZD") continue;
    const amount = Number(cash.amount) || 0;
    const now = Number(cash.fxNow);
    const book = Number(cash.fxBook);
    if (amount === 0 || !(now > 0) || !(book > 0)) continue;
    fxAddon += amount * (now - book);
  }
  if (fxAddon !== 0) {
    pricedFx = true;
    currencyEffect += fxAddon;
    pricedEconomic += fxAddon;
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
      ? "Capital gain is the price change since you bought, turned into NZ dollars at today's exchange rate. It is not a forecast."
      : "Capital gain is the change in price since you bought, turned into NZ dollars in one step at today's exchange rate. It is not a forecast.",
    incomeNote: "Income is the dividends recorded in the ledger. It is cash received, and it does not change how many units you hold.",
    currencyNote: pricedFx
      ? "Currency effect is the quantity times the buy price times (the exchange rate now minus the cost-weighted exchange rate at buy), for each open lot. Realised currency effect adds the quantity closed times the buy price times (the sell rate minus the buy rate). Foreign cash adds the balance times (the rate now minus the rate the cash was booked at)."
      : "Currency effect is the NZ dollar change caused only by the exchange rate since the buy. It is zero when the holding is in NZ dollars, or when that buy did not store an exchange rate.",
    otherNote: pricedFx
      ? "Other is rounding so these lines add up to the economic P/L. Economic P/L is the foreign value at the valuation exchange rate minus the cost at the buy's exchange rate. It stays small."
      : "Other is what is left so these lines add up to the P/L at the latest price. That P/L turns each holding's cost and its market value into NZ dollars separately, at today's rate rounded to 4 decimal places. Capital gain turns the price change into NZ dollars in one step. The holding does not store the buy's exchange rate, so this gap is not a currency move.",
    totalNote: pricedFx
      ? "The total equals the economic P/L at the latest price, plus income."
      : "The total equals the P/L at the latest price.",
  };
}
