/**
 * Paper-book totals for the tax page. These are ledger sums, not a tax return.
 */

import { roundMoney } from "@/lib/currency";

export type TaxBookRow = {
  type?: string;
  cash_nzd?: number | null;
  total?: number | null;
  realized_pnl?: number | null;
};

export function taxBookSummary(rows: readonly TaxBookRow[]): {
  dividendsNzd: number;
  realisedPnlNzd: number;
} {
  let dividends = 0;
  let realised = 0;
  for (const row of rows) {
    if (row.type === "dividend") {
      const amount = typeof row.cash_nzd === "number" ? row.cash_nzd : typeof row.total === "number" ? row.total : 0;
      dividends += amount;
    }
    if (row.type === "sell" && typeof row.realized_pnl === "number") realised += row.realized_pnl;
  }
  return { dividendsNzd: roundMoney(dividends), realisedPnlNzd: roundMoney(realised) };
}
