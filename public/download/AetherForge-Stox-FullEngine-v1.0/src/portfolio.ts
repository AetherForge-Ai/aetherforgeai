/**
 * Portfolio loader — reads a simple CSV and validates holdings.
 *
 * Expected format (portfolio.csv):
 *   ticker,shares,avg_price
 *   AIA.NZ,500,7.85
 *   FPH.NZ,200,32.40
 *   BHP.AX,150,42.10
 */

import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";
import type { PortfolioHolding } from "./types.js";

export function loadPortfolio(filePath: string): PortfolioHolding[] {
  const raw = readFileSync(filePath, "utf-8");

  const records = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as Record<string, string>[];

  if (!records.length) {
    throw new Error(`Portfolio file is empty: ${filePath}`);
  }

  const holdings: PortfolioHolding[] = [];

  for (const row of records) {
    // Accept common header variations
    const ticker = (row.ticker || row.symbol || row.Ticker || row.Symbol || "").trim().toUpperCase();
    const sharesRaw = row.shares || row.quantity || row.Shares || row.Quantity || "0";
    const avgRaw = row.avg_price || row.avgPrice || row.cost || row.AvgPrice || row["avg price"] || "0";

    const shares = Number(String(sharesRaw).replace(/,/g, ""));
    const avgPrice = Number(String(avgRaw).replace(/[$,]/g, ""));

    if (!ticker) {
      console.warn("Skipping row with missing ticker:", row);
      continue;
    }
    if (!Number.isFinite(shares) || shares <= 0) {
      console.warn(`Skipping ${ticker}: invalid shares value "${sharesRaw}"`);
      continue;
    }
    if (!Number.isFinite(avgPrice) || avgPrice < 0) {
      console.warn(`Skipping ${ticker}: invalid avg_price value "${avgRaw}"`);
      continue;
    }

    holdings.push({ ticker, shares, avgPrice });
  }

  if (!holdings.length) {
    throw new Error("No valid holdings found in portfolio file.");
  }

  console.log(`Loaded ${holdings.length} holding(s) from ${filePath}`);
  return holdings;
}
