/**
 * Crypto market domain model + formatting + ranking.
 *
 * PURE module — safe to import from both client and server (no server-only,
 * no fetch). CoinGecko network access lives in `src/lib/crypto-coingecko.ts`
 * (server-only) and is exposed to the client through /api/crypto/* routes.
 *
 * Everything here is shared by the Crypto Market modal, the Coin Detail modal
 * and the Projected Performers section so numbers/labels stay identical across
 * the whole surface.
 */

import { adaptiveFractionDigits, formatDisplayDate, formatDisplayDateTime } from "@/lib/currency";
import { listedMarketNotice } from "@/lib/crypto-coverage";
import { coinDisplayName } from "@/lib/crypto-names";
import { isStablecoinSymbol, TICKER_ALIASES } from "@/lib/crypto-vendors";

/* -------------------------------- Types --------------------------------- */

/** One row from CoinGecko /coins/markets (top-500 scan). */
export interface CoinMarket {
  id: string;
  symbol: string; // upper-case, e.g. "BTC"
  name: string;
  image: string;
  rank: number; // market_cap_rank
  price: number; // USD
  marketCap: number;
  fdv: number | null; // fully diluted valuation
  /** True when fdv is price × max or total supply, because the feed did not send fdv. */
  fdvDerived?: boolean;
  fdvReason?: string;
  circulatingReason?: string;
  highReason?: string;
  lowReason?: string;
  atlReason?: string;
  volume24h: number;
  change1h: number | null; // %
  change24h: number; // %
  change7d: number; // %
  high24h: number | null;
  low24h: number | null;
  circulatingSupply: number | null;
  totalSupply: number | null;
  maxSupply: number | null;
  ath: number | null;
  athDate: string | null;
  atl: number | null;
  atlDate: string | null;
  /** ~7-day hourly price series for the inline sparkline. */
  sparkline7d: number[];
  /** Chain from CoinGecko platforms. "Native" or "Unavailable" when that is the honest label. */
  blockchain?: string;
  /** Why blockchain is blank. Shown with the em dash. Not a guessed chain. */
  blockchainReason?: string;
  /** True when this row has no live print. Do not treat price 0 as a quote. */
  priceUnavailable?: boolean;
  /** Vendor quote time from the market list, when the feed sent one. */
  quotedAt?: string | null;
  /** Contract addresses from the feed, lower-case. Used only to collapse duplicates. */
  contracts?: string[];
  /** Feed that produced this row. Omitted when the row is not shown. */
  source?: string;
  /** CoinPaprika id such as btc-bitcoin. Not stored in the snapshot. */
  paprikaId?: string;
  /** Why sparkline7d is empty. */
  sparklineReason?: string;
  /**
   * Window moves from the snapshot. Null means the feed did not send a number.
   * A real flat print is 0. Koins ranks from these fields.
   */
  moves?: { h24: number | null; d7: number | null; d30: number | null } | null;
}

/** Shown when a crypto route fails. Never a parse exception or an upstream body. */
export const LIVE_CRYPTO_UNAVAILABLE =
  "Live crypto prices are not shown right now. Please try again shortly.";

/** Shown when a coin detail request fails. Same family as the list failure — never a parse dump. */
export const COIN_DETAIL_SOURCE_DOWN = "Live data for this coin is not shown right now.";

/** Shown when a DEX row has no CoinGecko id the detail page can load. */
export const COIN_DETAIL_UNAVAILABLE = "Live detail for this token is not shown.";

/**
 * CoinGecko slug used by /api/crypto/coin/[id].
 * Pool addresses and GeckoTerminal ids (eth_0x…) are not slugs.
 */
export function resolvableCoinId(id: string | null | undefined): string | null {
  const raw = (id || "").trim().toLowerCase();
  if (!raw || raw.length > 80) return null;
  if (raw.includes("0x")) return null;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(raw)) return null;
  return raw;
}

export function coinHasLivePrice(coin: Pick<CoinMarket, "price" | "priceUnavailable">): boolean {
  return typeof coin.price === "number" && Number.isFinite(coin.price) && coin.price > 0 && !coin.priceUnavailable;
}

/**
 * Map an existing price feed into the crypto table.
 * A missing print is dropped. A missing chain is left blank. No price is filled in.
 */
/** Platform addresses long enough to be a contract. Symbols and empty strings are skipped. */
function contractKeys(platforms: Record<string, string> | null | undefined): string[] {
  if (!platforms) return [];
  const out: string[] = [];
  for (const value of Object.values(platforms)) {
    const key = String(value || "").trim().toLowerCase();
    if (key.length >= 8) out.push(key);
  }
  return out;
}

