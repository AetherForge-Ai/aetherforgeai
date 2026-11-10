import { CRYPTO_VENDORS } from "@/lib/crypto-vendors";
import { publicCoinSlug } from "@/lib/crypto-slug";
import { catalogTickerPaths } from "@/lib/stock-catalog";
import { isJunkCoin } from "@/lib/coin-junk";

/**
 * Ticker pages that render a name from the stock catalog or a mapped crypto id.
 * The stock list is capped inside catalogTickerPaths so the sitemap stays under 50,000 URLs.
 */
export function publicTickerPaths(): string[] {
  // H-13: stock pages are noindex until STOCK_PAGE_INDEXING=1, so keep them
  // out of the sitemap too.
  const paths = new Set<string>(process.env.STOCK_PAGE_INDEXING === "1" ? catalogTickerPaths() : []);
  for (const vendor of Object.values(CRYPTO_VENDORS)) {
    if (!vendor.coingecko) continue;
    const slug = publicCoinSlug(vendor.coingecko);
    if (!slug || isJunkCoin(slug)) continue;
    paths.add(`/markets/crypto/${encodeURIComponent(slug)}`);
  }
  return [...paths];
}
