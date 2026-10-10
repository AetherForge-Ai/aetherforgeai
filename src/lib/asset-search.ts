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
  /** Readable chain when the row is a DEX token, such as Ethereum. */
  chain?: string;
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

/** Leveraged and inverse products rank after the ordinary equity with the same letters. */
export function isLeveragedListing(symbol: string, name = ""): boolean {
  const s = symbol.toUpperCase();
  const n = name.toLowerCase();
  if (/[0-9](?:L|S)$/.test(s)) return true;
  if (/(?:^|[^A-Z0-9])X[0-9]/.test(s) || /[0-9]X/.test(s)) return true;
  if (/[23]X/.test(s)) return true;
  return n.includes("leveraged") || n.includes("ultra");
}

/**
 * Lower is a better match. An exact bare ticker beats a suffixed listing,
 * and both beat a leveraged product that merely starts with the same letters.
 */
export function tickerMatchRank(symbol: string, name: string, query: string): number {
  const q = query.trim().toUpperCase();
  const sym = symbol.trim().toUpperCase();
  const bare = sym.split(".")[0];
  const penalty = isLeveragedListing(sym, name) ? 40 : 0;
  if (!q) return 100 + penalty;
  if (sym === q) return penalty;
  if (bare === q) return 1 + penalty;
  if (bare.startsWith(q) || sym.startsWith(q)) return 10 + penalty;
  const hay = `${sym} ${name}`.toUpperCase();
  if (hay.includes(q)) return 20 + penalty;
  return 50 + penalty;
}

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
      const localListing = symbol === q || symbol === `${q}.nz` || symbol === `${q}.ax`;
      const exact = localListing ? 0 : symbol.startsWith(q) ? 1 : 2;
      // DEX stays ahead of a coin-list row. NZX and ASX stay ahead of a US fund with the same letters.
      const venue =
        hit.market === "DEX" ? 0 : hit.market === "NZX" ? 1 : hit.market === "ASX" ? 2 : hit.market === "Crypto" ? 3 : 4;
      const leveraged = isLeveragedListing(hit.symbol, hit.name) ? 30 : 0;
      return exact * 10 + venue + leveraged;
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
  rows: Array<{
    symbol?: string;
    name?: string;
    id?: string;
    detailId?: string | null;
    price?: number | null;
    network?: string | null;
  }>
): AssetHit[] {
  const hits: AssetHit[] = [];
  for (const row of rows) {
    const symbol = String(row.symbol || "").trim().toUpperCase();
    if (!symbol) continue;
    const price = Number(row.price);
    const chain = String(row.network || "").trim();
    hits.push({
      symbol,
      name: String(row.name || symbol),
      market: "DEX",
      assetType: "crypto",
      id: row.detailId || row.id,
      price: price > 0 ? price : null,
      chain: chain && chain !== "Unavailable" ? chain : undefined,
    });
  }
  return hits;
}
