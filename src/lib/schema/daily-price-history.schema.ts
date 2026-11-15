import type { TableSpec } from "./types";

/**
 * DAILY-PRICES-1. Definition only. This code does not create the table and does not
 * write it to the live database. Lukas creates it in Totalum, then sets
 * DAILY_PRICE_HISTORY_TABLE=on. Until then the page says "history unavailable".
 *
 * Append-only. The code looks up (date, market, symbol) and inserts only when no
 * row exists. It never updates or deletes. Totalum has no documented unique index,
 * so the one-row-per-key rule is enforced here.
 */
export const DAILY_PRICE_CLOSE: TableSpec = {
  ticket: "DAILY-PRICES-1",
  table: "daily_price_close",
  purpose: "One stored session close per date, market and symbol. Rows accumulate. A rerun does not replace a row.",
  fields: [
    { name: "date", type: "string", required: true, note: "Session date YYYY-MM-DD. The exchange session, not the capture morning." },
    { name: "market", type: "options", required: true, options: ["NZX", "ASX", "DOW", "NASDAQ"] },
    { name: "symbol", type: "string", required: true, note: "Index symbol (^NZ50, ^AXJO, ^DJI, ^IXIC) or a constituent ticker already in the universe." },
    { name: "close", type: "number", required: true, note: "Session close from a licence-cleared feed. Never a directory seed." },
    { name: "change", type: "number", note: "Session change when the feed sent one. Empty when it did not. Never filled with 0." },
    { name: "source", type: "string", required: true, note: "Feed id that produced the close." },
    { name: "captured_at", type: "date", required: true, includeHour: true, note: "When this row was first stored. Not rewritten." },
    { name: "idem_key", type: "string", required: true, note: "date|market|symbol. Lookup key. Not a second copy of the close." },
  ],
  indexes: [{ fields: ["idem_key"], unique: true }, { fields: ["date", "market", "symbol"], unique: true }, { fields: ["date"] }],
  access: "Server only. The public page reads rows. No user id is stored. Not a user-account table.",
  flag: "DAILY_PRICE_HISTORY_TABLE=on",
  rollback: [
    "Set DAILY_PRICE_HISTORY_TABLE off. The page shows history unavailable and the capture stores nothing.",
    "Then delete the daily_price_close table in Totalum. Existing rows are not required by any other table.",
  ],
};
