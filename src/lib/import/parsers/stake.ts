/**
 * Stake investment-activity columns.
 * Stake's own download is the Investment activity workbook (XLSX) from
 * Tax & reporting → Financial year reports (Sharesight partner page for Stake,
 * and Stake's export steps on Portseido). This CSV is that sheet.
 * Column names follow the fields those guides map: Trade Date, Symbol, Side,
 * Units, Avg Price, Brokerage, Currency, and an FX rate for the NZ$ book.
 */

import { cell, headerIndex } from "@/lib/import/csv";
import { parseTradeDate } from "@/lib/import/dates";
import { emptyDraft, pushTrade, skip, type BrokerDraft } from "@/lib/import/draft";
import { buildTrade, parseSide } from "@/lib/import/trade";
import type { ImportCurrency } from "@/lib/import/types";

export function parseStake(grid: string[][], rates?: Record<string, number | null>): BrokerDraft {
  const draft = emptyDraft();
  const headers = grid[0] || [];
  const dateAt = headerIndex(headers, ["trade date", "date"]);
  const symbolAt = headerIndex(headers, ["symbol", "ticker"]);
  const nameAt = headerIndex(headers, ["name"]);
  const sideAt = headerIndex(headers, ["side"]);
  const qtyAt = headerIndex(headers, ["units", "quantity"]);
  const priceAt = headerIndex(headers, ["avg price", "average price", "price"]);
  const feeAt = headerIndex(headers, ["brokerage", "brokerage fee"]);
  const ccyAt = headerIndex(headers, ["currency"]);
  const fxAt = headerIndex(headers, ["fx rate", "exchange rate"]);
  const refAt = headerIndex(headers, ["reference"]);

  grid.slice(1).forEach((row, index) => {
    const line = index + 2;
    const side = parseSide(cell(row, sideAt));
    if (side === "skip") {
      skip(draft, line, `${cell(row, sideAt).trim() || "This row"} is not a buy or a sell, so it was not saved.`);
      return;
    }
    if (side == null) {
      draft.errors.push({ line, message: `Line ${line}: Side "${cell(row, sideAt).trim()}" is not a buy or a sell. This row was not saved.` });
      return;
    }
    const date = parseTradeDate(cell(row, dateAt), "iso");
    if (!date) {
      draft.errors.push({ line, message: `Line ${line}: Date "${cell(row, dateAt).trim()}" could not be read. This row was not saved.` });
      return;
    }
    const currency = cell(row, ccyAt).trim().toUpperCase() as ImportCurrency;
    if (currency !== "NZD" && currency !== "AUD" && currency !== "USD") {
      draft.errors.push({ line, message: `Line ${line}: Currency must be NZD, AUD or USD. This row was not saved.` });
      return;
    }
    const ticker = cell(row, symbolAt).trim().toUpperCase();
    pushTrade(
      draft,
      buildTrade(
        {
          line,
          date,
          ticker: currency === "AUD" && ticker && !ticker.includes(".") ? `${ticker}.AX` : ticker,
          side,
          quantity: cell(row, qtyAt),
          price: cell(row, priceAt),
          fee: cell(row, feeAt),
          currency,
          fx: cell(row, fxAt),
          brokerRef: cell(row, refAt),
          assetName: cell(row, nameAt),
        },
        rates
      )
    );
  });
  return draft;
}
