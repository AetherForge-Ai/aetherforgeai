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
  { symbol: "PEPE", name: "Pepe", market: "DEX", assetType: "crypto", id: "pepe" },
  { symbol: "UNI", name: "Uniswap", market: "DEX", assetType: "crypto", id: "uniswap" },
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
  const seen = new Map<string, number>();
  const hits: AssetHit[] = [];
  for (const hit of all) {
    if (!hit?.symbol) continue;
    const id = key(hit);
    if (!haystack(hit).includes(q)) continue;
    const priced = hit.price != null && hit.price > 0;
    const prev = seen.get(id);
    if (prev != null) {
      const earlier = hits[prev];
      const earlierPriced = earlier.price != null && earlier.price > 0;
      if (!earlierPriced && priced) hits[prev] = hit;
      continue;
    }
    seen.set(id, hits.length);
    hits.push(hit);
  }
  hits.sort((a, b) => {
    const rank = (hit: AssetHit) => {
      const symbol = hit.symbol.toLowerCase();
      const exact = symbol === q ? 0 : symbol.startsWith(q) ? 1 : 2;
      // A DEX row stays reachable beside a CoinGecko coin of the same name.
      const venue = hit.market === "DEX" ? 0 : 1;
      return exact * 2 + venue;
    };
    const diff = rank(a) - rank(b);
    if (diff !== 0) return diff;
    const ap = a.price != null && a.price > 0 ? 0 : 1;
    const bp = b.price != null && b.price > 0 ? 0 : 1;
    if (ap !== bp) return ap - bp;
    return a.name.localeCompare(b.name);
  });
  return hits.slice(0, 12);
}

/** Record-panel rows for the DEX list. The badge is DEX, and a live price is kept. */
export function dexSearchHits(
  rows: Array<{ symbol?: string; name?: string; id?: string; detailId?: string | null; price?: number | null }>
): AssetHit[] {
  const hits: AssetHit[] = [];
  for (const row of rows) {
    const symbol = String(row.symbol || "").trim().toUpperCase();
    if (!symbol) continue;
    const price = Number(row.price);
    hits.push({
      symbol,
      name: String(row.name || symbol),
      market: "DEX",
      assetType: "crypto",
      id: row.detailId || row.id,
      price: price > 0 ? price : null,
    });
  }
  return hits;
}
