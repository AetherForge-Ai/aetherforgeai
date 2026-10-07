/**
 * One search across shares, CoinGecko-style coins, DEX tokens, gold and silver.
 * PEPE and Uniswap are always findable, even before a live list has loaded.
 */

export type AssetMarket = "NZX" | "ASX" | "US" | "Crypto" | "DEX" | "Gold" | "Silver";

export interface AssetHit {
  symbol: string;
  name: string;
  market: AssetMarket;
  assetType: "stock" | "crypto" | "metal";
  /** CoinGecko or DEX id when the row is a coin. */
  id?: string;
  price?: number | null;
}

export interface AssetSearchPools {
  shares?: AssetHit[];
  coins?: AssetHit[];
  dex?: AssetHit[];
}

const PINNED: AssetHit[] = [
  { symbol: "PEPE", name: "Pepe", market: "Crypto", assetType: "crypto", id: "pepe" },
  { symbol: "UNI", name: "Uniswap", market: "Crypto", assetType: "crypto", id: "uniswap" },
  { symbol: "GOLD", name: "Gold", market: "Gold", assetType: "metal" },
  { symbol: "SILVER", name: "Silver", market: "Silver", assetType: "metal" },
];

function haystack(hit: AssetHit): string {
  return `${hit.symbol} ${hit.name}`.toLowerCase();
}

function key(hit: AssetHit): string {
  return `${hit.market}:${hit.symbol.toUpperCase()}:${(hit.id || "").toLowerCase()}`;
}

/** Rank matches: exact symbol, then symbol prefix, then name. Pinned names stay available offline. */
export function searchAssets(query: string, pools: AssetSearchPools = {}): AssetHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const all = [...PINNED, ...(pools.shares || []), ...(pools.coins || []), ...(pools.dex || [])];
  const seen = new Set<string>();
  const hits: AssetHit[] = [];
  for (const hit of all) {
    if (!hit?.symbol) continue;
    const id = key(hit);
    if (seen.has(id)) continue;
    if (!haystack(hit).includes(q)) continue;
    seen.add(id);
    hits.push(hit);
  }
  hits.sort((a, b) => {
    const as = a.symbol.toLowerCase();
    const bs = b.symbol.toLowerCase();
    const aExact = as === q ? 0 : as.startsWith(q) ? 1 : 2;
    const bExact = bs === q ? 0 : bs.startsWith(q) ? 1 : 2;
    if (aExact !== bExact) return aExact - bExact;
    return a.name.localeCompare(b.name);
  });
  return hits.slice(0, 12);
}
