/**
 * Market data feed mapping for known AetherForge holdings / watchlist names.
 * Used by live quotes, fill-integrity spot lookup, and repair tooling.
 */

export type FeedKind = "yahoo" | "coingecko" | "metals" | "swyftx";

export interface FeedMapEntry {
  ticker: string;
  name: string;
  asset_type: "stock" | "crypto" | "metal";
  feed: FeedKind;
  /** Provider symbol / id (Yahoo symbol, CoinGecko id, or metal key). */
  providerId: string;
  currency: "NZD" | "AUD" | "USD";
  notes?: string;
}

export const FEED_MAPPING: FeedMapEntry[] = [
  { ticker: "PFI.NZ", name: "Precinct Properties NZ", asset_type: "stock", feed: "yahoo", providerId: "PFI.NZ", currency: "NZD" },
  { ticker: "BAP.AX", name: "Bapcor", asset_type: "stock", feed: "yahoo", providerId: "BAP.AX", currency: "AUD" },
  { ticker: "AVH.AX", name: "Avita Medical", asset_type: "stock", feed: "yahoo", providerId: "AVH.AX", currency: "AUD" },
  { ticker: "NST.AX", name: "Northern Star Resources", asset_type: "stock", feed: "yahoo", providerId: "NST.AX", currency: "AUD" },
  { ticker: "WOR.AX", name: "Worley", asset_type: "stock", feed: "yahoo", providerId: "WOR.AX", currency: "AUD" },
  { ticker: "NEU.AX", name: "Neuren Pharmaceuticals", asset_type: "stock", feed: "yahoo", providerId: "NEU.AX", currency: "AUD" },
  { ticker: "CIP.AX", name: "Centuria Industrial REIT", asset_type: "stock", feed: "yahoo", providerId: "CIP.AX", currency: "AUD" },
  { ticker: "CCX.AX", name: "City Chic Collective", asset_type: "stock", feed: "yahoo", providerId: "CCX.AX", currency: "AUD" },
  { ticker: "AD8.AX", name: "Audinate Group", asset_type: "stock", feed: "yahoo", providerId: "AD8.AX", currency: "AUD" },
  { ticker: "STO.AX", name: "Santos", asset_type: "stock", feed: "yahoo", providerId: "STO.AX", currency: "AUD" },
  { ticker: "CDW", name: "CDW Corporation", asset_type: "stock", feed: "yahoo", providerId: "CDW", currency: "USD" },
  { ticker: "APT", name: "Aptos", asset_type: "crypto", feed: "coingecko", providerId: "aptos", currency: "USD", notes: "USD per 1 whole APT" },
  { ticker: "UNI", name: "Uniswap", asset_type: "crypto", feed: "coingecko", providerId: "uniswap", currency: "USD", notes: "USD per 1 whole UNI" },
  { ticker: "ARB", name: "Arbitrum", asset_type: "crypto", feed: "coingecko", providerId: "arbitrum", currency: "USD", notes: "USD per 1 whole ARB" },
  { ticker: "OP", name: "Optimism", asset_type: "crypto", feed: "coingecko", providerId: "optimism", currency: "USD", notes: "USD per 1 whole OP" },
  { ticker: "SOL", name: "Solana", asset_type: "crypto", feed: "coingecko", providerId: "solana", currency: "USD", notes: "USD per 1 whole SOL" },
  { ticker: "GOLD", name: "Gold bullion", asset_type: "metal", feed: "metals", providerId: "gold", currency: "NZD" },
  { ticker: "SILVER", name: "Silver bullion", asset_type: "metal", feed: "metals", providerId: "silver", currency: "NZD" },
];

export function feedEntryForTicker(ticker: string): FeedMapEntry | undefined {
  const t = (ticker || "").toUpperCase().trim();
  return FEED_MAPPING.find((e) => e.ticker === t);
}
