import { CRYPTO_VENDORS } from "@/lib/crypto-vendors";
import { catalogTickerPaths } from "@/lib/stock-catalog";

/**
 * Ticker pages that render a name from the stock catalog or a mapped crypto id.
 * The stock list is capped inside catalogTickerPaths so the sitemap stays under 50,000 URLs.
 */
export function publicTickerPaths(): string[] {
  const paths = new Set<string>(catalogTickerPaths());
  for (const vendor of Object.values(CRYPTO_VENDORS)) {
    if (!vendor.coingecko) continue;
    paths.add(`/markets/crypto/${encodeURIComponent(vendor.coingecko)}`);
  }
  return [...paths];
}