/**
 * The markets table. Positive prices only, capped at 400, with the chain label
 * when the platform list loaded. This does not apply the projection sanity ratio.
 */
export function assembleListedMarkets(
  rows: CoinMarket[],
  platforms: Map<string, Record<string, string>> | null,
  reason: "page2" | "backup" | "short" | null = null
): { coins: CoinMarket[]; notice: string | null } {
  const listLoaded = platforms != null;
  const seen = new Set<string>();
  const coins = [...rows]
    .filter((row) => row?.id && typeof row.price === "number" && row.price > 0)
    .sort((a, b) => (a.rank ?? 999999) - (b.rank ?? 999999))
    .filter((row) => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    })
    .slice(0, 400)
    .map((coin) => {
      const labelled = blockchainLabel(platforms?.get(coin.id), listLoaded);
      const contracts = contractKeys(platforms?.get(coin.id));
      return {
        ...coin,
        name: coinDisplayName(coin.symbol, coin.name),
        blockchain: labelled || (coin.blockchain && coin.blockchain !== "Unavailable" ? coin.blockchain : ""),
        contracts: contracts.length ? contracts : coin.contracts,
      };
    });
  let notice = listedMarketNotice(coins.length, coins.length >= 400 ? null : reason);
  if (!listLoaded && coins.length > 0) {
    const chain = "The chain list did not load, so the Blockchain column is blank.";
    notice = notice ? `${notice} ${chain}` : chain;
  }
  return { coins, notice };
}

export function rankedFallbackPage(
  coins: CoinMarket[],
  limit = 400
): { coins: CoinMarket[]; notice: string | null } {
  const live = coins.filter(coinHasLivePrice).slice(0, limit).map((coin) => ({
    ...coin,
    blockchain: coin.blockchain && coin.blockchain !== "Unavailable" ? coin.blockchain : "",
    priceUnavailable: false,
  }));
  return { coins: live, notice: null };
}

/**
 * Rolling 24h percent from a CoinGecko markets row.
 * `price_change_percentage_24h` is the window CoinGecko and Kraken show.
 * The `_in_currency` field is only a backup: with extra windows requested it has
 * carried a longer change (TON printed about −12% against a −6% day).
 */
export function coingeckoRolling24h(row: {
  price_change_percentage_24h?: number | null;
  price_change_percentage_24h_in_currency?: number | { usd?: number | null } | null;
}): number | null {
  const rolling = row.price_change_percentage_24h;
  if (typeof rolling === "number" && Number.isFinite(rolling)) return rolling;
  const bag = row.price_change_percentage_24h_in_currency;
  const alt = typeof bag === "number" ? bag : bag?.usd;
  if (typeof alt === "number" && Number.isFinite(alt)) return alt;
  return null;
}

/**
 * Blockchain label for a CoinGecko coin.
 * An empty platforms object is native. A failed platform list stays blank.
 * The id is not used to guess a chain.
 */
export function blockchainLabel(
  platforms: Record<string, string> | null | undefined,
  listLoaded: boolean
): string {
  if (!listLoaded) return "";
  const keys = platforms ? Object.keys(platforms).map((key) => key.trim()).filter(Boolean) : [];
  if (!keys.length) return "Native";
  return keys.map(prettyChain).join(", ");
}

