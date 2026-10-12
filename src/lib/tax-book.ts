/**
 * Paper-book totals for the tax page. These are ledger sums, not a tax return.
 */

import { roundMoney } from "@/lib/currency";
import { parseDividendNotes } from "@/lib/dividend-ledger";

export type TaxBookRow = {
  type?: string;
  cash_nzd?: number | null;
  total?: number | null;
  realized_pnl?: number | null;
  notes?: string | null;
};

export function taxBookSummary(rows: readonly TaxBookRow[]): {
  /** Net cash received. This is the ledger cash figure. */
  dividendsNzd: number;
  /** Gross dividend in NZ dollars when every dividend row has that breakdown. Otherwise null. */
  dividendsGrossNzd: number | null;
  realisedPnlNzd: number;
} {
  let dividends = 0;
  let realised = 0;
  let gross = 0;
  let dividendRows = 0;
  let grossRows = 0;
  for (const row of rows) {
    if (row.type === "dividend") {
      dividendRows += 1;
      const amount = typeof row.cash_nzd === "number" ? row.cash_nzd : typeof row.total === "number" ? row.total : 0;
      dividends += amount;
      const parts = parseDividendNotes(row.notes);
      if (parts) {
        gross += parts.grossNzd;
        grossRows += 1;
      }
    }
    if (row.type === "sell" && typeof row.realized_pnl === "number") realised += row.realized_pnl;
  }
  return {
    dividendsNzd: roundMoney(dividends),
    dividendsGrossNzd: dividendRows > 0 && grossRows === dividendRows ? roundMoney(gross) : null,
    realisedPnlNzd: roundMoney(realised),
  };
}
