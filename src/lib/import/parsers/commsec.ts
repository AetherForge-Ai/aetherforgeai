/**
 * CommSec confirmations CSV (ASX domestic).
 * Columns from the CommSec Confirmations download
 * (Trade → Manage Orders → Confirmations → Download CSV), as published in the
 * HairyTurtle trade-confirmation sample and the Navexa CommSec CSV guide:
 * Confirmation Number, Order Number, Trade Date, Buy/Sell, Security, Units,
 * Average Price ($), Brokerage (inc GST.), Net Proceeds ($), Settlement Date,
 * Confirmation Status.
 * Dates are day-first. Buy/Sell is B or S. A bare security code is the ASX
 * listing, because this export is the domestic confirmations file.
 * The file has no NZD rate. A reviewed AUD rate for the trade date is used.
 * No rate is guessed.
 */

import { cell, headerIndex } from "@/lib/import/csv";
import { parseTradeDate } from "@/lib/import/dates";
import { emptyDraft, pushTrade, skip, type BrokerDraft } from "@/lib/import/draft";
import { buildTrade, parseSide } from "@/lib/import/trade";

export function parseCommsec(grid: string[][], rates?: Record<string, number | null>): BrokerDraft {
  const draft = emptyDraft();
  const headers = grid[0] || [];
  const refAt = headerIndex(headers, ["confirmation number"]);
  const dateAt = headerIndex(headers, ["trade date"]);
  const sideAt = headerIndex(headers, ["buy/sell"]);
  const codeAt = headerIndex(headers, ["security"]);
  const qtyAt = headerIndex(headers, ["units"]);
  const priceAt = headerIndex(headers, ["average price ($)", "average price"]);
  const feeAt = headerIndex(headers, ["brokerage (inc gst.)", "brokerage"]);
  const netAt = headerIndex(headers, ["net proceeds ($)", "net proceeds"]);
  const statusAt = headerIndex(headers, ["confirmation status"]);

  grid.slice(1).forEach((row, index) => {
    const line = index + 2;
    const status = cell(row, statusAt).trim().toLowerCase();
    if (status && status !== "confirmed") {
      skip(draft, line, `Confirmation status is ${cell(row, statusAt).trim() || "blank"}. Only a confirmed trade is saved.`);
      return;
    }
    const side = parseSide(cell(row, sideAt));
    if (side === "skip" || side == null) {
      draft.errors.push({ line, message: `Line ${line}: Side "${cell(row, sideAt).trim()}" is not a buy or a sell. This row was not saved.` });
      return;
    }
    const date = parseTradeDate(cell(row, dateAt), "dmy");
    if (!date) {
      draft.errors.push({ line, message: `Line ${line}: Date "${cell(row, dateAt).trim()}" could not be read. This row was not saved.` });
      return;
    }
    const code = cell(row, codeAt).trim().toUpperCase();
    const ticker = code.includes(".") ? code : `${code}.AX`;
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
          currency: "AUD",
          fx: null,
          brokerRef: cell(row, refAt),
          net: cell(row, netAt),
        },
        rates
      )
    );
  });
  return draft;
}
