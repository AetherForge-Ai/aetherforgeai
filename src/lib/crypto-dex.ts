/**
 * Pure parser for CoinGecko on-chain pool pages.
 * A missing price stays null. Nothing here invents a print.
 */

import type { CoinMarket } from "@/lib/crypto-market";

export interface DexTokenRow {
  id: string;
  symbol: string;
  name: string;
  price: number | null;
  priceUnavailable: boolean;
  volume24h: number | null;
  network: string;
  dex: string;
}

interface IncludedToken {
  symbol: string;
  name: string;
  coinId: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function num(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

function includedTokens(payload: Record<string, unknown>): Map<string, IncludedToken> {
  const out = new Map<string, IncludedToken>();
  const included = Array.isArray(payload.included) ? payload.included : [];
  for (const raw of included) {
    const row = asRecord(raw);
    if (!row || row.type !== "token") continue;
    const id = String(row.id || "");
    const attrs = asRecord(row.attributes) || {};
    const symbol = String(attrs.symbol || "").trim().toUpperCase();
    if (!id || !symbol) continue;
    out.set(id, {
      symbol,
      name: String(attrs.name || symbol),
      coinId: String(attrs.coingecko_coin_id || id),
    });
  }
  return out;
}

function relId(pool: Record<string, unknown>, name: string): string {
  const rels = asRecord(pool.relationships);
  const rel = rels ? asRecord(rels[name]) : null;
  const data = rel ? asRecord(rel.data) : null;
  return data ? String(data.id || "") : "";
}

const NETWORK_LABEL: Record<string, string> = {
  eth: "Ethereum",
  ethereum: "Ethereum",
  solana: "Solana",
  bsc: "BNB Chain",
  "binance-smart-chain": "BNB Chain",
  base: "Base",
  arbitrum: "Arbitrum",
  polygon_pos: "Polygon",
  "polygon-pos": "Polygon",
  avax: "Avalanche",
  avalanche: "Avalanche",
  optimism: "Optimism",
  "optimistic-ethereum": "Optimism",
  ton: "TON",
  aptos: "Aptos",
  worldchain: "World Chain",
  "world-chain": "World Chain",
  robinhood: "Robinhood Chain",
};

/** Public pool network id → a readable chain name. An empty id stays Unavailable. */
export function dexNetworkLabel(id: string | null | undefined): string {
  const key = (id || "").trim().toLowerCase();
  if (!key) return "Unavailable";
  if (NETWORK_LABEL[key]) return NETWORK_LABEL[key];
  return key
    .split(/[_-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * One pool page → base-token rows.
 * `fallbackNetwork` covers GeckoTerminal network pool pages, which omit the network relationship.
 * Duplicate pools in the page are kept; the caller dedupes.
 */
export function parseMegafilterPage(payload: unknown, fallbackNetwork = ""): DexTokenRow[] {
  const root = asRecord(payload);
  if (!root) return [];
  const tokens = includedTokens(root);
  const data = Array.isArray(root.data) ? root.data : [];
  const rows: DexTokenRow[] = [];
  for (const raw of data) {
    const pool = asRecord(raw);
    if (!pool) continue;
    const attrs = asRecord(pool.attributes) || {};
    const token = tokens.get(relId(pool, "base_token"));
    const symbol = token?.symbol || "";
    if (!symbol) continue;
    const price = num(attrs.base_token_price_usd);
    const live = price != null && price > 0 ? price : null;
    const volume = num(asRecord(attrs.volume_usd)?.h24);
    rows.push({
      id: token?.coinId || relId(pool, "base_token") || symbol.toLowerCase(),
      symbol,
      name: token?.name || symbol,
      price: live,
      priceUnavailable: live == null,
      volume24h: volume != null && volume > 0 ? volume : null,
      network: dexNetworkLabel(relId(pool, "network") || fallbackNetwork),
      dex: relId(pool, "dex") || "",
    });
  }
  return rows;
}

/** Keep the first live row for each symbol, then a priced-missing row if that is all we have. */
export function dedupeDexTokens(rows: DexTokenRow[], limit = 400): DexTokenRow[] {
  const bySymbol = new Map<string, DexTokenRow>();
  for (const row of rows) {
    const key = row.symbol.toUpperCase();
    const prev = bySymbol.get(key);
    if (!prev) {
      bySymbol.set(key, row);
      continue;
    }
    if (prev.priceUnavailable && !row.priceUnavailable) bySymbol.set(key, row);
  }
  return [...bySymbol.values()].slice(0, limit);
}

export function dexRowToCoin(row: DexTokenRow, rank: number): CoinMarket {
  return {
    id: row.id || row.symbol.toLowerCase(),
    symbol: row.symbol.toUpperCase(),
    name: row.name || row.symbol,
    image: "",
    rank,
    price: row.price && row.price > 0 ? row.price : 0,
    marketCap: 0,
    fdv: null,
    volume24h: row.volume24h ?? 0,
    change1h: null,
    change24h: 0,
    change7d: 0,
    high24h: null,
    low24h: null,
    circulatingSupply: null,
    totalSupply: null,
    maxSupply: null,
    ath: null,
    athDate: null,
    atl: null,
    atlDate: null,
    sparkline7d: [],
    blockchain: row.network || "Unavailable",
    priceUnavailable: row.priceUnavailable || !(row.price != null && row.price > 0),
  };
}
