import { CRYPTO_VENDORS } from "@/lib/crypto-vendors";
import { MARKET_UNIVERSE } from "@/lib/market-intel";

/** Curated ticker pages. Built from the code lists, not from a live scrape. */
export function publicTickerPaths(): string[] {
  const paths = new Set<string>();
  for (const entry of MARKET_UNIVERSE) {
    if (entry.market === "CRYPTO") continue;
    paths.add(`/markets/stock/${encodeURIComponent(entry.ticker)}`);
  }
  for (const vendor of Object.values(CRYPTO_VENDORS)) {
    if (!vendor.coingecko) continue;
    paths.add(`/markets/crypto/${encodeURIComponent(vendor.coingecko)}`);
  }
  return [...paths];
}
