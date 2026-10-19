/**
 * b46 H-1 (b) (TT b45: 214 crypto/DEX rows 16–31 min old without "delayed"): the label was computed
 * when the index was built and then cached. These pure helpers re-evaluate it from the row's own
 * quotedAt — on the server when a response is built, and in the browser when the row renders.
 */
import { cryptoRowDelayed } from "@/lib/crypto-row-delay";

export const DELAYED_SUFFIX = " · delayed";

type DelayRow = { asOf?: string; quotedAt?: string | null; delayed?: boolean };

/** The row's as-of text for this moment. Rows without a quotedAt field are returned unchanged. */
export function rowAsOfNow<T extends DelayRow>(row: T, now = Date.now()): T {
  if (!("quotedAt" in row) || row.asOf == null) return row;
  const base = row.asOf.endsWith(DELAYED_SUFFIX) ? row.asOf.slice(0, -DELAYED_SUFFIX.length) : row.asOf;
  const delayed = cryptoRowDelayed(row.quotedAt ?? null, now);
  const asOf = delayed ? `${base}${DELAYED_SUFFIX}` : base;
  return asOf === row.asOf && delayed === row.delayed ? row : { ...row, asOf, delayed };
}

export function reevaluateRowDelay<T extends { tabs: Array<{ id: string; rows: DelayRow[] }> }>(index: T, now = Date.now()): T {
  return {
    ...index,
    tabs: index.tabs.map((tab) => (tab.id === "CRYPTO" || tab.id === "DEX" ? { ...tab, rows: tab.rows.map((r) => rowAsOfNow(r, now)) } : tab)),
  };
}
