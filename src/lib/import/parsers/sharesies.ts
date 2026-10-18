/**
 * Sharesies Transaction Report CSV.
 * Columns from the Sharesies export read by kevindoran/nzfiftax
 * (Order ID, Trade date, Instrument code, Market code, Quantity, Price,
 * Transaction type, Exchange rate, Exchange fee, Transaction fee, Currency, Amount).
 * The "Oder ID" spelling in that source is the same column as Order ID.
 * Export path: Account → Generate Reports → Transaction Report CSV
 * (Portseido and Snowball Analytics, both citing the Sharesies app).
 * Exchange rate is NZD per 1 unit of the trade currency.
 */

import { cell, headerIndex } from "@/lib/import/csv";
import { parseTradeDate } from "@/lib/import/dates";
import { emptyDraft, pushTrade, skip, type BrokerDraft } from "@/lib/import/draft";
import { buildTrade, marketTicker, parseSide } from "@/lib/import/trade";
import { parseDecimal } from "@/lib/import/money";

export function parseSharesies(grid: string[][], rates?: Record<string, number | null>): BrokerDraft {
  const draft = emptyDraft();
  const headers = grid[0] || [];
  const dateAt = headerIndex(headers, ["trade date", "date"]);
  const codeAt = headerIndex(headers, ["instrument code"]);
  const marketAt = headerIndex(headers, ["market code"]);
  const qtyAt = headerIndex(headers, ["quantity"]);
  const priceAt = headerIndex(headers, ["price"]);
  const typeAt = headerIndex(headers, ["transaction type"]);
  const fxAt = headerIndex(headers, ["exchange rate"]);
  const exFeeAt = headerIndex(headers, ["exchange fee"]);
  const feeAt = headerIndex(headers, ["transaction fee"]);
  const ccyAt = headerIndex(headers, ["currency"]);
  const amountAt = headerIndex(headers, ["amount"]);
  const refAt = headerIndex(headers, ["order id", "oder id"]);
  const nameAt = headerIndex(headers, ["instrument name"]);

  grid.slice(1).forEach((row, index) => {
    const line = index + 2;
    const side = parseSide(cell(row, typeAt));
    if (side === "skip") {
      skip(draft, line, `${cell(row, typeAt).trim() || "This row"} is not a buy or a sell, so it was not saved.`);
      return;
    }
    if (side == null) {
      draft.errors.push({ line, message: `Line ${line}: Side "${cell(row, typeAt).trim()}" is not a buy or a sell. This row was not saved.` });
      return;
    }
    const date = parseTradeDate(cell(row, dateAt), "dmy");
    if (!date) {
      draft.errors.push({ line, message: `Line ${line}: Date "${cell(row, dateAt).trim()}" could not be read. This row was not saved.` });
      return;
    }
    const currency = cell(row, ccyAt).trim().toUpperCase();
    if (currency !== "NZD" && currency !== "AUD" && currency !== "USD") {
      draft.errors.push({ line, message: `Line ${line}: Currency must be NZD, AUD or USD. This row was not saved.` });
      return;
    }
    const fee = sumFees(cell(row, feeAt), cell(row, exFeeAt));
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
          fee,
          currency,
          fx: cell(row, fxAt),
          brokerRef: cell(row, refAt),
          assetName: cell(row, nameAt),
          value: cell(row, amountAt),
        },
        rates
      )
    );
  });
  return draft;
}

function sumFees(a: string, b: string): string {
  const left = parseDecimal(a) ?? BigInt(0);
  const right = parseDecimal(b) ?? BigInt(0);
  const total = (left < BigInt(0) ? -left : left) + (right < BigInt(0) ? -right : right);
  const digits = total.toString().padStart(9, "0");
  const whole = digits.slice(0, -8) || "0";
  const frac = digits.slice(-8).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}
