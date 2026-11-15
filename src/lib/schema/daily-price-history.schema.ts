import type { TableSpec } from "./types";

/**
 * DAILY-PRICES-1. Definition only. This code does not create the table and does not
 * write it to the live database. Lukas creates it in Totalum, then sets
 * DAILY_PRICE_HISTORY_TABLE=on. Until then the page says "history unavailable".
 *
 * Append-only. The code looks up idem_key and inserts only when no row exists.
 * It never updates or deletes a close. Totalum has no documented unique index
 * (UNKNOWN). idem_key is still marked unique so Release can add that index if
 * the Totalum UI allows it. The code enforces the same rule with a re-check.
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
    { name: "idem_key", type: "string", required: true, note: "date|market|symbol. Unique in code, and a unique index if Totalum supports one (UNKNOWN)." },
  ],
  indexes: [{ fields: ["idem_key"], unique: true }, { fields: ["date", "market", "symbol"], unique: true }, { fields: ["date"] }],
  access: "Server only. The public page reads rows. No user id is stored. Not a user-account table.",
  flag: "DAILY_PRICE_HISTORY_TABLE=on",
  rollback: [
    "Set DAILY_PRICE_HISTORY_TABLE off. The page shows history unavailable and the capture stores nothing.",
    "Then delete the daily_price_close table in Totalum. Existing rows are not required by any other table.",
  ],
};

/**
 * One row so two captures cannot insert the same closes together.
 * Not a price. The code does not create this table.
 */
export const DAILY_PRICE_CAPTURE_LOCK: TableSpec = {
  ticket: "DAILY-PRICES-1",
  table: "daily_price_capture_lock",
  purpose: "A short-lived lock for the daily close capture. The holder is the only run allowed to insert.",
  fields: [
    { name: "lock_key", type: "string", required: true, note: "Always daily-prices. Unique in code, and a unique index if Totalum supports one (UNKNOWN)." },
    { name: "owner", type: "string", required: true, note: "Id of the run that inserted this row." },
    { name: "acquired_at", type: "date", required: true, includeHour: true },
    { name: "expires_at", type: "date", required: true, includeHour: true, note: "Another run may start after this time. Release moves it forward to now." },
  ],
  indexes: [{ fields: ["lock_key"], unique: true }],
  access: "Server only. No user id. Not a price and not a user-account table.",
  flag: "DAILY_PRICE_HISTORY_TABLE=on",
  rollback: [
    "Set DAILY_PRICE_HISTORY_TABLE off. The capture stores nothing.",
    "Then delete daily_price_capture_lock in Totalum.",
  ],
};
