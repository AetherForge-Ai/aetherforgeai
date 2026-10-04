/**
 * Whether a member's book is loaded. Pure — no quotes are fetched or invented here.
 */

import { inferMetalKey, isBullionHolding } from "@/lib/metal-valuation";

export interface BookRow {
  asset_type?: string | null;
  ticker?: string | null;
  shares?: number | null;
  company_name?: string | null;
}

export interface MetalRow {
  metal?: string | null;
  ounces?: number | null;
}

export interface PortfolioBook {
  stockLots: number;
  cryptoLots: number;
  goldOunces: number;
  silverOunces: number;
  cashNZD: number;
}

export interface CoveragePosition {
  label: string;
  sublabel?: string;
  assetClass: "equities" | "crypto" | "metals" | "cash";
  valueNZD: number;
}

export function readPortfolioBook(
  rows: BookRow[],
  metals: MetalRow[],
  cashNZD: number
): PortfolioBook {
  let stockLots = 0;
  let cryptoLots = 0;
  let goldOunces = 0;
  let silverOunces = 0;
  for (const row of rows) {
    const shares = Number(row.shares) || 0;
    if (!(shares > 0)) continue;
    const asset = (row.asset_type || "stock").trim().toLowerCase();
    if (asset === "metal" || isBullionHolding(row.asset_type, row.ticker, row.company_name)) {
      const key = inferMetalKey({
        ticker: row.ticker,
        assetType: row.asset_type,
        companyName: row.company_name,
      });
      if (key === "silver") silverOunces += shares;
      else goldOunces += shares;
      continue;
    }
    if (asset === "crypto") cryptoLots += 1;
    else stockLots += 1;
  }
  for (const metal of metals) {
    const ounces = Number(metal.ounces) || 0;
    if (!(ounces > 0)) continue;
    if ((metal.metal || "").trim().toLowerCase() === "silver") silverOunces += ounces;
    else goldOunces += ounces;
  }
  return {
    stockLots,
    cryptoLots,
    goldOunces,
    silverOunces,
    cashNZD: Number.isFinite(cashNZD) ? Math.max(0, cashNZD) : 0,
  };
}

/** True when any stocks, crypto, gold, silver, or cash are on the book. */
export function portfolioIsLoaded(book: PortfolioBook, positions: CoveragePosition[] = []): boolean {
  if (book.stockLots > 0 || book.cryptoLots > 0 || book.goldOunces > 0 || book.silverOunces > 0 || book.cashNZD > 0) {
    return true;
  }
  return positions.some((position) => position.valueNZD > 0);
}

/** Sentence placed inside a Stox or Koins report when that bot's market feed returned nothing. */
export function marketFeedUnavailableLine(bot: "stock" | "crypto"): string {
  return bot === "crypto"
    ? "The crypto market feed is unavailable for this run, so no prices or quotes were filled in."
    : "The equity market feed is unavailable for this run, so no prices or quotes were filled in.";
}
