/**
 * Easy Crypto order history.
 * Easy Crypto's own portfolio-tracker guide (hub.easycrypto.com/portfolio-tracker-guide)
 * describes an order as a paid amount and currency, a received amount and
 * currency, and a rate. Koinly's Easy Crypto threads identify the download
 * by Order ID, and the 2022 format change kept both sides of the order
 * (from amount / from currency, to amount / to currency).
 * A buy spends the "from" fiat and receives the "to" crypto. A sell is the
 * reverse. Only a complete order is saved. The rate is the unit price.
 */

import { cell, headerIndex } from "@/lib/import/csv";
import { parseTradeDate } from "@/lib/import/dates";
import { emptyDraft, pushTrade, skip, type BrokerDraft } from "@/lib/import/draft";
import { buildTrade, parseSide } from "@/lib/import/trade";
import type { ImportCurrency, ImportSide } from "@/lib/import/types";

const FIAT = new Set(["NZD", "AUD", "USD"]);

export function parseEasyCrypto(grid: string[][], rates?: Record<string, number | null>): BrokerDraft {
  const draft = emptyDraft();
  const headers = grid[0] || [];
  const dateAt = headerIndex(headers, ["created", "date", "created at"]);
  const refAt = headerIndex(headers, ["order id"]);
  const sideAt = headerIndex(headers, ["side", "type"]);
  const statusAt = headerIndex(headers, ["status"]);
  const fromAmt = headerIndex(headers, ["from amount"]);
  const fromCcy = headerIndex(headers, ["from currency"]);
  const toAmt = headerIndex(headers, ["to amount"]);
  const toCcy = headerIndex(headers, ["to currency"]);
  const rateAt = headerIndex(headers, ["rate"]);
  const feeAt = headerIndex(headers, ["fee"]);
  const feeCcy = headerIndex(headers, ["fee currency"]);

  grid.slice(1).forEach((row, index) => {
    const line = index + 2;
    const status = cell(row, statusAt).trim().toLowerCase();
    if (status && !["complete", "completed", "filled", "settled"].includes(status)) {
      skip(draft, line, `Order status is ${cell(row, statusAt).trim()}. Only a complete order is saved.`);
      return;
    }
    const from = cell(row, fromCcy).trim().toUpperCase();
    const to = cell(row, toCcy).trim().toUpperCase();
    const declared = parseSide(cell(row, sideAt));
    let side: ImportSide | null = declared === "skip" ? null : declared;
    let ticker = "";
    let quantity = "";
    let currency: ImportCurrency | null = null;
    let value = "";
    if (FIAT.has(from) && !FIAT.has(to)) {
      side = side ?? "buy";
      ticker = to;
      quantity = cell(row, toAmt);
      currency = from as ImportCurrency;
      value = cell(row, fromAmt);
    } else if (!FIAT.has(from) && FIAT.has(to)) {
      side = side ?? "sell";
      ticker = from;
      quantity = cell(row, fromAmt);
      currency = to as ImportCurrency;
      value = cell(row, toAmt);
    }
    if (declared === "skip" || side == null || !ticker || !currency) {
      draft.errors.push({ line, message: `Line ${line}: This order is not a buy or a sell of crypto for NZD, AUD or USD. It was not saved.` });
      return;
    }
    const date = parseTradeDate(cell(row, dateAt), "iso");
    if (!date) {
      draft.errors.push({ line, message: `Line ${line}: Date "${cell(row, dateAt).trim()}" could not be read. This row was not saved.` });
      return;
    }
    const feeCurrency = cell(row, feeCcy).trim().toUpperCase();
    pushTrade(
      draft,
      buildTrade(
        {
          line,
          date,
          ticker,
          side,
          quantity,
          price: cell(row, rateAt),
          fee: !feeCurrency || feeCurrency === currency ? cell(row, feeAt) : "0",
          currency,
          fx: currency === "NZD" ? "1" : null,
          brokerRef: cell(row, refAt),
          value,
        },
        rates
      )
    );
  });
  return draft;
}