function prettyChain(key: string): string {
  const known: Record<string, string> = {
    ethereum: "Ethereum",
    "binance-smart-chain": "BNB Chain",
    "polygon-pos": "Polygon",
    solana: "Solana",
    avalanche: "Avalanche",
    "arbitrum-one": "Arbitrum",
    "optimistic-ethereum": "Optimism",
    base: "Base",
    "the-open-network": "TON",
  };
  if (known[key]) return known[key];
  return key
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Rich single-coin payload from CoinGecko /coins/{id}. */
export interface CoinDetail {
  id: string;
  symbol: string;
  name: string;
  image: string;
  rank: number | null;
  price: number;
  marketCap: number | null;
  fdv: number | null;
  volume24h: number | null;
  high24h: number | null;
  low24h: number | null;
  change1h: number | null;
  change24h: number | null;
  change7d: number | null;
  change30d: number | null;
  change1y: number | null;
  /** Snapshot clock for this price. One timestamp for the page. */
  quotedAt?: string | null;
  circulatingSupply: number | null;
  totalSupply: number | null;
  maxSupply: number | null;
  ath: number | null;
  athDate: string | null;
  athChangePct: number | null;
  atl: number | null;
  atlDate: string | null;
  atlChangePct: number | null;
  description: string; // plain text (HTML stripped)
  categories: string[];
  homepage: string | null;
  explorer: string | null;
  twitter: string | null;
  reddit: string | null;
  github: string | null;
  /** Feed that produced this detail. */
  source?: string;
  /** Visitor line for the price source. Computed on the server. */
  sourceLine?: string;
  /** When this page last checked the feeds. Missing figures use this clock. */
  checkedAt?: string | null;
}

/** Size fields. Zero means the feed did not send a figure. A real change of 0% is not in this list. */
export const MARKET_SIZE_FIELDS = [
  "marketCap",
  "fdv",
  "volume24h",
  "high24h",
  "low24h",
  "circulatingSupply",
  "totalSupply",
  "maxSupply",
  "ath",
] as const;

export type MarketSizeField = (typeof MARKET_SIZE_FIELDS)[number];

/** A positive figure. Zero and blanks are unavailable, so the cell is an em dash rather than 0. */
export function positiveMarketStat(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

function finiteChange(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** True when a saved row is still missing the figures CoinGecko or CoinPaprika can supply. */
export function marketStatsMissing(coin: CoinMarket): boolean {
  return (
    positiveMarketStat(coin.marketCap) == null ||
    positiveMarketStat(coin.volume24h) == null ||
    coin.change1h == null ||
    positiveMarketStat(coin.high24h) == null ||
    positiveMarketStat(coin.low24h) == null ||
    positiveMarketStat(coin.ath) == null
  );
}

function preferChange(
  current: number | null | undefined,
  incoming: number | null | undefined,
  zeroIsMissing: boolean
): number | null {
  const currentOk = finiteChange(current) != null && !(zeroIsMissing && current === 0);
  if (currentOk) return current as number;
  const next = finiteChange(incoming);
  if (next == null || (zeroIsMissing && next === 0)) return finiteChange(current);
  return next;
}

/** Copy cap, FDV, volume, range, supply and ATH from a donor when this row does not have them. */
export function mergeCoinMarketStats(base: CoinMarket, donor: CoinMarket): CoinMarket {
  const yahoo = (base.source || "").toLowerCase() === "yahoo";
  const next: CoinMarket = { ...base, moves: base.moves ? { ...base.moves } : base.moves ?? null };
  if (positiveMarketStat(next.marketCap) == null && positiveMarketStat(donor.marketCap) != null) next.marketCap = donor.marketCap;
  if (positiveMarketStat(next.fdv) == null && positiveMarketStat(donor.fdv) != null) next.fdv = donor.fdv;
  if (positiveMarketStat(next.volume24h) == null && positiveMarketStat(donor.volume24h) != null) next.volume24h = donor.volume24h;
  if (positiveMarketStat(next.high24h) == null && positiveMarketStat(donor.high24h) != null) next.high24h = donor.high24h;
  if (positiveMarketStat(next.low24h) == null && positiveMarketStat(donor.low24h) != null) next.low24h = donor.low24h;
  if (positiveMarketStat(next.circulatingSupply) == null && positiveMarketStat(donor.circulatingSupply) != null) {
    next.circulatingSupply = donor.circulatingSupply;
  }
  if (positiveMarketStat(next.totalSupply) == null && positiveMarketStat(donor.totalSupply) != null) next.totalSupply = donor.totalSupply;
  if (positiveMarketStat(next.maxSupply) == null && positiveMarketStat(donor.maxSupply) != null) next.maxSupply = donor.maxSupply;
  if (positiveMarketStat(next.ath) == null && positiveMarketStat(donor.ath) != null) next.ath = donor.ath;
  if (!next.athDate && donor.athDate) next.athDate = donor.athDate;
  if (positiveMarketStat(next.atl) == null && positiveMarketStat(donor.atl) != null) next.atl = donor.atl;
  if (!next.atlDate && donor.atlDate) next.atlDate = donor.atlDate;
  const baseName = (next.name || "").trim();
  const donorName = (donor.name || "").trim();
  if (baseName.toUpperCase() === next.symbol.toUpperCase() && donorName && donorName !== baseName) {
    next.name = donorName;
  }
  const chain = (next.blockchain || "").trim();
  const donorChain = (donor.blockchain || "").trim();
  if ((!chain || chain === "—" || chain === "Unavailable" || chain === "Native") && donorChain && donorChain !== "—" && donorChain !== "Unavailable" && donorChain !== "Native") {
    next.blockchain = donorChain;
  }
  next.change1h = preferChange(next.change1h, donor.change1h, false);
  const day = preferChange(next.moves?.h24 ?? next.change24h, donor.moves?.h24 ?? donor.change24h, false);
  const week = preferChange(next.moves?.d7 ?? next.change7d, donor.moves?.d7 ?? donor.change7d, yahoo);
  const month = preferChange(next.moves?.d30, donor.moves?.d30, false);
  if (day != null || week != null || month != null) {
    next.moves = { h24: day, d7: week, d30: month };
  }
  if (week != null) next.change7d = week;
  if ((!next.sparkline7d || next.sparkline7d.length < 2) && donor.sparkline7d && donor.sparkline7d.length > 1) {
    next.sparkline7d = donor.sparkline7d;
  }
  if (!next.paprikaId && donor.paprikaId) next.paprikaId = donor.paprikaId;
  return next;
}

function donorRank(source: string | undefined): number {
  const id = (source || "").toLowerCase();
  if (id === "coingecko") return 0;
  if (id === "coinpaprika") return 1;
  return 5;
}

/** Fill empty stats from CoinGecko and CoinPaprika rows. A real price on the base row stays. */
export function applyStatDonors(base: CoinMarket[], donors: CoinMarket[]): CoinMarket[] {
  const grouped = new Map<string, CoinMarket[]>();
  for (const donor of donors) {
    const symbol = (donor.symbol || "").toUpperCase();
    if (!symbol) continue;
    const list = grouped.get(symbol) || [];
    list.push(donor);
    grouped.set(symbol, list);
  }
  return base.map((coin) => {
    const matches = grouped.get(coin.symbol.toUpperCase()) || [];
    const ordered = [...matches].sort((a, b) => donorRank(a.source) - donorRank(b.source));
    return ordered.reduce((row, donor) => mergeCoinMarketStats(row, donor), coin);
  });
}

/**
 * A 24h volume that cannot be true for the coin's size is dropped (shown as —, not a wrong figure).
 * Large caps (≥ US$10B) rarely trade more than ~25% of their cap in a day; anything above 30% is
 * treated as a unit or vendor error (e.g. BTC at US$981.73B). Any coin above 5× its cap is dropped too.
 */
export function plausibleVolume24h(
  volume: number | null | undefined,
  marketCap: number | null | undefined,
  symbol?: string | null
): number | null {
  const v = positiveMarketStat(volume);
  if (v == null) return null;
  const cap = positiveMarketStat(marketCap);
  if (cap == null) return v;
  // A unit error (BTC volume printed as hundreds of billions). Stablecoins
  // such as tether really do trade more than 30% of their cap in a day.
  if (v > cap * 5) return null;
  if (!isStablecoinSymbol(symbol) && cap >= 1e10 && v > cap * 0.3) return null;
  return v;
}

/** Use snapshot moves and size fields when the detail call left them blank. */
export function overlayCoinDetail(detail: CoinDetail, coin: CoinMarket | null | undefined): CoinDetail {
  if (!coin) return detail;
  const size = (current: number | null | undefined, incoming: number | null | undefined) =>
    positiveMarketStat(current) ?? positiveMarketStat(incoming);
  const change = (current: number | null | undefined, incoming: number | null | undefined) =>
    finiteChange(current) ?? finiteChange(incoming);
  return {
    ...detail,
    price: detail.price > 0 ? detail.price : coin.price,
    marketCap: size(detail.marketCap, coin.marketCap),
    fdv: size(detail.fdv, coin.fdv),
    volume24h: (() => {
      const cap = size(detail.marketCap, coin.marketCap);
      const symbol = detail.symbol || coin.symbol;
      return plausibleVolume24h(detail.volume24h, cap, symbol) ?? plausibleVolume24h(coin.volume24h, cap, symbol);
    })(),
    high24h: size(detail.high24h, coin.high24h),
    low24h: size(detail.low24h, coin.low24h),
    change1h: finiteChange(coin.change1h) ?? finiteChange(detail.change1h),
    change24h: change(detail.change24h, coin.moves?.h24 ?? coin.change24h),
    change7d: change(detail.change7d, coin.moves?.d7 ?? coin.change7d),
    change30d: change(detail.change30d, coin.moves?.d30),
    circulatingSupply: size(detail.circulatingSupply, coin.circulatingSupply),
    totalSupply: size(detail.totalSupply, coin.totalSupply),
    maxSupply: size(detail.maxSupply, coin.maxSupply),
    ath: size(detail.ath, coin.ath),
    athDate: detail.athDate || coin.athDate || null,
    atl: size(detail.atl, coin.atl),
    atlDate: detail.atlDate || coin.atlDate || null,
    rank: detail.rank ?? (Number.isFinite(coin.rank) && coin.rank < 999999 ? coin.rank : null),
    image: detail.image || coin.image,
    name: detail.name || coin.name,
    symbol: detail.symbol || coin.symbol,
    quotedAt: coin.quotedAt || detail.quotedAt || null,
  };
}

/** A detail page built only from the shared snapshot, when the live detail call did not answer. */
export function detailFromMarket(coin: CoinMarket): CoinDetail {
  return overlayCoinDetail(
    {
      id: coin.id,
      symbol: coin.symbol,
      name: coin.name,
      image: coin.image,
      rank: null,
      price: 0,
      marketCap: null,
      fdv: null,
      volume24h: null,
      high24h: null,
      low24h: null,
      change1h: null,
      change24h: null,
      change7d: null,
      change30d: null,
      change1y: null,
      circulatingSupply: null,
      totalSupply: null,
      maxSupply: null,
      ath: null,
      athDate: null,
      athChangePct: null,
      atl: null,
      atlDate: null,
      atlChangePct: null,
      description: "",
      categories: ["Cryptocurrency"],
      homepage: null,
      explorer: null,
      twitter: null,
      reddit: null,
      github: null,
    },
    coin
  );
}

/** Percent move from the first point to the last. Null when the window is too short. */
export function windowReturnPct(points: Array<{ price: number }>): number | null {
  if (!points || points.length < 2) return null;
  const first = points[0]?.price;
  const last = points[points.length - 1]?.price;
  if (!(first > 0) || last == null || !Number.isFinite(last)) return null;
  return ((last - first) / first) * 100;
}

export interface ChartPoint {
  t: number; // epoch ms
  price: number;
}

export interface CoinChart {
  prices: ChartPoint[];
  volumes: ChartPoint[];
}

/** Selectable ranges in the Coin Detail chart. */
export type ChartRange = "1H" | "24H" | "7D" | "30D" | "90D" | "1Y" | "ALL";

/** Map a UI range to the CoinGecko market_chart `days` param. */
export const RANGE_TO_DAYS: Record<ChartRange, string> = {
  "1H": "1", // fetch 1 day @ 5-min then slice the last hour client-side
  "24H": "1",
  "7D": "7",
  "30D": "30",
  "90D": "90",
  "1Y": "365",
  ALL: "max",
};

export const CHART_RANGES: ChartRange[] = ["1H", "24H", "7D", "30D", "90D", "1Y", "ALL"];

/* ------------------------------ Formatting ------------------------------ */

/**
 * Professional price formatting with sensible, price-scaled decimals:
 *  ≥ $1 → 2dp · under $1 keeps significant digits so PEPE/FLOKI never print as $0.00 or $0.01.
 */
export function fmtPrice(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "—";
  const abs = Math.abs(n);
  const maximumFractionDigits = abs >= 1 ? 2 : adaptiveFractionDigits(abs);
  const minimumFractionDigits = abs >= 1 ? 2 : Math.min(2, maximumFractionDigits);
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(n);
}

/**
 * DASH-CLEAN-D: market-list price to 4 significant figures under US$1 (US$0.003334),
 * 2dp from US$1 up. Display only; the stored price is unchanged.
 */
export function fmtPriceSig(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1 || abs === 0) return fmtPrice(n);
  return new Intl.NumberFormat("en-NZ", { style: "currency", currency: "USD", maximumSignificantDigits: 4 }).format(n);
}

/**
 * DASH-CLEAN-D: one row per coin in the market list. Two feeds can send the same coin
 * (same name and symbol, different source). Keep the better-ranked row. Rows from the
 * same feed are distinct coins and are all kept.
 */
export function dedupeCrossFeedCoins(coins: CoinMarket[]): CoinMarket[] {
  const best = new Map<string, CoinMarket>();
  const out: CoinMarket[] = [];
  const seenIds = new Set<string>();
  for (const coin of coins) {
    if (seenIds.has(coin.id)) continue;
    seenIds.add(coin.id);
    const key = `${coin.name.replace(/[\u200b-\u200d\ufeff]/g, "").trim().toLowerCase()}|${coin.symbol.toUpperCase()}`;
    const prior = best.get(key);
    if (!prior) {
      best.set(key, coin);
      out.push(coin);
      continue;
    }
    if ((prior.source || "") === (coin.source || "")) {
      out.push(coin);
      continue;
    }
    const better = (coin.rank || Infinity) < (prior.rank || Infinity) ? coin : prior;
    if (better === coin) {
      out[out.indexOf(prior)] = coin;
      best.set(key, coin);
    }
  }
  return out;
}

/**
 * Absolute session move under a market row.
 * A sub-cent coin must not print a real move as +0.0000.
 */
export function formatAbsoluteChange(change: number, price: number): string {
  if (!Number.isFinite(change)) return "—";
  const abs = Math.abs(change);
  if (abs === 0) return "0.00";
  const reference = Math.abs(price);
  const dp =
    reference < 0.01 || abs < 0.0001
      ? Math.min(8, Math.max(4, 4 - Math.floor(Math.log10(abs)) - 1))
      : reference < 5
        ? 4
        : 2;
  let body = abs.toFixed(dp);
  if (Number(body) === 0) {
    body = abs.toFixed(Math.min(12, adaptiveFractionDigits(abs)));
  }
  body = body.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
  const sign = change > 0 ? "+" : "−";
  return `${sign}${body}`;
}

/**
 * Percent text for a market change. A non-zero move is not shown as 0.00 or 0.0000.
 * The caller adds the % sign. Zero is 0.00.
 */
export function formatMarketChangePercent(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs === 0) return "0.00";
  let text = abs.toFixed(2);
  // |x| < 0.005 rounds to 0.00 at 2dp. Two significant figures, with no 4dp cap, so this never prints 0.0000.
  if (Number(text) === 0) {
    const decimals = Math.max(2, -Math.floor(Math.log10(abs)) + 1);
    text = abs.toFixed(decimals);
  }
  return text;
}

/** Compact USD notation for market caps / volumes → $1.23B, $45.6M, $12.3K. */
export function fmtCompactUsd(n: number | null | undefined): string {
  if (n == null || !isFinite(n) || n === 0) return "—";
  // M-5: USD amounts carry "US$" so they are never read as NZ$ (e.g. "US$1.64T").
  const sign = n < 0 ? "-" : "";
  const body = new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(Math.abs(n));
  return `${sign}US$${body}`;
}

/** Compact plain number (supply counts) → 19.8M, 1.2B. */
export function fmtCompactNum(n: number | null | undefined): string {
  if (n == null || !isFinite(n) || n === 0) return "—";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n);
}

