import type { SnapshotLedgerLine } from "@/lib/portfolio-snapshot";

/**
 * Goal b19 G-29: Xero bank-statement CSV (the simple statement import:
 * Date, Amount, Payee, Description, Reference). One line per NZD cash movement
 * on the paper book, dates DD/MM/YYYY (NZ Xero org), amounts to 2dp, money in
 * positive and money out negative. No GST columns. Rows without a date or a
 * booked NZD cash figure are left out and counted, never guessed.
 */
export const XERO_HEADERS = ["Date", "Amount", "Payee", "Description", "Reference"] as const;

const TYPE_LABEL: Record<string, string> = {
  buy: "Buy",
  sell: "Sell",
  deposit: "Deposit",
  withdraw: "Withdrawal",
  dividend: "Dividend",
  tax: "Tax",
  opening_balance: "Opening balance",
  correction: "Correction",
};

function xeroDate(day: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day || "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
}

/** b66 G-29: Xero statement text fields are kept short and single-line. */
export const XERO_TEXT_MAX = 255;

/**
 * b66 G-29: one text cell. Line breaks become spaces, length is capped, and a leading = + - @ is
 * prefixed with an apostrophe so a spreadsheet never runs it as a formula (CSV injection).
 */
export function xeroText(v: string): string {
  let t = String(v ?? "").replace(/[\r\n\t]+/g, " ").trim().slice(0, XERO_TEXT_MAX);
  if (/^[=+\-@]/.test(t)) t = `'${t}`.slice(0, XERO_TEXT_MAX);
  return t;
}

function cell(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Xero wants plain numbers: no currency symbol, no thousands separator, no exponent, 2 dp. */
export function xeroAmount(n: number): string {
  const r = Math.round(n * 100) / 100;
  return (Object.is(r, -0) ? 0 : r).toFixed(2);
}

function plainQty(n: number): string {
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 8 });
}

export function xeroStatementCsv(lines: readonly SnapshotLedgerLine[]): { csv: string; rows: number; skipped: number } {
  const out: string[] = [XERO_HEADERS.join(",")];
  let skipped = 0;
  // b66 G-29: same-day lines keep a stable order (by id) so re-exports diff cleanly.
  const sorted = [...lines].sort((a, b) => (a.when < b.when ? -1 : a.when > b.when ? 1 : String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0));
  for (const l of sorted) {
    const date = xeroDate(l.when);
    const amount = Number(l.cashNzd);
    if (!date || !Number.isFinite(amount) || Math.abs(amount) < 0.005) {
      skipped++;
      continue;
    }
    const label = TYPE_LABEL[l.type] ?? l.type;
    if (Math.abs(Math.round(amount * 100) / 100) < 0.005) {
      skipped++;
      continue;
    }
    const qty = l.quantity != null && l.price != null ? ` ${plainQty(Number(l.quantity))} @ ${plainQty(Number(l.price))} ${l.currency}` : "";
    const desc = `${label}${l.ticker ? ` ${l.ticker}` : ""}${qty}`.trim();
    out.push([date, xeroAmount(amount), xeroText("AetherForge paper book"), xeroText(desc), xeroText(String(l.id ?? ""))].map(cell).join(","));
  }
  return { csv: `${out.join("\n")}\n`, rows: out.length - 1, skipped };
}
