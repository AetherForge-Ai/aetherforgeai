/**
 * Jarden Direct / Direct Broking contract-note columns.
 * Jarden does not publish a CSV header list. The Jarden Securities terms
 * (directbroking.co.nz, November 2023) define a contract note as showing
 * the price, the number of securities, brokerage and other fees.
 * Invest Direct, formerly Jarden Direct, sends trades to Sharesight by API
 * (sharesight.com/nz/partners/jarden-direct/) rather than a documented CSV.
 * These columns are the contract-note fields, plus the confirmation number
 * and the exchange shown on the confirmation. The exchange supplies the
 * ticker suffix.
 */

import { cell, headerIndex } from "@/lib/import/csv";
import { parseTradeDate } from "@/lib/import/dates";
import { emptyDraft, pushTrade, skip, type BrokerDraft } from "@/lib/import/draft";
import { buildTrade, marketTicker, parseSide } from "@/lib/import/trade";
import type { ImportCurrency } from "@/lib/import/types";

export function parseJarden(grid: string[][], rates?: Record<string, number | null>): BrokerDraft {
  const draft = emptyDraft();
  const headers = grid[0] || [];
  const dateAt = headerIndex(headers, ["transaction date", "trade date", "date"]);
  const refAt = headerIndex(headers, ["confirmation number"]);
  const sideAt = headerIndex(headers, ["type", "transaction"]);
  const codeAt = headerIndex(headers, ["code", "security code"]);
  const nameAt = headerIndex(headers, ["security"]);
  const marketAt = headerIndex(headers, ["exchange"]);
  const qtyAt = headerIndex(headers, ["quantity", "units"]);
  const priceAt = headerIndex(headers, ["price"]);
  const considerationAt = headerIndex(headers, ["consideration"]);
  const feeAt = headerIndex(headers, ["brokerage"]);
  const netAt = headerIndex(headers, ["net amount"]);
  const ccyAt = headerIndex(headers, ["currency"]);

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
