/**
 * NZ dollar value of open holdings from stored marks.
 * A missing mark is named. Cost is not used as a market value.
 */

import { nzdAtBookRate, roundMoney, type CurrencyCode, type FxRatesToNZD } from "@/lib/currency";

export interface MarkedHolding {
  ticker: string;
  shares: number;
  currentPrice: number | null;
  currency: CurrencyCode;
  /** ISO time the mark was stored, when the row has one. */
  updatedAt: string | null;
}

export type BookValuation =
  | { ok: true; holdingsNzd: number; asOf: string; source: string }
  | { ok: false; reason: string };

function civilDay(value: string | null): string | null {
  const day = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

/**
 * Sum of stored marks in NZ dollars. Cash is not included.
 * `asOf` is the oldest stored mark time, so a newer mark is not claimed for the whole book.
 */
export function holdingBookValuation(
  holdings: readonly MarkedHolding[],
  rates: FxRatesToNZD,
  today: string
): BookValuation {
  if (!holdings.length) {
    return { ok: false, reason: "This book has no holdings." };
  }
  const missing = holdings.filter((row) => !(Number(row.currentPrice) > 0));
  if (missing.length) {
    const names = missing.map((row) => row.ticker).join(", ");
    return {
      ok: false,
      reason: `${names} ${missing.length === 1 ? "has" : "have"} no positive stored mark. Cost is not used as a market value, and a partial book is not shown.`,
    };
  }
  let total = 0;
  const days: string[] = [];
  let missingTime = false;
  for (const row of holdings) {
    const native = (Number(row.shares) || 0) * (Number(row.currentPrice) || 0);
    total += roundMoney(nzdAtBookRate(native, row.currency, rates));
    const day = civilDay(row.updatedAt);
    if (day) days.push(day);
    else missingTime = true;
  }
  const oldest = days.sort()[0];
  const asOf = oldest || today;
  const timeNote = missingTime
    ? " A stored mark has no quote time."
    : days.some((day) => day !== oldest)
      ? " Marks on this book were stored on different days. The as-of date is the oldest of them."
      : "";
  return {
    ok: true,
    holdingsNzd: roundMoney(total),
    asOf,
    source: `Stored mark on the holding.${timeNote} NZ dollars use the exchange rate on the book. This is not a live price.`,
  };
}
