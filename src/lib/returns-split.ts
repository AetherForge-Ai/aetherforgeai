/**
 * Portfolio return split: price move, dividends, and the exchange-rate move.
 * The lines add up to the P/L at the latest price.
 *
 * That P/L converts each holding's cost and its market value into NZ dollars
 * separately, at today's rate rounded to 4 decimal places. Capital gain
 * converts the price change in one step. The currency line uses the
 * exchange rate stored on the remaining buy lots. The difference is Other.
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
  /** NZD per 1 unit of currency on the buy. Missing means the currency line stays at zero. */
  fxAtCost?: number | null;
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
    if (!fresh) capital += nativeToNzd((mark - cost) * qty, p.currency, table);
    const fxThen = p.currency === "NZD" ? 1 : Number(p.fxAtCost);
    if (p.currency !== "NZD" && fxThen > 0 && !fresh) {
      pricedFx = true;
      currencyEffect += cost * qty * (fxNow - fxThen);
    }
  }
  const income = round2(Number(incomeNzd) || 0);
  const capitalGainNzd = round2(capital);
  const currencyEffectNzd = round2(currencyEffect);
  const bookGain = roundMoney(valueSum - costSum);
  const reported = reportedPnlNzd == null || !Number.isFinite(Number(reportedPnlNzd)) ? bookGain : round2(Number(reportedPnlNzd));
  const otherNzd = round2(reported - capitalGainNzd - income - currencyEffectNzd);
  const totalNzd = round2(capitalGainNzd + income + currencyEffectNzd + otherNzd);
  return {
    capitalGainNzd,
    incomeNzd: income,
    currencyEffectNzd,
    otherNzd,
    totalNzd,
    capitalNote:
      "Capital gain is the change in price since you bought, turned into NZ dollars in one step at today's exchange rate. It is not a forecast.",
    incomeNote: "Income is the dividends recorded in the ledger. It is cash received, and it does not change how many units you hold.",
    currencyNote: pricedFx
      ? "Currency effect is the NZ dollar change caused only by the exchange rate moving since the buy. The price move stays in capital gain."
      : "Currency effect is the NZ dollar change caused only by the exchange rate since the buy. It is zero when the holding is in NZ dollars, or when that buy did not store an exchange rate.",
    otherNote: pricedFx
      ? "Other is what is left so these lines add up to the P/L at the latest price. The currency line uses the exchange rate stored on the buy."
      : "Other is what is left so these lines add up to the P/L at the latest price. That P/L turns each holding's cost and its market value into NZ dollars separately, at today's rate rounded to 4 decimal places. Capital gain turns the price change into NZ dollars in one step. The holding does not store the buy's exchange rate, so this gap is not a currency move.",
    totalNote: "The total equals the P/L at the latest price.",
  };
}
