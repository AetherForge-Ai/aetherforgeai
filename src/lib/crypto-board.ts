/**
 * One market snapshot for every crypto consumer.
 *
 * Pure helpers: names, chains, DEX identity, completeness, and the
 * "Prices as at" label. Network access lives in crypto-board-store.ts.
 * This runtime has no cron trigger. Readers serve the persisted snapshot
 * and a protected route refreshes it.
 *
 * pull-check:v3-tier1a-2026-10-12
 */

import { formatDisplayDateTime } from "@/lib/currency";
import type { DexTokenRow } from "@/lib/crypto-dex";
import { canonicalCryptoId } from "@/lib/crypto-ids";
import { coinDisplayName, SYMBOL_IS_OFFICIAL_NAME } from "@/lib/crypto-names";
import type { CoinMarket } from "@/lib/crypto-market";

export const MARKET_SNAPSHOT_TARGET = 400;
export const SNAPSHOT_COMPLETE_RATIO = 0.95;
export const SNAPSHOT_STALE_MS = 30 * 60 * 1000;
/** A stored list older than this is refreshed inside the request, with a bound. */
export const SNAPSHOT_REFRESH_MS = 10 * 60 * 1000;
/** A DEX request refreshes a snapshot older than about five minutes. The saved `at` is the as-at time. */
export const DEX_REQUEST_FRESH_MS = 5 * 60 * 1000;
export const KOINS_SNAPSHOT_FRESH_MS = 60 * 60 * 1000;
export const PLATFORM_DIRECTORY_TTL_MS = 24 * 60 * 60 * 1000;

export const SNAPSHOT_COMPLETE_COUNT = Math.ceil(MARKET_SNAPSHOT_TARGET * SNAPSHOT_COMPLETE_RATIO);

const LAST_GOOD_CELL = /^last good\s*[·•|\-–—:]+\s*/i;

/** Native chain for an L1 whose platform list is empty. */
const L1_CHAIN: Record<string, string> = {
  bitcoin: "Bitcoin",
  ethereum: "Ethereum",
  solana: "Solana",
  cardano: "Cardano",
  binancecoin: "BNB Smart Chain",
  ripple: "XRP Ledger",
  tron: "TRON",
  "bitcoin-cash": "Bitcoin Cash",
  stellar: "Stellar",
  algorand: "Algorand",
  "hedera-hashgraph": "Hedera",
  litecoin: "Litecoin",
  dogecoin: "Dogecoin",
  polkadot: "Polkadot",
  "avalanche-2": "Avalanche",
  near: "NEAR Protocol",
  aptos: "Aptos",
  sui: "Sui",
  cosmos: "Cosmos",
  "the-open-network": "TON",
  "internet-computer": "Internet Computer",
  "matic-network": "Polygon",
  "polygon-ecosystem-token": "Polygon",
  "ethena": "Ethereum",
  "usd-coin": "Ethereum",
  tether: "Ethereum",
  "wrapped-bitcoin": "Ethereum",
  "staked-ether": "Ethereum",
  "wrapped-steth": "Ethereum",
  monero: "Monero",
  "unus-sed-leo": "Ethereum",
  whitebit: "Ethereum",
  usds: "Ethereum",
  "coinbase-wrapped-btc": "Base",
  rain: "Ethereum",
  "rocket-pool-eth": "Ethereum",
  "coinbase-wrapped-staked-eth": "Ethereum",
  weth: "Ethereum",
  "wrapped-eeth": "Ethereum",
  hyperliquid: "Hyperliquid",
  zcash: "Zcash",
};

