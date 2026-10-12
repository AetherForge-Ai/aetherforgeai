/**
 * Keyless crypto and DEX list seed.
 *
 * A page read with an empty snapshot cannot wait for a cron job or a CoinGecko
 * key. This module asks the public list endpoints and keeps a price only when
 * it agrees with the other prints in the same read, or when it is the only
 * print. A 3× split is dropped. It is not averaged and not shown.
 * Swyftx and DexScreener stay out while their display flags are off.
 *
 * pull-check:v3-crypto-seed-2026-10-12
 */

import { coinGeckoEndpoint, MARKET_USER_AGENT } from "@/lib/coingecko-auth";
import { snapshotBlockchain } from "@/lib/crypto-board";
import {
  dexNetworkLabel,
  dexRowClearsFloor,
  parseMegafilterPage,
  type DexTokenRow,
} from "@/lib/crypto-dex";
import { canonicalCryptoId } from "@/lib/crypto-ids";
import { coinDisplayName } from "@/lib/crypto-names";
import type { CoinMarket } from "@/lib/crypto-market";
import { sourceLabel } from "@/lib/crypto-price-chain";
import { CRYPTO_SANITY_RATIO, isStablecoinTicker } from "@/lib/crypto-tape";
import { publicSourceAllowed } from "@/lib/swyftx-display";

export const KEYLESS_SEED_BUDGET_MS = 7_000;
export const YAHOO_BACKUP_FLOOR = 40;
const SOURCE_TIMEOUT_MS = 5_500;
const STABLE_BAND = 0.02;
const LIST_CAP = 400;

const SOURCE_ORDER = [
  "coingecko",
  "coinpaprika",
  "coincap",
  "binance",
  "kraken",
  "coinbase",
  "yahoo",
  "geckoterminal",
  "dexpaprika",
];

const CG_QUERY =
  "vs_currency=usd&order=market_cap_desc&per_page=250&sparkline=false&price_change_percentage=1h,24h,7d,30d";

const GT_ACCEPT = "application/json;version=20230302";
const GT_BASE = "https://api.geckoterminal.com/api/v2";
const PAPRIKA_TICKERS = "https://api.coinpaprika.com/v1/tickers?quotes=USD";
/** CoinCap v2's host does not resolve. v3 needs a key and is skipped without one. */
const COINCAP_ASSETS = "https://rest.coincap.io/v3/assets?limit=200";
const BINANCE_TICKERS = "https://data-api.binance.vision/api/v3/ticker/24hr";

const DEX_NETWORKS = ["ethereum", "solana", "base", "bsc"] as const;
const GT_NETWORKS = ["eth", "solana", "base", "bsc"] as const;

/**
 * Base-token labels for DexPaprika pools. That feed sends an address and a
 * pool price, not a symbol. Unknown addresses are skipped.
 */
const DEX_TOKEN_BOOK: Record<string, { symbol: string; name: string }> = {
  "ethereum:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": { symbol: "WETH", name: "Wrapped Ether" },
  "ethereum:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": { symbol: "USDC", name: "USD Coin" },
  "ethereum:0xdac17f958d2ee523a2206206994597c13d831ec7": { symbol: "USDT", name: "Tether" },
  "ethereum:0x6b175474e89094c44da98b954eedeac495271d0f": { symbol: "DAI", name: "Dai" },
  "ethereum:0x2260fac5e5542a773aa44fbcfedf7c193bc2c599": { symbol: "WBTC", name: "Wrapped Bitcoin" },
  "ethereum:0x6982508145454ce325ddbe47a25d4ec3d2311933": { symbol: "PEPE", name: "Pepe" },
  "ethereum:0x514910771af9ca656af840dff83e8264ecf986ca": { symbol: "LINK", name: "Chainlink" },
  "ethereum:0x1f9840a85d5af5bf1d1762f925bdaddc4201f984": { symbol: "UNI", name: "Uniswap" },
  "ethereum:0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce": { symbol: "SHIB", name: "Shiba Inu" },
  "ethereum:0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9": { symbol: "AAVE", name: "Aave" },
  "ethereum:0x5a98fcbea516cf06857215779fd812ca3bef1b32": { symbol: "LDO", name: "Lido DAO" },
  "solana:So11111111111111111111111111111111111111112": { symbol: "SOL", name: "Solana" },
  "solana:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": { symbol: "USDC", name: "USD Coin" },
  "solana:Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB": { symbol: "USDT", name: "Tether" },
  "base:0x4200000000000000000000000000000000000006": { symbol: "WETH", name: "Wrapped Ether" },
  "base:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": { symbol: "USDC", name: "USD Coin" },
  "bsc:0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c": { symbol: "WBNB", name: "Wrapped BNB" },
  "bsc:0x55d398326f99059ff775485246999027b3197955": { symbol: "USDT", name: "Tether" },
};

