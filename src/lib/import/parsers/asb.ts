/**
 * ASB Securities contract-note columns.
 * ASB does not publish a CSV header list. The glossary
 * (asb.co.nz/asb-securities/glossary-of-terms.html) defines a contract note
 * as the confirmation of price, number of shares and brokerage. The order
 * guide (asb.co.nz/asb-securities/placing-your-first-online-order-guide.html)
 * adds the trade date, the settlement date and the consolidated contract note.
 * These columns are those fields, one row per fill. Currency is on the note.
 * Exchange (NZX or ASX) supplies the ticker suffix. Nothing else is guessed.
 */

import { cell, headerIndex } from "@/lib/import/csv";
import { parseTradeDate } from "@/lib/import/dates";
import { emptyDraft, pushTrade, skip, type BrokerDraft } from "@/lib/import/draft";
import { buildTrade, marketTicker, parseSide } from "@/lib/import/trade";
import type { ImportCurrency } from "@/lib/import/types";

export function parseAsb(grid: string[][], rates?: Record<string, number | null>): BrokerDraft {
  const draft = emptyDraft();
  const headers = grid[0] || [];
  const refAt = headerIndex(headers, ["contract note"]);
  const dateAt = headerIndex(headers, ["trade date"]);
  const sideAt = headerIndex(headers, ["buy/sell"]);
  const codeAt = headerIndex(headers, ["security code"]);
  const nameAt = headerIndex(headers, ["security description"]);
  const qtyAt = headerIndex(headers, ["quantity"]);
  const priceAt = headerIndex(headers, ["price"]);
  const considerationAt = headerIndex(headers, ["consideration"]);
  const feeAt = headerIndex(headers, ["brokerage"]);
  const netAt = headerIndex(headers, ["net amount"]);
  const ccyAt = headerIndex(headers, ["currency"]);
  const marketAt = headerIndex(headers, ["exchange"]);

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
    const date = parseTradeDate(cell(row, dateAt), "dmy");
    if (!date) {
      draft.errors.push({ line, message: `Line ${line}: Date "${cell(row, dateAt).trim()}" could not be read. This row was not saved.` });
      return;
    }
    const currency = cell(row, ccyAt).trim().toUpperCase() as ImportCurrency;
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
          ticker: marketTicker(cell(row, codeAt), cell(row, marketAt)),
          side,
          quantity: cell(row, qtyAt),
          price: cell(row, priceAt),
          fee: cell(row, feeAt),
          currency,
          fx: currency === "NZD" ? "1" : "",
          brokerRef: cell(row, refAt),
          assetName: cell(row, nameAt),
          value: cell(row, considerationAt),
          net: cell(row, netAt),
        },
        rates
      )
    );
  });
  return draft;
}
