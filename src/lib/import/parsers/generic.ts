/**
 * Generic column map.
 * A readable CSV that is not one of the broker layouts is not guessed.
 * The member picks date, ticker, side, quantity and price. Fee, currency
 * and the NZD rate are optional. Currency defaults from the ticker suffix:
 * .NZ is NZD, .AX is AUD, otherwise USD.
 */

import { cell, normHeader } from "@/lib/import/csv";
import { parseTradeDate } from "@/lib/import/dates";
import { emptyDraft, pushTrade, skip, type BrokerDraft } from "@/lib/import/draft";
import { buildTrade, parseSide } from "@/lib/import/trade";
import type { ColumnMap, ImportCurrency } from "@/lib/import/types";

export function parseGeneric(grid: string[][], mapping: ColumnMap, rates?: Record<string, number | null>): BrokerDraft {
  const draft = emptyDraft();
  const headers = grid[0] || [];
  const at = (name: string | undefined) => {
    if (!name) return -1;
    const wanted = normHeader(name);
    return headers.findIndex((header) => normHeader(header) === wanted);
  };
  const dateAt = at(mapping.date);
  const tickerAt = at(mapping.ticker);
  const sideAt = at(mapping.side);
  const qtyAt = at(mapping.quantity);
  const priceAt = at(mapping.price);
  const feeAt = at(mapping.fee);
  const ccyAt = at(mapping.currency);
  const fxAt = at(mapping.fx);
  if ([dateAt, tickerAt, sideAt, qtyAt, priceAt].some((index) => index < 0)) {
    draft.errors.push({ line: 1, message: "Line 1: Choose the date, ticker, side, quantity and price columns. Nothing was written." });
    return draft;
  }

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
    const date = parseTradeDate(cell(row, dateAt), "dmy") || parseTradeDate(cell(row, dateAt), "iso");
    if (!date) {
      draft.errors.push({ line, message: `Line ${line}: Date "${cell(row, dateAt).trim()}" could not be read. This row was not saved.` });
      return;
    }
    const ticker = cell(row, tickerAt).trim().toUpperCase();
    const printed = cell(row, ccyAt).trim().toUpperCase();
    const currency = (printed || (ticker.endsWith(".NZ") ? "NZD" : ticker.endsWith(".AX") ? "AUD" : "USD")) as ImportCurrency;
    if (currency !== "NZD" && currency !== "AUD" && currency !== "USD") {
      draft.errors.push({ line, message: `Line ${line}: Currency must be NZD, AUD or USD. This row was not saved.` });
      return;
    }
    pushTrade(
      draft,
      buildTrade(
        {
          line,
          date,
          ticker,
          side,
          quantity: cell(row, qtyAt),
          price: cell(row, priceAt),
          fee: cell(row, feeAt),
          currency,
          fx: currency === "NZD" ? "1" : cell(row, fxAt),
        },
        rates
      )
    );
  });
  return draft;
}
