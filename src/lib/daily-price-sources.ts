/**
 * Feeds this repo already uses for NZX, ASX, Dow Jones and Nasdaq prices.
 *
 * Yahoo Finance (keyless chart and spark) and Twelve Data (when MARKET_DATA_API_KEY
 * is set) are the equity quote feeds in src/lib/yahoo-finance.ts and src/lib/market-data.ts.
 * src/lib/market-freshness.ts records that the Yahoo licence is unconfirmed. Twelve Data's
 * terms for storing or redistributing a history are not recorded in this repo either.
 *
 * An unconfirmed feed is left out of capture, backfill and the numbers on the page.
 * DATA-LICENCE-REVIEW is the skip reason the cron reports.
 */

export const DATA_LICENCE_REVIEW = "DATA-LICENCE-REVIEW";

export type HistoryLicence = "allowed" | "unconfirmed";
export type DailyMarket = "NZX" | "ASX" | "DOW" | "NASDAQ";

export interface DailyPriceFeed {
  id: string;
  licence: HistoryLicence;
  markets: readonly DailyMarket[];
  /** Where the repo already reads this feed. */
  usedBy: string;
  note: string;
}

export const DAILY_PRICE_FEEDS: readonly DailyPriceFeed[] = [
  {
    id: "yahoo-finance",
    licence: "unconfirmed",
    markets: ["NZX", "ASX", "DOW", "NASDAQ"],
    usedBy: "src/lib/yahoo-finance.ts",
    note: "Keyless Yahoo chart and spark. The repo says the Yahoo licence is unconfirmed. Not stored.",
  },
  {
    id: "twelve-data",
    licence: "unconfirmed",
    markets: ["NZX", "ASX", "DOW", "NASDAQ"],
    usedBy: "src/lib/market-data.ts",
    note: "Twelve Data quotes when MARKET_DATA_API_KEY is set. Storage terms are not in the repo. Not stored.",
  },
];

export function historyStoreAllowed(source: string, feeds: readonly DailyPriceFeed[] = DAILY_PRICE_FEEDS): boolean {
  const id = source.trim().toLowerCase();
  if (!id) return false;
  const feed = feeds.find((item) => item.id === id);
  return !!feed && feed.licence === "allowed";
}

export function feedsLeftOut(feeds: readonly DailyPriceFeed[] = DAILY_PRICE_FEEDS): DailyPriceFeed[] {
  return feeds.filter((feed) => feed.licence !== "allowed");
}