/** Ticker or leftover id when the CoinGecko id is not in the native-chain list. */
const TICKER_CHAIN: Record<string, string> = {
  btc: "Bitcoin",
  eth: "Ethereum",
  usdt: "Ethereum",
  bnb: "BNB Smart Chain",
  sol: "Solana",
  xrp: "XRP Ledger",
  usdc: "Ethereum",
  doge: "Dogecoin",
  ada: "Cardano",
  trx: "TRON",
  avax: "Avalanche",
  ton: "TON",
  shib: "Ethereum",
  dot: "Polkadot",
  link: "Ethereum",
  chainlink: "Ethereum",
  bch: "Bitcoin Cash",
  sui: "Sui",
  hbar: "Hedera",
  xlm: "Stellar",
  ltc: "Litecoin",
  uni: "Ethereum",
  uniswap: "Ethereum",
  pepe: "Ethereum",
  near: "NEAR Protocol",
  apt: "Aptos",
  icp: "Internet Computer",
  etc: "Ethereum Classic",
  atom: "Cosmos",
  vet: "VeChain",
  render: "Solana",
  fil: "Filecoin",
  filecoin: "Filecoin",
  arb: "Arbitrum",
  arbitrum: "Arbitrum",
  op: "Optimism",
  optimism: "Optimism",
  imx: "Ethereum",
  inj: "Injective",
  injective: "Injective",
  stx: "Stacks",
  aave: "Ethereum",
  mkr: "Ethereum",
  maker: "Ethereum",
  grt: "Ethereum",
  algo: "Algorand",
  rune: "THORChain",
  theta: "Theta",
  egld: "MultiversX",
  flow: "Flow",
  xtz: "Tezos",
  axs: "Ethereum",
  eos: "EOS",
  sand: "Ethereum",
  mana: "Ethereum",
  qnt: "Ethereum",
  ldo: "Ethereum",
  ape: "Ethereum",
  comp: "Ethereum",
  dydx: "Ethereum",
  ens: "Ethereum",
  crv: "Ethereum",
  chz: "Ethereum",
  mina: "Mina",
  zec: "Zcash",
  snx: "Ethereum",
  gala: "Ethereum",
  cake: "BNB Smart Chain",
  kava: "Kava",
  zil: "Zilliqa",
  bat: "Ethereum",
  gmx: "Arbitrum",
  lrc: "Ethereum",
  enj: "Ethereum",
  iota: "IOTA",
  neo: "Neo",
  ksm: "Kusama",
  dash: "Dash",
  sushi: "Ethereum",
  yfi: "Ethereum",
  celo: "Celo",
  rose: "Oasis",
  ankr: "Ethereum",
  skl: "Ethereum",
  storj: "Ethereum",
  audio: "Ethereum",
  mask: "Ethereum",
  api3: "Ethereum",
  band: "Ethereum",
  bal: "Ethereum",
  "1inch": "Ethereum",
  lunc: "Terra Classic",
  fet: "Ethereum",
  wld: "Ethereum",
  tia: "Celestia",
  sei: "Sei",
  jup: "Solana",
  bonk: "Solana",
  wif: "Solana",
  floki: "Ethereum",
  pendle: "Ethereum",
  ondo: "Ethereum",
  pyth: "Solana",
  jto: "Solana",
  strk: "Starknet",
  blur: "Ethereum",
  arkm: "Ethereum",
  wbtc: "Ethereum",
  steth: "Ethereum",
  hype: "Hyperliquid",
  weth: "Ethereum",
  weeth: "Ethereum",
  reth: "Ethereum",
  cbeth: "Ethereum",
  wsteth: "Ethereum",
  usds: "Ethereum",
  xmr: "Monero",
  wbt: "Ethereum",
  leo: "Ethereum",
  cbbtc: "Base",
  rain: "Ethereum",
  susds: "Ethereum",
  usde: "Ethereum",
  dai: "Ethereum",
  usd1: "Ethereum",
  xaut: "Ethereum",
  tao: "Bittensor",
  cro: "Cronos",
  pyusd: "Ethereum",
  okb: "Ethereum",
  rlusd: "XRP Ledger",
  paxg: "Ethereum",
  mnt: "Mantle",
  wlfi: "Ethereum",
  sky: "Ethereum",
  morpho: "Ethereum",
  jitosol: "Solana",
  bgb: "Ethereum",
  ftm: "Fantom",
  agix: "Ethereum",
  wbnb: "BNB Smart Chain",
};

const PLATFORM_LABEL: Record<string, string> = {
  ethereum: "Ethereum",
  "binance-smart-chain": "BNB Smart Chain",
  "polygon-pos": "Polygon",
  solana: "Solana",
  avalanche: "Avalanche",
  "arbitrum-one": "Arbitrum",
  "optimistic-ethereum": "Optimism",
  base: "Base",
  "the-open-network": "TON",
  cardano: "Cardano",
  tron: "TRON",
  stellar: "Stellar",
  algorand: "Algorand",
  hedera: "Hedera",
  "hedera-hashgraph": "Hedera",
  "sei-network": "Sei",
  sui: "Sui",
  aptos: "Aptos",
  ton: "TON",
  "near-protocol": "NEAR Protocol",
  "eth-ethereum": "Ethereum",
  "zksync-zksync": "zkSync",
  zksync: "zkSync",
  cronos: "Cronos",
  "crypto-com-chain": "Cronos",
  mantle: "Mantle",
  fantom: "Fantom",
  bittensor: "Bittensor",
  "xrp-ledger": "XRP Ledger",
  ripple: "XRP Ledger",
  binancecoin: "BNB Smart Chain",
};

export interface CoinDirectoryEntry {
  name: string;
  symbol: string;
  platforms: Record<string, string>;
}

export interface WindowMoves {
  h24: number | null;
  d7: number | null;
  d30: number | null;
}

export function stripLastGoodCell(value: string | null | undefined): string {
  let text = String(value ?? "").trim();
  let guard = 0;
  while (LAST_GOOD_CELL.test(text) && guard < 4) {
    text = text.replace(LAST_GOOD_CELL, "").trim();
    guard += 1;
  }
  return text;
}

