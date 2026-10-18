/**
 * Interactive Brokers.
 * Flex Query trade columns (ClientAccountID, TradeDate, Symbol, Quantity,
 * TradePrice, IBCommission, Buy/Sell, CurrencyPrimary, FXRateToBase, Proceeds)
 * are the fields IBKR's Flex query trade section exports. FXRateToBase is
 * NZD per 1 unit when the account base is NZD. A USD rate below 1 is the
 * other direction.
 * The activity-statement CSV (Reports → Activity → CSV) is the sectioned
 * file documented at ibkrguides.com "Trades - Default Activity Statement"
 * and in the Pitly sample: Trades,Header,…,T. Price,Comm/Fee. That file has
 * no FX column, so a reviewed trade-date rate is required.
 */

import { cell, headerIndex, normHeader } from "@/lib/import/csv";
import { parseTradeDate } from "@/lib/import/dates";
import { emptyDraft, pushTrade, skip, type BrokerDraft } from "@/lib/import/draft";
import { buildTrade, parseSide } from "@/lib/import/trade";
import { parseDecimal, scaledToNumber } from "@/lib/import/money";
import type { ImportCurrency } from "@/lib/import/types";

export function isIbkrActivity(grid: string[][]): boolean {
  return grid.some((row) => normHeader(row[0] || "") === "trades" && normHeader(row[1] || "") === "header" && row.some((c) => normHeader(c) === "t. price"));
}

export function parseIbkr(grid: string[][], rates?: Record<string, number | null>): BrokerDraft {
  if (isIbkrActivity(grid)) return parseActivity(grid, rates);
  return parseFlex(grid, rates);
}

function currencyOf(raw: string): ImportCurrency | null {
  const text = raw.trim().toUpperCase();
  if (text === "NZD" || text === "AUD" || text === "USD") return text;
  return null;
}

function parseFlex(grid: string[][], rates?: Record<string, number | null>): BrokerDraft {
  const draft = emptyDraft();
  const headers = grid[0] || [];
  const dateAt = headerIndex(headers, ["tradedate", "trade date"]);
  const symbolAt = headerIndex(headers, ["symbol"]);
  const qtyAt = headerIndex(headers, ["quantity"]);
  const priceAt = headerIndex(headers, ["tradeprice", "trade price"]);
  const feeAt = headerIndex(headers, ["ibcommission", "ib commission"]);
  const sideAt = headerIndex(headers, ["buy/sell"]);
  const ccyAt = headerIndex(headers, ["currencyprimary", "currency primary"]);
  const fxAt = headerIndex(headers, ["fxratetobase", "fx rate to base"]);
  const proceedsAt = headerIndex(headers, ["proceeds"]);
  const descAt = headerIndex(headers, ["description"]);
  // Broker sync: IBKR's TradeID (or IBExecID) is the duplicate key across files and syncs.
  const refAt = headerIndex(headers, ["tradeid", "trade id", "ibexecid"]);

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
    const currency = currencyOf(cell(row, ccyAt));
    if (!currency) {
      draft.errors.push({ line, message: `Line ${line}: Currency must be NZD, AUD or USD. This row was not saved.` });
      return;
    }
    const quantity = cell(row, qtyAt);
    pushTrade(
      draft,
      buildTrade(
        {
          line,
          date,
          ticker: cell(row, symbolAt),
          side,
          quantity,
          price: cell(row, priceAt),
          fee: cell(row, feeAt),
          currency,
          fx: cell(row, fxAt),
          assetName: cell(row, descAt),
          value: cell(row, proceedsAt),
          brokerRef: refAt >= 0 && cell(row, refAt).trim() ? `ibkr-${cell(row, refAt).trim()}` : undefined,
        },
        rates
      )
    );
  });
  return draft;
}

function parseActivity(grid: string[][], rates?: Record<string, number | null>): BrokerDraft {
  const draft = emptyDraft();
  const headerAt = grid.findIndex((row) => normHeader(row[1] || "") === "header" && row.some((c) => normHeader(c) === "t. price"));
  if (headerAt < 0) return draft;
  const headers = grid[headerAt];
  const ccyAt = headers.findIndex((h) => normHeader(h) === "currency");
  const symbolAt = headers.findIndex((h) => normHeader(h) === "symbol");
  const dateAt = headers.findIndex((h) => normHeader(h) === "date/time");
  const qtyAt = headers.findIndex((h) => normHeader(h) === "quantity");
  const priceAt = headers.findIndex((h) => normHeader(h) === "t. price");
  const feeAt = headers.findIndex((h) => normHeader(h) === "comm/fee");

  grid.forEach((row, index) => {
    if (normHeader(row[0] || "") !== "trades" || normHeader(row[1] || "") !== "data") return;
    const line = index + 1;
    const discriminator = normHeader(row[2] || "");
    if (discriminator && discriminator !== "order" && discriminator !== "trade") {
      skip(draft, line, "This activity-statement row is a total, not a trade. It was not saved.");
      return;
    }
    const signed = parseDecimal(cell(row, qtyAt));
    if (signed == null || signed === BigInt(0)) {
      draft.errors.push({ line, message: `Line ${line}: Quantity could not be read. This row was not saved.` });
      return;
    }
    const side = signed < BigInt(0) ? "sell" : "buy";
    const date = parseTradeDate(cell(row, dateAt), "iso");
    if (!date) {
      draft.errors.push({ line, message: `Line ${line}: Date "${cell(row, dateAt).trim()}" could not be read. This row was not saved.` });
      return;
    }
    const currency = currencyOf(cell(row, ccyAt));
    if (!currency) {
      draft.errors.push({ line, message: `Line ${line}: Currency must be NZD, AUD or USD. This row was not saved.` });
      return;
    }
    pushTrade(
      draft,
      buildTrade(
        {
          line,
          date,
          ticker: cell(row, symbolAt),
          side,
          quantity: String(scaledToNumber(signed < BigInt(0) ? -signed : signed)),
          price: cell(row, priceAt),
          fee: cell(row, feeAt),
          currency,
          fx: null,
        },
        rates
      )
    );
  });
  return draft;
}
