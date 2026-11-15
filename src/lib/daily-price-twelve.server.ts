import "server-only";

import { loadTwelveDailyBars, loadTwelveDailyBatch, type TwelveBatchFetchRequest, type TwelveFetchRequest } from "@/lib/daily-price-twelve";
import type { FeedBar } from "@/lib/daily-price-history";
import type { DirectoryName } from "@/lib/daily-price-directory";
import type { DailyMarket } from "@/lib/daily-price-sources";

/** One Twelve Data daily series. The request URL holds the key and is not logged. */
export async function fetchTwelveDailyBars(
  symbol: string,
  market: DailyMarket,
  dates: readonly string[]
): Promise<FeedBar[] | null> {
  return loadTwelveDailyBars({
    symbol,
    market,
    dates,
    fetchImpl: async (req: TwelveFetchRequest) => {
      const res = await fetch(req.url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) {
        console.error(`[daily-prices] Twelve Data HTTP ${res.status} for ${symbol}`);
        return null;
      }
      return res.json();
    },
  });
}

/** One time_series request for a batch that already shares a market and country. The URL is not logged. */
export async function fetchTwelveDailyBatch(
  names: readonly DirectoryName[],
  dates: readonly string[]
): Promise<Map<string, FeedBar[] | null>> {
  return loadTwelveDailyBatch({
    names,
    dates,
    fetchImpl: async (req: TwelveBatchFetchRequest) => {
      const res = await fetch(req.url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) {
        console.error(`[daily-prices] Twelve Data HTTP ${res.status} for ${req.symbols.length} symbols`);
        return null;
      }
      return res.json();
    },
  });
}