export type SeedFetch = (url: string, init?: RequestInit) => Promise<Response>;

let seedFetchOverride: SeedFetch | null = null;

export function installSeedFetch(fetcher: SeedFetch | null) {
  seedFetchOverride = fetcher;
}

export function resetSeedFetch() {
  seedFetchOverride = null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function num(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function sourceRank(source: string | undefined): number {
  const id = (source || "").toLowerCase();
  const index = SOURCE_ORDER.indexOf(id);
  return index === -1 ? SOURCE_ORDER.length : index;
}

function pricesAgree(a: number, b: number): boolean {
  if (!(a > 0) || !(b > 0)) return false;
  const span = a > b ? a / b : b / a;
  return span <= CRYPTO_SANITY_RATIO;
}

function pegOk(symbol: string, price: number): boolean {
  if (!isStablecoinTicker(symbol)) return true;
  return Math.abs(price - 1) <= STABLE_BAND;
}

function blankCoin(partial: Partial<CoinMarket> & Pick<CoinMarket, "id" | "symbol" | "name" | "price">): CoinMarket {
  const symbol = partial.symbol.toUpperCase();
  const id = partial.id || canonicalCryptoId(symbol);
  return {
    id,
    symbol,
    name: coinDisplayName(symbol, partial.name),
    image: partial.image || "",
    rank: partial.rank ?? 999999,
    price: partial.price,
    marketCap: partial.marketCap ?? 0,
    fdv: partial.fdv ?? null,
    volume24h: partial.volume24h ?? 0,
    change1h: partial.change1h ?? null,
    change24h: partial.change24h ?? 0,
    change7d: partial.change7d ?? 0,
    high24h: partial.high24h ?? null,
    low24h: partial.low24h ?? null,
    circulatingSupply: partial.circulatingSupply ?? null,
    totalSupply: partial.totalSupply ?? null,
    maxSupply: partial.maxSupply ?? null,
    ath: partial.ath ?? null,
    athDate: partial.athDate ?? null,
    atl: null,
    atlDate: null,
    sparkline7d: [],
    blockchain: partial.blockchain || snapshotBlockchain(id, null, null),
    quotedAt: partial.quotedAt ?? null,
    source: (partial.source || "coingecko").toLowerCase(),
    priceUnavailable: false,
    moves: partial.moves ?? null,
  };
}

/** One labelled sentence for the prices-as-at line. */
export function snapshotFeedLabel(sources: string[]): string {
  const labels: string[] = [];
  const ordered = [...sources].sort((a, b) => sourceRank(a) - sourceRank(b));
  for (const source of ordered) {
    const id = (source || "").trim().toLowerCase();
    if (!id || !publicSourceAllowed(id)) continue;
    const label = sourceLabel(id);
    if (!label || labels.includes(label)) continue;
    labels.push(label);
  }
  if (!labels.length) return "";
  return labels.length === 1 ? `Source: ${labels[0]}.` : `Sources: ${labels.join(", ")}.`;
}

export function withFeedSource(age: string | null, sources: string[]): string | null {
  const feed = snapshotFeedLabel(sources);
  if (age && feed) return `${age} ${feed}`;
  return age || feed || null;
}

/**
 * Keep one print per symbol.
 * A single source is kept. Two sources that miss each other by more than
 * CRYPTO_SANITY_RATIO are both dropped. A larger cluster keeps its best source.
 */
export function mergeVerifiedSeedLists(lists: CoinMarket[][], limit = LIST_CAP): CoinMarket[] {
  const groups = new Map<string, CoinMarket[]>();
  for (const list of lists) {
    for (const coin of list || []) {
      if (!coin || !(coin.price > 0) || !Number.isFinite(coin.price)) continue;
      const symbol = (coin.symbol || "").trim().toUpperCase();
      if (!symbol) continue;
      const source = (coin.source || "coingecko").toLowerCase();
      if (!publicSourceAllowed(source)) continue;
      if (!pegOk(symbol, coin.price)) continue;
      const bucket = groups.get(symbol) || [];
      bucket.push({ ...coin, symbol, source });
      groups.set(symbol, bucket);
    }
  }

  const chosen: CoinMarket[] = [];
  for (const [symbol, quotes] of groups) {
    const pick = pickVerifiedQuote(quotes);
    if (!pick) continue;
    chosen.push(blankCoin({ ...pick, symbol, source: pick.source || "coingecko" }));
  }

  return chosen
    .sort((a, b) => {
      const cap = (b.marketCap || 0) - (a.marketCap || 0);
      if (cap !== 0) return cap;
      return (a.rank ?? 999999) - (b.rank ?? 999999);
    })
    .slice(0, Math.max(0, limit));
}

function pickVerifiedDex(quotes: DexTokenRow[]): DexTokenRow | null {
  if (!quotes.length) return null;
  if (quotes.length === 1) return quotes[0];
  let best: DexTokenRow | null = null;
  let bestCount = 0;
  let bestReserve = -1;
  for (const anchor of quotes) {
    const count = quotes.filter((row) => pricesAgree(anchor.price || 0, row.price || 0)).length;
    const reserve = anchor.reserveUsd || 0;
    if (count > bestCount || (count === bestCount && reserve > bestReserve)) {
      best = anchor;
      bestCount = count;
      bestReserve = reserve;
    }
  }
  if (!best || bestCount < 2) return null;
  const cluster = quotes.filter((row) => pricesAgree(best.price || 0, row.price || 0));
  return [...cluster].sort((a, b) => (b.reserveUsd || 0) - (a.reserveUsd || 0))[0];
}

function pickVerifiedQuote(quotes: CoinMarket[]): CoinMarket | null {
  if (!quotes.length) return null;
  if (quotes.length === 1) return quotes[0];
  let best: CoinMarket | null = null;
  let bestCount = 0;
  let bestRank = SOURCE_ORDER.length + 1;
  for (const anchor of quotes) {
    const count = quotes.filter((quote) => pricesAgree(anchor.price, quote.price)).length;
    const rank = sourceRank(anchor.source);
    if (count > bestCount || (count === bestCount && rank < bestRank)) {
      best = anchor;
      bestCount = count;
      bestRank = rank;
    }
  }
  if (!best || bestCount < 2) return null;
  const cluster = quotes.filter((quote) => pricesAgree(best.price, quote.price));
  return [...cluster].sort((a, b) => sourceRank(a.source) - sourceRank(b.source))[0];
}

/** Yahoo fills only when the keyless lists are still short. It does not replace them. */
export function backupWithYahoo(primary: CoinMarket[], yahoo: CoinMarket[], floor = YAHOO_BACKUP_FLOOR): CoinMarket[] {
  const base = mergeVerifiedSeedLists([primary]);
  if (base.length >= floor) return base;
  const tagged = (yahoo || []).filter((coin) => coin && coin.price > 0).map((coin) => {
    const symbol = coin.symbol.toUpperCase();
    const id = coin.id && coin.id !== symbol.toLowerCase() ? coin.id : canonicalCryptoId(symbol);
    return blankCoin({
      ...coin,
      id,
      symbol,
      name: coinDisplayName(symbol, coin.name),
      source: "yahoo",
      blockchain: coin.blockchain || snapshotBlockchain(id, null, null),
    });
  });
  return mergeVerifiedSeedLists([base, tagged]);
}

export function coinsFromCoinGeckoMarkets(body: unknown): CoinMarket[] {
  if (!Array.isArray(body)) return [];
  const coins: CoinMarket[] = [];
  for (const raw of body) {
    const row = asRecord(raw);
    if (!row) continue;
    const id = String(row.id || "").trim().toLowerCase();
    const symbol = String(row.symbol || "").trim().toUpperCase();
    const price = num(row.current_price);
    if (!id || !symbol || price == null || !(price > 0)) continue;
    const change24h = num(row.price_change_percentage_24h_in_currency) ?? num(row.price_change_percentage_24h);
    const change7d = num(row.price_change_percentage_7d_in_currency);
    const change30d = num(row.price_change_percentage_30d_in_currency);
    coins.push(
      blankCoin({
        id,
        symbol,
        name: typeof row.name === "string" ? row.name : symbol,
        image: typeof row.image === "string" ? row.image : "",
        rank: num(row.market_cap_rank) ?? 999999,
        price,
        marketCap: num(row.market_cap) ?? 0,
        fdv: num(row.fully_diluted_valuation),
        volume24h: num(row.total_volume) ?? 0,
        change1h: num(row.price_change_percentage_1h_in_currency),
        change24h: change24h ?? 0,
        change7d: change7d ?? 0,
        high24h: num(row.high_24h),
        low24h: num(row.low_24h),
        circulatingSupply: num(row.circulating_supply),
        totalSupply: num(row.total_supply),
        maxSupply: num(row.max_supply),
        ath: num(row.ath),
        athDate: typeof row.ath_date === "string" ? row.ath_date : null,
        blockchain: snapshotBlockchain(id, null, typeof row.asset_platform_id === "string" ? row.asset_platform_id : null),
        quotedAt: typeof row.last_updated === "string" ? row.last_updated : null,
        source: "coingecko",
        moves: { h24: change24h, d7: change7d, d30: change30d },
      })
    );
  }
  return coins;
}

export function coinsFromCoinPaprika(body: unknown): CoinMarket[] {
  if (!Array.isArray(body)) return [];
  const coins: CoinMarket[] = [];
  for (const raw of body) {
    const row = asRecord(raw);
    if (!row) continue;
    const symbol = String(row.symbol || "").trim().toUpperCase();
    const quotes = asRecord(row.quotes);
    const usd = quotes ? asRecord(quotes.USD) : null;
    const price = num(usd?.price);
    if (!symbol || price == null || !(price > 0)) continue;
    const paprikaId = String(row.id || "").trim().toLowerCase();
    const canonical = canonicalCryptoId(symbol);
    const id = canonical !== symbol.toLowerCase() ? canonical : paprikaId.replace(/^[a-z0-9]+-/, "") || canonical;
    const change24h = num(usd?.percent_change_24h);
    const change7d = num(usd?.percent_change_7d);
    const change30d = num(usd?.percent_change_30d);
    coins.push(
      blankCoin({
        id,
        symbol,
        name: typeof row.name === "string" ? row.name : symbol,
        rank: num(row.rank) ?? 999999,
        price,
        marketCap: num(usd?.market_cap) ?? 0,
        volume24h: num(usd?.volume_24h) ?? 0,
        change1h: num(usd?.percent_change_1h),
        change24h: change24h ?? 0,
        change7d: change7d ?? 0,
        circulatingSupply: num(row.circulating_supply),
        totalSupply: num(row.total_supply),
        maxSupply: num(row.max_supply),
        ath: num(usd?.ath_price),
        athDate: typeof usd?.ath_date === "string" ? usd.ath_date : null,
        quotedAt: typeof row.last_updated === "string" ? row.last_updated : null,
        source: "coinpaprika",
        moves: { h24: change24h, d7: change7d, d30: change30d },
      })
    );
  }
  return coins.sort((a, b) => a.rank - b.rank).slice(0, LIST_CAP);
}

export function coinsFromCoinCap(body: unknown): CoinMarket[] {
  const root = asRecord(body);
  const rows = Array.isArray(body) ? body : Array.isArray(root?.data) ? root.data : [];
  const coins: CoinMarket[] = [];
  for (const raw of rows) {
    const row = asRecord(raw);
    if (!row) continue;
    const symbol = String(row.symbol || "").trim().toUpperCase();
    const price = num(row.priceUsd);
    if (!symbol || price == null || !(price > 0)) continue;
    const id = String(row.id || "").trim().toLowerCase() || canonicalCryptoId(symbol);
    const change24h = num(row.changePercent24Hr);
    coins.push(
      blankCoin({
        id,
        symbol,
        name: typeof row.name === "string" ? row.name : symbol,
        rank: num(row.rank) ?? 999999,
        price,
        marketCap: num(row.marketCapUsd) ?? 0,
        volume24h: num(row.volumeUsd24Hr) ?? 0,
        change24h: change24h ?? 0,
        source: "coincap",
        moves: { h24: change24h, d7: null, d30: null },
      })
    );
  }
  return coins;
}

const LEVERAGED = /(UP|DOWN|BULL|BEAR|\dL|\dS)$/;

export function coinsFromBinanceTickers(body: unknown): CoinMarket[] {
  const rows = Array.isArray(body) ? body : [];
  const coins: CoinMarket[] = [];
  const seen = new Set<string>();
  for (const raw of rows) {
    const row = asRecord(raw);
    if (!row) continue;
    const market = String(row.symbol || "").trim().toUpperCase();
    if (!market.endsWith("USDT")) continue;
    const symbol = market.slice(0, -4);
    if (!/^[A-Z0-9]{2,15}$/.test(symbol) || LEVERAGED.test(symbol) || seen.has(symbol)) continue;
    const price = num(row.lastPrice) ?? num(row.price);
    if (price == null || !(price > 0)) continue;
    seen.add(symbol);
    const change24h = num(row.priceChangePercent);
    const closeTime = num(row.closeTime);
    coins.push(
      blankCoin({
        id: canonicalCryptoId(symbol),
        symbol,
        name: symbol,
        price,
        volume24h: num(row.quoteVolume) ?? 0,
        change24h: change24h ?? 0,
        quotedAt: closeTime && closeTime > 1_000_000_000_000 ? new Date(closeTime).toISOString() : null,
        source: "binance",
        moves: { h24: change24h, d7: null, d30: null },
      })
    );
  }
  return coins.sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0)).slice(0, LIST_CAP);
}

