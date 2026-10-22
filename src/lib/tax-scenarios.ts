/**
 * Goal b8 H-9 / G-01: ledger helpers for DRP shares and share splits, so the
 * FIFO tax functions see them as lots. Pure; shared by the golden tax
 * scenarios (src/lib/fixtures/tax-golden.md) and the dividends ledger.
 */
import type { TaxLedgerRow } from "@/lib/taxable-income";
import { lotCivilDay } from "@/lib/executed-at";

/**
 * A DRP allotment as a FIFO buy lot: `shares` received at `costNative` in total
 * (zero for a zero-cost DRP). Price per share is the total cost / shares.
 */
export function drpLotRow(input: {
  id?: string;
  ticker: string;
  when: string;
  shares: number;
  costNative: number;
  fx?: number;
  currency?: string;
  assetType?: string;
}): TaxLedgerRow {
  const shares = Math.max(0, Number(input.shares) || 0);
  const price = shares > 0 ? Math.max(0, Number(input.costNative) || 0) / shares : 0;
  return {
    _id: input.id ?? `drp-${input.ticker}-${input.when}`,
    type: "buy",
    ticker: input.ticker,
    asset_type: input.assetType ?? "stock",
    quantity: shares,
    price,
    fees: 0,
    fx_rate: input.fx ?? 1,
    currency: input.currency ?? "NZD",
    executed_at: input.when,
    trade_date: input.when,
    notes: "DRP allotment",
  } as TaxLedgerRow;
}

/**
 * Apply an N:1 split (ratio 2 = 2-for-1) to every buy and sell of `ticker`
 * dated before `splitDate`: quantity times ratio, price divided by ratio, so
 * each lot keeps its NZ$ cost. Rows on or after the split are unchanged.
 */
export function splitAdjustedRows<T extends TaxLedgerRow>(rows: readonly T[], ticker: string, splitDate: string, ratio: number): T[] {
  if (!(ratio > 0) || ratio === 1) return [...rows];
  const sym = ticker.toUpperCase();
  return rows.map((row) => {
    const day = lotCivilDay(String(row.trade_date || row.executed_at || ""), "");
    if (String(row.ticker || "").toUpperCase() !== sym || !day || day >= splitDate) return row;
    if (row.type !== "buy" && row.type !== "sell" && row.type !== "opening_balance") return row;
    return {
      ...row,
      quantity: (Number(row.quantity) || 0) * ratio,
      price: row.price == null ? row.price : Number(row.price) / ratio,
      ...(row.fill_price != null ? { fill_price: Number(row.fill_price) / ratio } : {}),
    };
  });
}