/** Signed, coloured-elsewhere percentage → "+3.21%", "-0.90%". */
export const PRICE_STALE_MS = 24 * 60 * 60 * 1000;

/** A price older than 24 hours is not shown as a live print. */
export const PRICE_LABEL_STALE_MS = 15 * 60 * 1000;

/** A label when the quote is older than 15 minutes. The price itself stays on the page. */
export function quoteStaleLabel(quotedAt: string | null | undefined, now = Date.now()): string | null {
  const at = Date.parse(quotedAt || "");
  if (!Number.isFinite(at)) return null;
  if (now - at <= PRICE_LABEL_STALE_MS) return null;
  const wall = formatDisplayDateTime(quotedAt);
  if (!wall || wall === "—") return "This price is more than 15 minutes old.";
  return `Price as at ${wall} (NZ) is more than 15 minutes old.`;
}

export function stalePriceReason(quotedAt: string | null | undefined, now = Date.now()): string | null {
  const at = Date.parse(quotedAt || "");
  if (!Number.isFinite(at)) return null;
  if (now - at <= PRICE_STALE_MS) return null;
  const wall = formatDisplayDate(quotedAt);
  return `This price is from ${wall}, more than 24 hours ago.`;
}

export function fmtPct(n: number | null | undefined, decimals = 2): string {
  if (n == null || !isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(decimals)}%`;
}

/**
 * Tailwind colour class for a delta (green up / red down / muted flat).
 * b74 M-7: the one text green (text-gain, AA on light and dark surfaces) and an AA red on the light
 * sheet; emerald-400 / rose-400 were under 3:1 on white.
 */
export function pctColor(n: number | null | undefined): string {
  if (n == null || !isFinite(n) || n === 0) return "text-muted-foreground";
  return n > 0 ? "text-gain" : "text-rose-600";
}

/**
 * Percent change from the first to the last positive print in a 7-day series.
 * Returns 0 when the series is genuinely flat. Returns null when there is no series.
 */
export function sevenDayReturnPct(series: Array<number | null | undefined> | null | undefined): number | null {
  if (!series || series.length < 2) return null;
  const closes = series.filter((n): n is number => typeof n === "number" && isFinite(n) && n > 0);
  if (closes.length < 2) return null;
  const first = closes[0];
  const last = closes[closes.length - 1];
  if (!(first > 0)) return null;
  const pct = ((last - first) / first) * 100;
  return isFinite(pct) ? pct : null;
}

/**
 * Live 7-day change for a market row.
 * A sparkline is the source of truth. An explicit 0 with no sparkline is the
 * placeholder feeds emit when the 7-day window was never fetched — not a flat market.
 */
export function resolveSevenDayChange(
  explicit: number | null | undefined,
  sparkline?: Array<number | null | undefined> | null
): number | null {
  const fromSeries = sevenDayReturnPct(sparkline);
  if (fromSeries != null) return fromSeries;
  if (typeof explicit === "number" && isFinite(explicit) && explicit !== 0) return explicit;
  return null;
}

export function sevenDayBoardIsMissing<T extends { change7d: number; sparkline7d?: number[] | null }>(
  coins: T[]
): boolean {
  if (coins.length < 5) return false;
  const missing = coins.filter((c) => resolveSevenDayChange(c.change7d, c.sparkline7d) == null).length;
  return missing / coins.length >= 0.4;
}

/** Fill missing 7-day changes from a second feed (same symbol), preferring sparkline math. */
export function mergeSevenDayChanges<T extends { symbol: string; change7d: number; sparkline7d: number[] }>(
  coins: T[],
  fallback: Array<{ symbol: string; change7d: number; sparkline7d?: number[] | null }>
): T[] {
  const bySymbol = new Map(fallback.map((c) => [c.symbol.toUpperCase(), c]));
  return coins.map((coin) => {
    const own = resolveSevenDayChange(coin.change7d, coin.sparkline7d);
    if (own != null) return { ...coin, change7d: own };
    const alt = bySymbol.get(coin.symbol.toUpperCase());
    if (!alt) return coin;
    const altPct = resolveSevenDayChange(alt.change7d, alt.sparkline7d);
    if (altPct == null) return coin;
    const sparkline =
      coin.sparkline7d && coin.sparkline7d.length >= 2
        ? coin.sparkline7d
        : (alt.sparkline7d ?? []).filter((n): n is number => typeof n === "number" && isFinite(n));
    return { ...coin, change7d: altPct, sparkline7d: sparkline };
  });
}

/**
 * Coin logo URL from a ticker symbol.
 *
 * Swyftx's market endpoints don't return logos, so we resolve them from a
 * reliable symbol-keyed public icon CDN. Components add an onError fallback to a
 * generic coin glyph for the handful of tickers the CDN doesn't cover.
 */
export const GENERIC_COIN_ICON =
  "https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons@0.18.1/svg/color/generic.svg";

export function coinLogo(symbol: string | null | undefined): string {
  const s = (symbol || "").toLowerCase().trim();
  if (!s) return GENERIC_COIN_ICON;
  return `https://assets.coincap.io/assets/icons/${s}@2x.png`;
}

