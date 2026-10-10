import "server-only";

import type { DividendSourceRow } from "@/lib/dividend-ledger";
import type { TaxLedgerRow } from "@/lib/taxable-income";
import type { PaperHoldingChoice } from "@/lib/paper-holding";
import { totalumSdk } from "@/lib/totalum";

export type { PaperHoldingChoice };

type StockRow = {
  _id?: string;
  ticker?: string;
  company_name?: string;
  asset_type?: string;
  shares?: number;
  notes?: string | null;
  user?: string | { _id?: string } | null;
};

type MetalRow = {
  metal?: string;
  ounces?: number;
};

function assetTypeOf(value: string | undefined): "stock" | "crypto" | "metal" {
  const kind = String(value || "").toLowerCase();
  if (kind === "crypto") return "crypto";
  if (kind === "metal") return "metal";
  return "stock";
}

/** Open holdings on this book. Empty when none are stored. No sample names. */
export async function loadOpenHoldings(userId: string): Promise<PaperHoldingChoice[]> {
  const [stocksRes, metalsRes] = await Promise.all([
    totalumSdk.crud.query("stock", { _filter: { user: userId }, _limit: 500 }),
    totalumSdk.crud.query("precious_metal", { _filter: { user: userId }, _limit: 50 }),
  ]);
  const stocks = ((stocksRes?.data as StockRow[]) || [])
    .map((row) => ({
      ticker: String(row.ticker || "").trim().toUpperCase(),
      name: String(row.company_name || row.ticker || "").trim(),
      assetType: assetTypeOf(row.asset_type),
      shares: Number(row.shares) || 0,
    }))
    .filter((row) => row.ticker && row.shares > 0);
  const metals = ((metalsRes?.data as MetalRow[]) || [])
    .map((row) => {
      const metal = String(row.metal || "").toLowerCase();
      const ticker = metal === "gold" ? "GOLD" : metal === "silver" ? "SILVER" : "";
      return {
        ticker,
        name: metal === "gold" ? "Gold bullion" : metal === "silver" ? "Silver bullion" : "",
        assetType: "metal" as const,
        shares: Number(row.ounces) || 0,
      };
    })
    .filter((row) => row.ticker && row.shares > 0 && !stocks.some((stock) => stock.ticker === row.ticker));
  return [...stocks, ...metals].sort((a, b) => a.ticker.localeCompare(b.ticker));
}

/** Dividend rows only. The cap is 5,000. Older rows past that cap are not in this read. */
export async function loadDividendRows(userId: string): Promise<DividendSourceRow[]> {
  const res = await totalumSdk.crud.query("transaction", {
    _filter: { user: userId, type: "dividend" },
    _limit: 5000,
  });
  const rows = (res?.data as unknown as DividendSourceRow[]) || [];
  return rows
    .map((row) => ({
      ...row,
      executed_at: row.executed_at || row.createdAt || "",
    }))
    .sort((a, b) => {
      const ta = new Date(a.executed_at || 0).getTime();
      const tb = new Date(b.executed_at || 0).getTime();
      return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
    });
}

export type StockNoteRow = {
  id: string;
  ticker: string;
  notes: string;
  shares: number;
  assetType: string;
};

/** Stock rows, including a zero balance, so a market value can sit in notes. */
export async function loadStockNoteRows(userId: string): Promise<StockNoteRow[]> {
  const res = await totalumSdk.crud.query("stock", { _filter: { user: userId }, _limit: 500 });
  return ((res?.data as StockRow[]) || [])
    .filter((row) => {
      const owner = typeof row.user === "object" && row.user !== null ? row.user._id : row.user;
      return !owner || String(owner) === String(userId);
    })
    .map((row) => ({
      id: String(row._id || ""),
      ticker: String(row.ticker || "").trim().toUpperCase(),
      notes: String(row.notes || ""),
      shares: Number(row.shares) || 0,
      assetType: assetTypeOf(row.asset_type),
    }))
    .filter((row) => row.id && row.ticker);
}

/** Ledger rows for a tax year. The cap is 5,000. Rows past that cap are not in this read. */
export async function loadTaxRows(userId: string): Promise<TaxLedgerRow[]> {
  const res = await totalumSdk.crud.query("transaction", {
    _filter: { user: userId },
    _limit: 5000,
  });
  const rows = (res?.data as unknown as TaxLedgerRow[]) || [];
  return rows.map((row) => ({
    ...row,
    executed_at: row.executed_at || row.createdAt || "",
  }));
}
