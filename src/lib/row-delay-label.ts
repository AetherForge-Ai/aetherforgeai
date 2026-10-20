/**
 * b46 H-1 (b) (TT b45: 214 crypto/DEX rows 16–31 min old without "delayed"): the label was computed
 * when the index was built and then cached. These pure helpers re-evaluate it from the row's own
 * quotedAt — on the server when a response is built, and in the browser when the row renders.
 */
import { cryptoRowDelayed, dropLaggingRows } from "@/lib/crypto-row-delay";

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
  // b49: on the CRYPTO tab a row hours behind the rest of the list is dropped (TT b48: one 16 h old row).
  const tabs = index.tabs.map((tab) =>
    tab.id === "CRYPTO" || tab.id === "DEX"
      ? { ...tab, rows: (tab.id === "CRYPTO" ? dropLaggingRows(tab.rows) : tab.rows).map((r) => rowAsOfNow(r, now)) }
      : tab
  );
  const out = { ...index, tabs } as T;
  if ("priceRowCount" in index) (out as T & { priceRowCount: number }).priceRowCount = tabs.reduce((sum, tab) => sum + tab.rows.length, 0);
  return out;
}
