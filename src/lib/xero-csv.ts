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

function cell(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function xeroStatementCsv(lines: readonly SnapshotLedgerLine[]): { csv: string; rows: number; skipped: number } {
  const out: string[] = [XERO_HEADERS.join(",")];
  let skipped = 0;
  const sorted = [...lines].sort((a, b) => (a.when < b.when ? -1 : a.when > b.when ? 1 : 0));
  for (const l of sorted) {
    const date = xeroDate(l.when);
    const amount = Number(l.cashNzd);
    if (!date || !Number.isFinite(amount) || Math.abs(amount) < 0.005) {
      skipped++;
      continue;
    }
    const label = TYPE_LABEL[l.type] ?? l.type;
    const qty = l.quantity != null && l.price != null ? ` ${l.quantity} @ ${l.price} ${l.currency}` : "";
    const desc = `${label}${l.ticker ? ` ${l.ticker}` : ""}${qty}`.trim();
    out.push([date, amount.toFixed(2), "AetherForge paper book", desc, l.id].map(cell).join(","));
  }
  return { csv: `${out.join("\n")}\n`, rows: out.length - 1, skipped };
}