export function cellHasLastGood(value: string | null | undefined): boolean {
  return /last good/i.test(String(value ?? ""));
}

export function snapshotAgeMs(iso: string | null | undefined, now = Date.now()): number | null {
  const at = Date.parse(iso || "");
  if (!Number.isFinite(at)) return null;
  return Math.max(0, now - at);
}

export function snapshotIsStale(iso: string | null | undefined, now = Date.now(), maxAge = SNAPSHOT_STALE_MS): boolean {
  const age = snapshotAgeMs(iso, now);
  if (age == null) return true;
  return age > maxAge;
}

/** One label above the table. The clock is the saved snapshot time. */
export function pricesAsAtLabel(
  iso: string | null | undefined,
  now = Date.now(),
  staleMs = SNAPSHOT_STALE_MS
): string | null {
  if (!iso) return null;
  const wall = formatDisplayDateTime(iso);
  if (!wall || wall === "—") return null;
  const base = `Prices as at ${wall} (NZ).`;
  return snapshotIsStale(iso, now, staleMs) ? `${base} The feed is delayed.` : base;
}

export function koinsUnavailableLine(iso: string | null | undefined): string {
  const wall = iso ? formatDisplayDateTime(iso) : "";
  const when = wall && wall !== "—" ? wall : "not stored";
  return `Crypto market data is unavailable right now, so this list is not ranked. Last good snapshot: ${when}.`;
}

