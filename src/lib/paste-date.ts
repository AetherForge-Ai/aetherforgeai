import type { PastedRow } from "@/lib/paste-import";

/** b35 G-24: today's date in New Zealand, yyyy-mm-dd. */
export function nzToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Auckland", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Rows with no date take the member's chosen date; rows with a date keep it. */
export function withDate(rows: readonly PastedRow[], date: string): PastedRow[] {
  return rows.map((r) => (r.date ? r : { ...r, date: date || null }));
}

/** b38 G-24: per-row dates. A dateless row takes its own chosen date, else the shared one. */
export function withRowDates(rows: readonly PastedRow[], perRow: Readonly<Record<number, string>>, fallback: string): PastedRow[] {
  return rows.map((r, i) => (r.date ? r : { ...r, date: perRow[i] || fallback || null }));
}

const SIDE_HEADERS = ["type", "side", "action", "buy/sell", "transaction type"];
const TICKER_HEADERS = ["symbol", "ticker", "code", "instrument", "security"];
const QTY_HEADERS = ["quantity", "qty", "units", "shares"];
const PRICE_HEADERS = ["price", "unit price", "avg price", "average price"];
const DATE_HEADERS = ["date", "trade date", "executed", "executed at", "settlement date"];

/**
 * b38 G-24: a CSV (or raw lines) with trades but no date column used to be rejected whole or
 * silently ignored. Returns PastedRows (date null) so the per-row date prompt can take over, or
 * null when the text is not a dateless trade list.
 */
export function datelessCsvRows(text: string): PastedRow[] | null {
  const lines = text.replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;
  const head = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ""));
  if (head.some((h) => DATE_HEADERS.includes(h))) return null;
  const at = (names: string[]) => head.findIndex((h) => names.includes(h));
  const s = at(SIDE_HEADERS), t = at(TICKER_HEADERS), q = at(QTY_HEADERS), p = at(PRICE_HEADERS);
  if ([s, t, q, p].some((i) => i < 0)) return null;
  const rows: PastedRow[] = [];
  for (const line of lines.slice(1)) {
    const c = line.split(",").map((x) => x.trim().replace(/^"|"$/g, ""));
    const side = (c[s] || "").toLowerCase();
    const type = side.startsWith("b") ? "Buy" : side.startsWith("s") ? "Sell" : null;
    const quantity = Number((c[q] || "").replace(/,/g, ""));
    const price = Number((c[p] || "").replace(/[$,]/g, ""));
    const ticker = (c[t] || "").toUpperCase();
    if (!type || !ticker || !(quantity > 0) || !(price > 0)) continue;
    rows.push({ date: null, type, ticker, quantity, price, currency: null, fees: null, reference: null });
  }
  return rows.length ? rows : null;
}
