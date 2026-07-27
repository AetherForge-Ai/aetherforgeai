/**
 * Portfolio loader for crypto holdings.
 *
 * Expected format (portfolio.csv):
 *   symbol,quantity,avg_price
 *   BTC,0.15,68500
 *   ETH,2.5,3400
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
    const symbol = (
      row.symbol || row.ticker || row.Symbol || row.Ticker || ""
    )
      .trim()
      .toUpperCase()
      .replace(/-?USD$/, "")
      .replace(/-?USDT$/, "");

    const qtyRaw = row.quantity || row.shares || row.qty || row.Quantity || row.Shares || "0";
    const avgRaw = row.avg_price || row.avgPrice || row.cost || row.AvgPrice || row["avg price"] || "0";

    const quantity = Number(String(qtyRaw).replace(/,/g, ""));
    const avgPrice = Number(String(avgRaw).replace(/[$,]/g, ""));

    if (!symbol) {
      console.warn("Skipping row with missing symbol:", row);
      continue;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      console.warn(`Skipping ${symbol}: invalid quantity "${qtyRaw}"`);
      continue;
    }
    if (!Number.isFinite(avgPrice) || avgPrice < 0) {
      console.warn(`Skipping ${symbol}: invalid avg_price "${avgRaw}"`);
      continue;
    }

    holdings.push({ symbol, quantity, avgPrice });
  }

  if (!holdings.length) {
    throw new Error("No valid holdings found in portfolio file.");
  }

  console.log(`Loaded ${holdings.length} crypto holding(s) from ${filePath}`);
  return holdings;
}
