/**
 * Hatch tax-report Trades CSV.
 * Columns named in Hatch Help, "Understanding your Hatch tax reports"
 * (help.hatchinvest.nz article 2938281, updated 19 May 2026):
 * Date (NZ), Side, Symbol, Quantity, Price (USD), Notional Value (USD),
 * Brokerage Fees (USD), FX Rate, and the NZD equivalents.
 * Hatch describes FX Rate as the inverse of the NZD to USD rate, which is
 * NZD per 1 USD. Notional Value (USD) is quantity × price + brokerage.
 * DAGXX is the cash-sweep fund Hatch documents beside these trades, and is not saved.
 */

import { cell, headerIndex } from "@/lib/import/csv";
import { parseTradeDate } from "@/lib/import/dates";
import { emptyDraft, pushTrade, skip, type BrokerDraft } from "@/lib/import/draft";
import { productCents, toCents, parseDecimal } from "@/lib/import/money";
import { buildTrade, parseSide } from "@/lib/import/trade";

export function parseHatch(grid: string[][], rates?: Record<string, number | null>): BrokerDraft {
  const draft = emptyDraft();
  const headers = grid[0] || [];
  const dateAt = headerIndex(headers, ["date (nz)", "date"]);
  const sideAt = headerIndex(headers, ["side"]);
  const symbolAt = headerIndex(headers, ["symbol"]);
  const qtyAt = headerIndex(headers, ["quantity"]);
  const priceAt = headerIndex(headers, ["price (usd)", "price"]);
  const feeAt = headerIndex(headers, ["brokerage fees (usd)", "brokerage fees"]);
  const fxAt = headerIndex(headers, ["fx rate"]);
  const notionalAt = headerIndex(headers, ["notional value (usd)"]);

  grid.slice(1).forEach((row, index) => {
    const line = index + 2;
    const symbol = cell(row, symbolAt).trim().toUpperCase();
    if (symbol === "DAGXX") {
      skip(draft, line, "DAGXX is Hatch's cash sweep, not a share trade. This row was not saved.");
      return;
    }
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
    const notional = cell(row, notionalAt);
    if (notional.trim() && !notionalMatches(cell(row, qtyAt), cell(row, priceAt), cell(row, feeAt), notional)) {
      draft.errors.push({
        line,
        message: `Line ${line}: Notional value does not match quantity times price plus brokerage. This row was not saved.`,
      });
      return;
    }
    pushTrade(
      draft,
      buildTrade(
        {
          line,
          date,
          ticker: symbol,
          side,
          quantity: cell(row, qtyAt),
          price: cell(row, priceAt),
          fee: cell(row, feeAt),
          currency: "USD",
          fx: cell(row, fxAt),
        },
        rates
      )
    );
  });
  return draft;
}

function notionalMatches(qty: string, price: string, fee: string, notional: string): boolean {
  const quantity = parseDecimal(qty);
  const px = parseDecimal(price);
  const brokerage = parseDecimal(fee) ?? BigInt(0);
  const printed = parseDecimal(notional);
  if (quantity == null || px == null || printed == null) return false;
  const absFee = brokerage < BigInt(0) ? -brokerage : brokerage;
  const want = productCents(quantity < BigInt(0) ? -quantity : quantity, px < BigInt(0) ? -px : px) + toCents(absFee);
  const got = toCents(printed < BigInt(0) ? -printed : printed);
  return got === want;
}