function tokenBookKey(chain: string, address: string): string {
  const net = chain.trim().toLowerCase();
  const id = address.trim();
  const stored = id.startsWith("0x") ? id.toLowerCase() : id;
  return `${net}:${stored}`;
}

export function dexRowsFromPaprikaPools(body: unknown): DexTokenRow[] {
  const root = asRecord(body);
  const pools = Array.isArray(body) ? body : Array.isArray(root?.results) ? root.results : [];
  const rows: DexTokenRow[] = [];
  for (const raw of pools) {
    const pool = asRecord(raw);
    if (!pool) continue;
    const tokens = Array.isArray(pool.tokens) ? pool.tokens : [];
    const first = asRecord(tokens[0]);
    const chain = String(pool.chain || first?.chain || "").trim().toLowerCase();
    const address = String(first?.id || "").trim();
    const booked = DEX_TOKEN_BOOK[tokenBookKey(chain, address)];
    const symbol = String(first?.symbol || booked?.symbol || "").trim().toUpperCase();
    const price = num(pool.price_usd);
    if (!symbol || !chain || price == null || !(price > 0) || !pegOk(symbol, price)) continue;
    const name = String(first?.name || booked?.name || symbol);
    const reserve = num(pool.liquidity_usd);
    const row: DexTokenRow = {
      id: `${chain}_${address || symbol.toLowerCase()}`,
      symbol,
      name: coinDisplayName(symbol, name),
      price,
      priceUnavailable: false,
      volume24h: num(pool.volume_usd_24h),
      network: dexNetworkLabel(chain),
      dex: String(pool.dex_name || pool.dex_id || "").trim(),
      detailId: canonicalCryptoId(symbol) !== symbol.toLowerCase() ? canonicalCryptoId(symbol) : null,
      address: address ? `${chain}_${address}` : "",
      reserveUsd: reserve,
    };
    if (!dexRowClearsFloor(row)) continue;
    rows.push(row);
  }
  return rows;
}

function seedHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { accept: "application/json", "user-agent": MARKET_USER_AGENT, ...extra };
}

async function fetchSeed(url: string, headers: Record<string, string> = {}): Promise<Response> {
  const impl = seedFetchOverride ?? fetch;
  return impl(url, {
    headers: seedHeaders(headers),
    cache: "no-store",
    signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS),
  });
}

async function readJson(res: Response): Promise<unknown> {
  if (!res.ok) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchCoinGeckoLists(onReady?: (rows: CoinMarket[]) => void): Promise<CoinMarket[]> {
  const first = await readCoinGeckoPage(1);
  let coins = coinsFromCoinGeckoMarkets(first);
  if (coins.length) onReady?.(coins);
  if (first.length < 250) return coins;
  const second = await readCoinGeckoPage(2);
  coins = coinsFromCoinGeckoMarkets([...first, ...second]);
  if (coins.length) onReady?.(coins);
  return coins;
}

async function readCoinGeckoPage(page: number): Promise<unknown[]> {
  const path = `/coins/markets?${CG_QUERY}&page=${page}`;
  const first = coinGeckoEndpoint();
  let res = await fetchSeed(`${first.base}${path}`, first.headers);
  if (!res.ok && first.mode !== "keyless" && (res.status === 401 || res.status === 403 || res.status === 429)) {
    const plain = coinGeckoEndpoint(process.env, true);
    res = await fetchSeed(`${plain.base}${path}`, plain.headers);
  }
  if (!res.ok) {
    console.error(`[crypto-seed] coingecko page ${page} status ${res.status}`);
    return [];
  }
  const body = await readJson(res);
  return Array.isArray(body) ? body : [];
}

async function settle<T>(label: string, work: Promise<T>, empty: T): Promise<T> {
  try {
    return await work;
  } catch (err) {
    console.error(`[crypto-seed] ${label} failed:`, err instanceof Error ? err.message.slice(0, 80) : "failed");
    return empty;
  }
}

export async function loadKeylessCryptoMarkets(opts?: { budgetMs?: number }): Promise<CoinMarket[]> {
  const budgetMs = opts?.budgetMs ?? KEYLESS_SEED_BUDGET_MS;
  const lists: CoinMarket[][] = [];
  const started = Date.now();
  const push = (rows: CoinMarket[]) => {
    if (rows.length) lists.push(rows);
  };
  const jobs: Promise<void>[] = [
    settle("coingecko", fetchCoinGeckoLists(push), [] as CoinMarket[]).then(push),
    settle(
      "coinpaprika",
      fetchSeed(PAPRIKA_TICKERS).then(async (res) => coinsFromCoinPaprika(await readJson(res))),
      [] as CoinMarket[]
    ).then(push),
    settle(
      "binance",
      fetchSeed(BINANCE_TICKERS).then(async (res) => coinsFromBinanceTickers(await readJson(res))),
      [] as CoinMarket[]
    ).then(push),
  ];
  const capKey = (process.env.COINCAP_API_KEY || "").trim();
  if (capKey) {
    jobs.push(
      settle(
        "coincap",
        fetchSeed(COINCAP_ASSETS, { authorization: `Bearer ${capKey}` }).then(async (res) => coinsFromCoinCap(await readJson(res))),
        [] as CoinMarket[]
      ).then(push)
    );
  }
  const done = Promise.all(jobs).then(() => "done" as const);
  while (Date.now() - started < budgetMs) {
    if (mergeVerifiedSeedLists(lists).length >= YAHOO_BACKUP_FLOOR) return mergeVerifiedSeedLists(lists);
    const step = await Promise.race([done, sleep(50).then(() => "wait" as const)]);
    if (step === "done") break;
  }
  return mergeVerifiedSeedLists(lists);
}

let statDonorCache: { at: number; coins: CoinMarket[] } | null = null;
const STAT_DONOR_TTL_MS = 5 * 60 * 1000;

/** CoinGecko markets and CoinPaprika tickers, cached so a page read can fill empty stats. */
export async function loadKeylessStatDonors(): Promise<CoinMarket[]> {
  if (statDonorCache && Date.now() - statDonorCache.at < STAT_DONOR_TTL_MS) return statDonorCache.coins;
  const lists: CoinMarket[][] = [];
  await Promise.race([
    Promise.all([
      settle("coingecko-stats", fetchCoinGeckoLists(), [] as CoinMarket[]).then((rows) => {
        if (rows.length) lists.push(rows);
      }),
      settle(
        "coinpaprika-stats",
        fetchSeed(PAPRIKA_TICKERS).then(async (res) => coinsFromCoinPaprika(await readJson(res))),
        [] as CoinMarket[]
      ).then((rows) => {
        if (rows.length) lists.push(rows);
      }),
    ]),
    sleep(6_500),
  ]);
  const coins = lists.flat();
  if (coins.length) statDonorCache = { at: Date.now(), coins };
  return coins;
}

/** Tests replace the donor cache along with the seed fetch. */
export function resetStatDonorCache() {
  statDonorCache = null;
}

async function fetchGeckoTerminalRows(): Promise<DexTokenRow[]> {
  const urls = [
    `${GT_BASE}/networks/trending_pools?include=base_token,quote_token,dex,network&page=1`,
    ...GT_NETWORKS.map(
      (network) =>
        `${GT_BASE}/networks/${network}/pools?include=base_token,quote_token,dex,network&sort=h24_volume_usd_desc&page=1`
    ),
  ];
  const pages = await Promise.all(
    urls.map(async (url) => {
      const res = await fetchSeed(url, { accept: GT_ACCEPT, "user-agent": MARKET_USER_AGENT });
      if (res.status === 429) return [] as DexTokenRow[];
      if (!res.ok) return [] as DexTokenRow[];
      const body = await readJson(res);
      const network = url.includes("/networks/") && !url.includes("trending_pools") ? url.split("/networks/")[1]?.split("/")[0] || "" : "";
      return parseMegafilterPage(body, network).filter((row) => dexRowClearsFloor(row) && pegOk(row.symbol, row.price || 0));
    })
  );
  return pages.flat();
}

async function fetchDexPaprikaRows(): Promise<DexTokenRow[]> {
  const pages = await Promise.all(
    DEX_NETWORKS.map(async (network) => {
      const url = `https://api.dexpaprika.com/networks/${network}/pools/search?limit=30&orderBy=volume_usd_24h&sort=desc`;
      const res = await fetchSeed(url, { accept: "application/json", "user-agent": MARKET_USER_AGENT });
      if (!res.ok) return [] as DexTokenRow[];
      return dexRowsFromPaprikaPools(await readJson(res));
    })
  );
  return pages.flat();
}

export async function loadKeylessDexMarkets(opts?: { budgetMs?: number }): Promise<{ rows: DexTokenRow[]; sources: string[] }> {
  const budgetMs = opts?.budgetMs ?? KEYLESS_SEED_BUDGET_MS;
  const found: { source: string; rows: DexTokenRow[] }[] = [];
  await Promise.race([
    Promise.all([
      settle("geckoterminal", fetchGeckoTerminalRows(), [] as DexTokenRow[]).then((rows) => {
        if (rows.length) found.push({ source: "geckoterminal", rows });
      }),
      settle("dexpaprika", fetchDexPaprikaRows(), [] as DexTokenRow[]).then((rows) => {
        if (rows.length) found.push({ source: "dexpaprika", rows });
      }),
    ]),
    sleep(budgetMs),
  ]);
  const rows = mergeDexSeedRows(found.map((item) => item.rows));
  const sources = found.filter((item) => item.rows.length).map((item) => item.source);
  return { rows, sources };
}

/** Same-address prints that miss each other by more than 3× are dropped. */
export function mergeDexSeedRows(lists: DexTokenRow[][], limit = LIST_CAP): DexTokenRow[] {
  const groups = new Map<string, DexTokenRow[]>();
  for (const list of lists) {
    for (const row of list || []) {
      if (!row || row.price == null || !(row.price > 0)) continue;
      if (!pegOk(row.symbol, row.price)) continue;
      const key = `${(row.network || "").toLowerCase()}|${(row.address || row.symbol).toLowerCase()}`;
      const bucket = groups.get(key) || [];
      bucket.push(row);
      groups.set(key, bucket);
    }
  }
  const kept: DexTokenRow[] = [];
  for (const quotes of groups.values()) {
    const pick = pickVerifiedDex(quotes);
    if (pick) kept.push(pick);
  }
  return kept
    .sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0))
    .slice(0, limit);
}
