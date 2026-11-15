/**
 * Feeds this repo already uses for NZX, ASX, Dow Jones and Nasdaq prices.
 *
 * Twelve Data is the stored daily-close feed. approved by Lukas 15 Nov 2026.
 * It is read with the existing MARKET_DATA_API_KEY (src/lib/market-data.ts and the
 * time_series call in src/lib/market-universe.ts). Yahoo Finance stays unconfirmed
 * and is left out of capture, backfill and this page.
 * DATA-LICENCE-REVIEW is the skip reason for a feed that is not allowed.
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
    note: "Keyless Yahoo chart and spark. The Yahoo licence is unconfirmed. Not stored.",
  },
  {
    id: "twelve-data",
    licence: "allowed",
    markets: ["NZX", "ASX", "DOW", "NASDAQ"],
    usedBy: "src/lib/market-data.ts",
    note: "approved by Lukas 15 Nov 2026",
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
