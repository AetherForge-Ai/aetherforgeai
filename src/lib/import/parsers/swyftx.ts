/**
 * Swyftx transaction report CSV.
 * Headers from cryptact's Swyftx Transaction Report mapper
 * (grid.cryptact.com/exchanges/swyftx): Date, Time, Event, Asset, Amount,
 * Currency, Value, Rate, Fee Amount, Fee Asset, Transaction ID, and the
 * AUD value columns. Download steps: Swyftx Support, "Download a transaction
 * report" (support.swyftx.com article 12004189).
 * Amount is the crypto quantity, Rate is the price in Currency, Value is
 * amount × rate, and Fee Amount is separate. Deposits and withdrawals are
 * not trades. AUD and USD rows need a reviewed NZD rate. No rate is guessed.
 */

import { cell, headerIndex } from "@/lib/import/csv";
import { parseTradeDate } from "@/lib/import/dates";
import { emptyDraft, pushTrade, skip, type BrokerDraft } from "@/lib/import/draft";
import { buildTrade, parseSide } from "@/lib/import/trade";
import type { ImportCurrency } from "@/lib/import/types";

export function parseSwyftx(grid: string[][], rates?: Record<string, number | null>): BrokerDraft {
  const draft = emptyDraft();
  const headers = grid[0] || [];
  const dateAt = headerIndex(headers, ["date"]);
  const eventAt = headerIndex(headers, ["event"]);
  const assetAt = headerIndex(headers, ["asset"]);
  const amountAt = headerIndex(headers, ["amount"]);
  const ccyAt = headerIndex(headers, ["currency"]);
  const valueAt = headerIndex(headers, ["value"]);
  const rateAt = headerIndex(headers, ["rate"]);
  const feeAt = headerIndex(headers, ["fee amount"]);
  const feeAssetAt = headerIndex(headers, ["fee asset"]);
  const refAt = headerIndex(headers, ["transaction id"]);

  grid.slice(1).forEach((row, index) => {
    const line = index + 2;
    const side = parseSide(cell(row, eventAt));
    if (side === "skip") {
      skip(draft, line, `${cell(row, eventAt).trim() || "This row"} is not a buy or a sell, so it was not saved.`);
      return;
    }
    if (side == null) {
      draft.errors.push({ line, message: `Line ${line}: Event "${cell(row, eventAt).trim()}" is not a buy or a sell. This row was not saved.` });
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
    const feeAsset = cell(row, feeAssetAt).trim().toUpperCase();
    const fee = !feeAsset || feeAsset === currency ? cell(row, feeAt) : "0";
    if (feeAsset && feeAsset !== currency && feeAsset !== cell(row, assetAt).trim().toUpperCase()) {
      draft.errors.push({ line, message: `Line ${line}: Fee currency ${feeAsset} is not the trade currency. This row was not saved.` });
      return;
    }
    pushTrade(
      draft,
      buildTrade(
        {
          line,
          date,
          ticker: cell(row, assetAt),
          side,
          quantity: cell(row, amountAt),
          price: cell(row, rateAt),
          fee,
          currency,
          fx: currency === "NZD" ? "1" : null,
          brokerRef: cell(row, refAt),
          value: cell(row, valueAt),
        },
        rates
      )
    );
  });
  return draft;
}