/** Short date like "12 Mar 2021" from an ISO string. */
export function fmtShortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  // Goal b11 G-17: house date style, e.g. "6 Oct 2025".
  return d.toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric", timeZone: "Pacific/Auckland" });
}

/* ------------------------- Projected Performers -------------------------- */
/**
 * RANKING FORMULA (documented + surfaced to the user via an info tooltip).
 *
 * We scan the ENTIRE top-500 universe, then rank by a transparent momentum
 * composite that leans on the most recent move but rewards sustained strength:
 *
 *     momentumScore = 0.70 · change24h + 0.30 · change7d
 *
 * Only coins with a POSITIVE 24h change qualify as "top performers" — we never
 * present a negative number as a top performer. A light liquidity guard
 * (24h volume ≥ $250k) filters out illiquid micro-pumps that would otherwise
 * dominate a naïve %-sort.
 *
 * If the whole market is red (fewer positive names than requested), we fall
 * back to the strongest RELATIVE names (least-negative) and flag it with
 * `marketBroadlyDown` so the UI can label it honestly.
 */
export interface RankedPerformer extends CoinMarket {
  momentumScore: number;
}

const MIN_VOLUME_USD = 250_000;

export function rankPerformers(
  coins: CoinMarket[],
  limit: number
): { performers: RankedPerformer[]; marketBroadlyDown: boolean; scanned: number } {
  const scanned = coins.length;
  const withScore: RankedPerformer[] = coins
    .filter((c) => (c.volume24h ?? 0) >= MIN_VOLUME_USD)
    .map((c) => ({ ...c, momentumScore: 0.7 * c.change24h + 0.3 * c.change7d }));

  const positives = withScore
    .filter((c) => c.change24h > 0)
    .sort((a, b) => b.momentumScore - a.momentumScore);

  if (positives.length >= limit) {
    return { performers: positives.slice(0, limit), marketBroadlyDown: false, scanned };
  }

  // Broad market weakness — surface the strongest relative names, transparently.
  const byScore = [...withScore].sort((a, b) => b.momentumScore - a.momentumScore);
  return {
    performers: byScore.slice(0, limit),
    marketBroadlyDown: positives.length < Math.min(limit, 3),
    scanned,
  };
}

