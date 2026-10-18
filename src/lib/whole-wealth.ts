/**
 * Goal b19 G-21: whole-wealth NZD book. The paper book comes from the portfolio
 * snapshot; KiwiSaver, other assets and debts are typed in by the member and
 * kept in this browser only (no new Totalum table without approval). Net worth
 * is the sum of the parts in whole cents, so the total always equals the rows.
 */
export const WEALTH_KEY = "af-whole-wealth-v1";
export const WEALTH_HISTORY_KEY = "af-whole-wealth-history-v1";

export type WealthKind = "kiwisaver" | "cash" | "property" | "other" | "debt";
export interface WealthItem {
  id: string;
  kind: WealthKind;
  label: string;
  valueNzd: number;
}
export interface WealthState {
  items: WealthItem[];
  goalNzd: number | null;
}

export const KIND_LABEL: Record<WealthKind, string> = {
  kiwisaver: "KiwiSaver",
  cash: "Bank cash",
  property: "Property",
  other: "Other asset",
  debt: "Debt",
};

const cents = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100);

export function wealthTotals(bookNzd: number | null, items: readonly WealthItem[], goalNzd: number | null) {
  const bookCents = bookNzd == null || !Number.isFinite(bookNzd) ? null : cents(bookNzd);
  let assets = 0;
  let debts = 0;
  for (const it of items) {
    const c = Math.abs(cents(it.valueNzd));
    if (it.kind === "debt") debts += c;
    else assets += c;
  }
  const netCents = bookCents == null ? null : bookCents + assets - debts;
  return {
    bookNzd: bookCents == null ? null : bookCents / 100,
    otherAssetsNzd: assets / 100,
    debtsNzd: debts / 100,
    netWorthNzd: netCents == null ? null : netCents / 100,
    goalGapNzd: netCents == null || goalNzd == null ? null : (cents(goalNzd) - netCents) / 100,
  };
}

/** One point per Auckland day, replacing that day's earlier point. Real values only. */
export function addHistoryPoint(history: readonly { day: string; netWorthNzd: number }[], day: string, netWorthNzd: number | null) {
  if (netWorthNzd == null || !Number.isFinite(netWorthNzd)) return [...history];
  return [...history.filter((p) => p.day !== day), { day, netWorthNzd }].sort((a, b) => a.day.localeCompare(b.day)).slice(-366);
}
