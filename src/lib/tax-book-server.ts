import { drpLotsFromRows } from "@/lib/dividend-ledger";
import { applyLedgerSplits } from "@/lib/stock-split";
import "server-only";

import { bookCacheEpoch, readBookCache, writeBookCache } from "@/lib/book-cache";
import type { MarkedHolding } from "@/lib/book-valuation";
import { currencyForTicker } from "@/lib/currency";
import type { DividendSourceRow } from "@/lib/dividend-ledger";
import type { TaxLedgerRow } from "@/lib/taxable-income";
import { aucklandCivilToday, nzTaxYearEnding } from "@/lib/nz-tax-year";
import { realisedByTaxYear } from "@/lib/tax-realised";
import { taxBookSummary } from "@/lib/tax-book";
import type { PaperHoldingChoice } from "@/lib/paper-holding";
import { totalumSdk } from "@/lib/totalum";

async function cachedRead<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = readBookCache<T>(key);
  if (hit) return hit;
  const epoch = bookCacheEpoch(key.split(":")[0] || "");
  const value = await load();
  writeBookCache(key, value, epoch);
  return value;
}

export type { PaperHoldingChoice };

type StockRow = {
  _id?: string;
  ticker?: string;
  company_name?: string;
  asset_type?: string;
  shares?: number;
  current_price?: number | null;
  notes?: string | null;
  updatedAt?: string | Date | null;
  updated_at?: string | Date | null;
  user?: string | { _id?: string } | null;
};

type MetalRow = {
  metal?: string;
  ounces?: number;
};

function stamp(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  return String(value);
}

function assetTypeOf(value: string | undefined): "stock" | "crypto" | "metal" {
  const kind = String(value || "").toLowerCase();
  if (kind === "crypto") return "crypto";
  if (kind === "metal") return "metal";
  return "stock";
}

/** Open holdings on this book. Empty when none are stored. No sample names. */
/** Goal b12 G-01: open holdings with stored purchase and current price, for trailing yield. */
export async function loadYieldHoldings(userId: string): Promise<{ ticker: string; shares: number; purchasePrice: number | null; currentPrice: number | null }[]> {
  const res = await totalumSdk.crud.query("stock", { _filter: { user: userId }, _limit: 500 });
  return ((res?.data as unknown as (StockRow & { purchase_price?: number | null })[]) || [])
    .map((row) => ({
      ticker: String(row.ticker || "").trim().toUpperCase(),
      shares: Number(row.shares) || 0,
      purchasePrice: Number(row.purchase_price) > 0 ? Number(row.purchase_price) : null,
      currentPrice: Number(row.current_price) > 0 ? Number(row.current_price) : null,
    }))
    .filter((row) => row.ticker && row.shares > 0);
}

export async function loadOpenHoldings(userId: string): Promise<PaperHoldingChoice[]> {
  return cachedRead(`${userId}:open-holdings`, () => loadOpenHoldingsFresh(userId));
}

async function loadOpenHoldingsFresh(userId: string): Promise<PaperHoldingChoice[]> {
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

/** Stored marks for the return page. current_price is an existing column. No price is invented. */
export async function loadHoldingMarks(userId: string): Promise<MarkedHolding[]> {
  const res = await totalumSdk.crud.query("stock", { _filter: { user: userId }, _limit: 500 });
  return ((res?.data as StockRow[]) || [])
    .filter((row) => {
      const owner = typeof row.user === "object" && row.user !== null ? row.user._id : row.user;
      return !owner || String(owner) === String(userId);
    })
    .map((row) => {
      const ticker = String(row.ticker || "").trim().toUpperCase();
      const assetType = assetTypeOf(row.asset_type);
      const price = Number(row.current_price);
      return {
        ticker,
        shares: Number(row.shares) || 0,
        currentPrice: price > 0 ? price : null,
        currency: currencyForTicker(ticker, assetType),
        updatedAt: stamp(row.updatedAt || row.updated_at),
      };
    })
    .filter((row) => row.ticker && row.shares > 0);
}

/** Dividend rows only. The cap is 5,000. Older rows past that cap are not in this read. */
export async function loadDividendRows(userId: string): Promise<DividendSourceRow[]> {
  return cachedRead(`${userId}:dividends`, () => loadDividendRowsFresh(userId));
}

async function loadDividendRowsFresh(userId: string): Promise<DividendSourceRow[]> {
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

/**
 * Dividends and stored realised totals for /tax.
 * Skips the full 1,000-row ledger read. Cached per account until the next trade.
 */
export async function loadTaxBookFigures(
  userId: string
): Promise<{ dividendsNzd: number; dividendsGrossNzd: number | null; realisedPnlNzd: number }> {
  return cachedRead(`${userId}:tax-figures`, async () => {
    const book = await totalumSdk.crud.query("transaction", { _filter: { user: userId }, _limit: 5000 });
    const ending = nzTaxYearEnding(aucklandCivilToday());
    const ledger = (book?.data as unknown as TaxLedgerRow[]) || [];
    const dividendRows = ledger.filter((row) => String((row as { type?: string }).type || "") === "dividend") as unknown as Parameters<
      typeof taxBookSummary
    >[0];
    const realised = ending == null ? 0 : realisedByTaxYear(ledger, ending).combinedNzd;
    const summary = taxBookSummary(dividendRows);
    return {
      dividendsNzd: summary.dividendsNzd,
      dividendsGrossNzd: summary.dividendsGrossNzd,
      realisedPnlNzd: realised,
    };
  });
}

/** Ledger rows for a tax year. The cap is 5,000. Rows past that cap are not in this read. */
export async function loadTaxRows(userId: string): Promise<TaxLedgerRow[]> {
  return cachedRead(`${userId}:tax-rows`, () => loadTaxRowsFresh(userId));
}

async function loadTaxRowsFresh(userId: string): Promise<TaxLedgerRow[]> {
  const res = await totalumSdk.crud.query("transaction", {
    _filter: { user: userId },
    _limit: 5000,
  });
  const rows = (res?.data as unknown as TaxLedgerRow[]) || [];
  const mapped = rows.map((row) => ({
    ...row,
    executed_at: row.executed_at || row.createdAt || "",
  }));
  // Goal b8 G-01/H-9: DRP allotments with a share count join the FIFO lots.
  // Goal b9 H-9: recorded splits restate earlier lots (quantity × r, price ÷ r).
  return applyLedgerSplits([...mapped, ...drpLotsFromRows(mapped as never)]);
}