/* --------------------------- Sort & filter model ------------------------- */

export type SortKey = "market_cap" | "change24h" | "change7d" | "volume" | "price";
export type FilterKey = "all" | "gainers" | "losers" | "high_volume";

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "market_cap", label: "Market Cap" },
  { value: "change24h", label: "24h Change %" },
  { value: "change7d", label: "7d Change %" },
  { value: "volume", label: "24h Volume" },
  { value: "price", label: "Price" },
];

export const FILTER_OPTIONS: { value: FilterKey; label: string }[] = [
  { value: "all", label: "All" },
  { value: "gainers", label: "Top Gainers 24h" },
  { value: "losers", label: "Top Losers" },
  { value: "high_volume", label: "High Volume" },
];

/** Apply search + filter + sort to a coin list (pure, memo-friendly). */
export function selectCoins(
  coins: CoinMarket[],
  opts: { search: string; sort: SortKey; filter: FilterKey }
): CoinMarket[] {
  const q = opts.search.trim().toLowerCase();
  let out = coins;

  if (q) {
    out = out.filter(
      (c) => c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q)
    );
  }

  if (opts.filter === "gainers") out = out.filter((c) => c.change24h > 0);
  else if (opts.filter === "losers") out = out.filter((c) => c.change24h < 0);
  else if (opts.filter === "high_volume") {
    const sorted = [...out].sort((a, b) => b.volume24h - a.volume24h);
    out = sorted.slice(0, Math.min(100, sorted.length));
  }

  const sorted = [...out].sort((a, b) => {
    switch (opts.sort) {
      case "change24h":
        return b.change24h - a.change24h;
      case "change7d":
        return b.change7d - a.change7d;
      case "volume":
        return b.volume24h - a.volume24h;
      case "price":
        return b.price - a.price;
      case "market_cap":
      default:
        return a.rank - b.rank; // rank asc == market cap desc
    }
  });

  return sorted;
}