export function platformLabel(key: string): string {
  const id = (key || "").trim().toLowerCase();
  if (!id) return "";
  if (PLATFORM_LABEL[id]) return PLATFORM_LABEL[id];
  return id
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * Blockchain for one snapshot row.
 * An empty platform list is the native chain. A token uses its primary platform.
 */
export function snapshotBlockchain(
  coinId: string,
  platforms: Record<string, string> | null | undefined,
  assetPlatformId?: string | null
): string {
  const id = (coinId || "").trim().toLowerCase();
  const direct = (assetPlatformId || "").trim().toLowerCase();
  if (direct) return platformLabel(direct);
  const keys = platforms
    ? Object.entries(platforms).filter(([key, value]) => key.trim() && String(value || "").trim())
    : [];
  if (keys.length) return platformLabel(keys[0][0]);
  return L1_CHAIN[id] || TICKER_CHAIN[id] || "";
}

/** Name and chain for one row of the shared list. A blank chain is filled. A ticker-only name is the published name. */
export function presentListedCoin<T extends { symbol: string; name: string; id: string; blockchain?: string | null }>(coin: T): T {
  const name = coinDisplayName(coin.symbol, coin.name);
  const stored = (coin.blockchain || "").trim();
  const known = stored && stored !== "—" && stored !== "Unavailable" && stored !== "Native";
  const blockchain = known ? stored : snapshotBlockchain(coin.id, null, null) || chainForTicker(coin.symbol) || "";
  if (name === coin.name && blockchain === (coin.blockchain || "")) return coin;
  return { ...coin, name, blockchain };
}

/** Chain label for a ticker. Uses the canonical id, then the ticker itself. */
export function chainForTicker(symbol: string): string {
  const bare = (symbol || "").trim().toUpperCase().split(".")[0];
  if (!bare) return "";
  const fromId = snapshotBlockchain(canonicalCryptoId(bare), null, null);
  if (fromId) return fromId;
  return snapshotBlockchain(bare.toLowerCase(), null, null);
}

/** True when this list actually includes a CoinGecko print. */
export function coingeckoSupplied(sources: Array<string | null | undefined>): boolean {
  return sources.some((source) => (source || "").trim().toLowerCase() === "coingecko");
}

export function finiteMove(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

export function displayCoinName(symbol: string, feedName: string | null | undefined, directoryName?: string | null): string {
  const fromList = (directoryName || "").trim();
  if (fromList) return coinDisplayName(symbol, fromList);
  return coinDisplayName(symbol, feedName);
}

export function nameIsPublishable(symbol: string, name: string): boolean {
  const ticker = (symbol || "").trim().toUpperCase();
  const label = (name || "").trim();
  if (!ticker || !label) return false;
  if (label.toUpperCase() === ticker && label === ticker) return SYMBOL_IS_OFFICIAL_NAME.has(ticker);
  return true;
}

export interface PaprikaChainInput {
  type?: string | null;
  symbol?: string | null;
  name?: string | null;
  platform?: string | null;
  contracts?: Array<{ platform?: string | null; contract?: string | null }> | null;
}

/**
 * CoinPaprika coin document. type "coin" is that asset's own chain.
 * A token uses its contract platform. A blank result is not a guessed chain.
 */
export function chainFromPaprikaCoin(row: PaprikaChainInput): string {
  const symbol = (row.symbol || "").trim().toLowerCase();
  const known = symbol ? TICKER_CHAIN[symbol] || "" : "";
  const type = (row.type || "").trim().toLowerCase();
  if (type === "coin") {
    if (known) return known;
    const own = platformLabel(String(row.name || "").trim());
    return own && own.toLowerCase() !== symbol ? own : "";
  }
  const contractPlatform = (row.contracts || []).map((item) => String(item?.platform || "").trim()).find(Boolean) || "";
  const platform = contractPlatform || String(row.platform || "").trim();
  if (platform) {
    const labelled = platformLabel(platform);
    if (labelled) return labelled;
  }
  return known;
}

export function cryptoRowComplete(coin: Pick<CoinMarket, "symbol" | "name" | "price" | "blockchain">): boolean {
  return (
    typeof coin.price === "number" &&
    coin.price > 0 &&
    nameIsPublishable(coin.symbol, coin.name) &&
    Boolean(coin.blockchain && coin.blockchain !== "—" && coin.blockchain !== "Unavailable" && coin.blockchain !== "Native")
  );
}

/** At least 95% of the 400-row target, each with a name, a price, and a chain. */
export function cryptoSnapshotComplete(coins: CoinMarket[]): boolean {
  const good = coins.filter(cryptoRowComplete);
  return good.length >= SNAPSHOT_COMPLETE_COUNT;
}

export function dexIdentityKey(row: Pick<DexTokenRow, "network" | "address" | "symbol">): string {
  const network = stripLastGoodCell(row.network).toLowerCase();
  const address = stripLastGoodCell(row.address || "").toLowerCase();
  if (address) return `${network}|${address}`;
  const symbol = stripLastGoodCell(row.symbol).toUpperCase();
  return symbol ? `${network}|symbol:${symbol}` : "";
}

function dexLiquidity(row: DexTokenRow): number {
  const reserve = row.reserveUsd != null && row.reserveUsd > 0 ? row.reserveUsd : 0;
  if (reserve > 0) return reserve;
  return row.volume24h != null && row.volume24h > 0 ? row.volume24h : 0;
}

/** One row per network + token address. The highest-liquidity pool wins. */
export function dedupeDexByNetworkAddress(rows: DexTokenRow[], limit = MARKET_SNAPSHOT_TARGET): DexTokenRow[] {
  const best = new Map<string, DexTokenRow>();
  const passthrough: DexTokenRow[] = [];
  for (const raw of rows) {
    const row = cleanDexRow(raw);
    if (!row) continue;
    const key = dexIdentityKey(row);
    if (!key) {
      passthrough.push(row);
      continue;
    }
    const prev = best.get(key);
    if (!prev || dexLiquidity(row) > dexLiquidity(prev)) best.set(key, row);
  }
  return [...best.values(), ...passthrough]
    .sort((a, b) => dexLiquidity(b) - dexLiquidity(a))
    .slice(0, limit);
}

export function cleanDexRow(row: DexTokenRow): DexTokenRow | null {
  const symbol = stripLastGoodCell(row.symbol).toUpperCase();
  const name = stripLastGoodCell(row.name);
  const network = stripLastGoodCell(row.network);
  const dex = stripLastGoodCell(row.dex);
  const price = typeof row.price === "number" && row.price > 0 ? row.price : null;
  if (!symbol || price == null) return null;
  if (cellHasLastGood(symbol) || cellHasLastGood(name) || cellHasLastGood(network) || cellHasLastGood(dex)) return null;
  return {
    ...row,
    symbol,
    name: name && name.toUpperCase() !== symbol ? name : symbol,
    network: network === "Unavailable" ? "" : network,
    dex,
    price,
    priceUnavailable: false,
    address: stripLastGoodCell(row.address || ""),
  };
}

export function dexRowComplete(row: DexTokenRow): boolean {
  const cleaned = cleanDexRow(row);
  if (!cleaned) return false;
  return Boolean(cleaned.network && cleaned.dex && cleaned.price && cleaned.price > 0 && cleaned.name);
}

export function dexSnapshotComplete(rows: DexTokenRow[]): boolean {
  const unique = dedupeDexByNetworkAddress(rows, MARKET_SNAPSHOT_TARGET);
  const good = unique.filter(dexRowComplete);
  return good.length >= SNAPSHOT_COMPLETE_COUNT;
}

export function countLine(kind: "coins" | "DEX tokens", count: number): string {
  const n = Math.max(0, Math.round(count));
  return `${n} ${kind}`;
}

export function pageRangeLine(pageIndex: number, pageSize: number, total: number): string {
  const count = Math.max(0, Math.round(total));
  if (!count) return "Showing 0 of 400";
  const start = pageIndex * pageSize + 1;
  const end = Math.min(count, (pageIndex + 1) * pageSize);
  return `Showing ${start}–${end} of ${count}`;
}
