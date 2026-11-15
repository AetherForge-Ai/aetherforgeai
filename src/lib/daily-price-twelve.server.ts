import "server-only";

import { loadTwelveDailyBars, type TwelveFetchRequest } from "@/lib/daily-price-twelve";
import type { FeedBar } from "@/lib/daily-price-history";
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