/**
 * X-axis ticks for multi-day charts: one tick per whole day (stepped so at most `maxTicks`),
 * so the axis never prints the same date twice ("9 Oct 9 Oct 10 Oct").
 */
export function dailyAxisTicks(minT: number, maxT: number, maxTicks = 6): number[] {
  if (!Number.isFinite(minT) || !Number.isFinite(maxT) || maxT <= minT) return [];
  const DAY = 86_400_000;
  const days = Math.max(1, Math.ceil((maxT - minT) / DAY));
  const step = Math.max(1, Math.ceil(days / maxTicks)) * DAY;
  const first = Math.ceil(minT / DAY) * DAY;
  const ticks: number[] = [];
  for (let t = first; t <= maxT; t += step) ticks.push(t);
  return ticks;
}


/**
 * b69 (TT b68 P2): one row per coin id. Run after the symbol rename step (MATIC -> POL).
 * A CoinGecko row owns its own id (its id and symbol come from the same record). Otherwise the
 * higher-ranked row (lower market-cap rank number, then larger market cap) wins. Symbols are never
 * mapped to ids by name here; a duplicate is dropped, not renamed.
 */
export function dedupeCoinsById<T extends { id?: string | null; symbol?: string | null; rank?: number | null; marketCap?: number | null; source?: string | null }>(coins: T[]): T[] {
  const best = new Map<string, T>();
  const order: string[] = [];
  const owns = (c: T) => ((c.source || "coingecko").toLowerCase() === "coingecko" ? 1 : 0);
  const beats = (a: T, b: T) => {
    if (owns(a) !== owns(b)) return owns(a) > owns(b);
    const ra = a.rank ?? 999999;
    const rb = b.rank ?? 999999;
    if (ra !== rb) return ra < rb;
    return (a.marketCap || 0) > (b.marketCap || 0);
  };
  const loose: T[] = [];
  for (const coin of coins) {
    const id = String(coin.id || "").trim().toLowerCase();
    if (!id) {
      loose.push(coin);
      continue;
    }
    const prev = best.get(id);
    if (!prev) {
      best.set(id, coin);
      order.push(id);
    } else if (beats(coin, prev)) {
      best.set(id, coin);
    }
  }
  const kept = new Set(best.values());
  return coins.filter((coin) => kept.has(coin) || loose.includes(coin));
}

/** b69: the listed symbol after the rename step (MATIC is listed as POL). */
export function renamedCoinSymbol(symbol: string | null | undefined): string {
  const code = String(symbol || "").trim().toUpperCase();
  return TICKER_ALIASES[code] ?? code;
}
