/**
 * G-17 coin-page depth: market cap, 24h volume, circulating supply, 1h and 30d change.
 *
 * A live print that only has a price must not replace a fuller record.
 * A missing figure stays missing and is labelled with the time we checked.
 */

import { coinMetricsSourceLine, depthMissingReason } from "@/lib/coin-depth";
import { tickerForCoingeckoId } from "@/lib/crypto-ids";
import { coinsFromCoinGeckoMarkets, coinsFromCoinPaprika } from "@/lib/crypto-keyless-seed";
import {
  detailFromMarket,
  fmtCompactNum,
  fmtCompactUsd,
  fmtPct,
  plausibleVolume24h,
  type CoinDetail,
  type CoinMarket,
} from "@/lib/crypto-market";

const memory = new Map<string, CoinDetail>();

function pos(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function change(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Cap, volume, supply, and both window changes. A real 0% change counts. */
export function pageDepthComplete(row: {
  marketCap?: number | null;
  volume24h?: number | null;
  circulatingSupply?: number | null;
  change1h?: number | null;
  change30d?: number | null;
} | null | undefined): boolean {
  if (!row) return false;
  return (
    pos(row.marketCap) != null &&
    pos(row.volume24h) != null &&
    pos(row.circulatingSupply) != null &&
    change(row.change1h) != null &&
    change(row.change30d) != null
  );
}

export function marketDepthComplete(coin: CoinMarket | null | undefined): boolean {
  if (!coin) return false;
  return pageDepthComplete({
    marketCap: coin.marketCap,
    volume24h: coin.volume24h,
    circulatingSupply: coin.circulatingSupply,
    change1h: coin.change1h,
    change30d: coin.moves?.d30 ?? null,
  });
}

/** How much of the G-17 record this detail actually carries. Price alone scores 0. */
export function depthScore(detail: CoinDetail | null | undefined): number {
  if (!detail) return 0;
  let score = 0;
  if (pos(detail.marketCap)) score += 2;
  if (pos(detail.volume24h)) score += 2;
  if (pos(detail.circulatingSupply)) score += 2;
  if (change(detail.change1h) != null) score += 1;
  if (change(detail.change30d) != null) score += 1;
  return score;
}

function withSlug(detail: CoinDetail, slug: string): CoinDetail {
  return { ...detail, id: detail.id || slug };
}

/**
 * Fill gaps from `cached`. A price-only `fresh` row (DexPaprika last good price)
 * does not replace a record that already has depth.
 */
export function mergeCoinDepth(fresh: CoinDetail | null | undefined, cached: CoinDetail | null | undefined): CoinDetail | null {
  if (!fresh && !cached) return null;
  if (!fresh) return cached ? { ...cached } : null;
  if (!cached) return { ...fresh };
  if (depthScore(fresh) === 0 && depthScore(cached) > 0) return { ...cached };
  if (depthScore(cached) === 0) return { ...fresh, id: fresh.id || cached.id };
  const preferFresh = depthScore(fresh) >= depthScore(cached);
  const lead = preferFresh ? fresh : cached;
  return {
    ...cached,
    ...fresh,
    id: fresh.id || cached.id,
    symbol: fresh.symbol || cached.symbol,
    name: fresh.name && fresh.name.toUpperCase() !== (fresh.symbol || "").toUpperCase() ? fresh.name : cached.name || fresh.name,
    price: pos(lead.price) ?? pos(fresh.price) ?? pos(cached.price) ?? lead.price,
    marketCap: pos(fresh.marketCap) ?? pos(cached.marketCap),
    volume24h: pos(fresh.volume24h) ?? pos(cached.volume24h),
    circulatingSupply: pos(fresh.circulatingSupply) ?? pos(cached.circulatingSupply),
    change1h: change(fresh.change1h) ?? change(cached.change1h),
    change24h: change(fresh.change24h) ?? change(cached.change24h),
    change7d: change(fresh.change7d) ?? change(cached.change7d),
    change30d: change(fresh.change30d) ?? change(cached.change30d),
    source: lead.source || fresh.source || cached.source,
    quotedAt: lead.quotedAt || fresh.quotedAt || cached.quotedAt,
    checkedAt: fresh.checkedAt || cached.checkedAt || null,
    description: fresh.description || cached.description,
  };
}

export function emptyCoinDetail(slug: string, checkedAt: string): CoinDetail {
  const symbol = tickerForCoingeckoId(slug) || slug.toUpperCase();
  return {
    id: slug,
    symbol,
    name: slug,
    image: "",
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
    checkedAt,
  };
}

export function detailFromListedCoin(coin: CoinMarket, slug: string): CoinDetail {
  return {
    ...detailFromMarket(coin),
    id: coin.id || slug,
    source: coin.source || "coingecko",
    quotedAt: coin.quotedAt || null,
  };
}

/** One CoinPaprika ticker, or a one-element list. Nothing is filled in by hand. */
export function detailFromPaprikaTicker(body: unknown, slug: string): CoinDetail | null {
  const [coin] = coinsFromCoinPaprika(Array.isArray(body) ? body : body ? [body] : []);
  if (!coin || !(coin.price > 0)) return null;
  return withSlug({ ...detailFromListedCoin(coin, slug), source: "coinpaprika" }, slug);
}

/** One CoinGecko /coins/markets payload (an array). */
export function detailFromGeckoMarkets(body: unknown, slug: string): CoinDetail | null {
  const coins = coinsFromCoinGeckoMarkets(body);
  const coin = coins.find((row) => row.id === slug) ?? (coins.length === 1 ? coins[0] : null);
  if (!coin || !(coin.price > 0)) return null;
  return withSlug({ ...detailFromListedCoin(coin, slug), source: "coingecko" }, slug);
}

export interface DepthChoice {
  slug: string;
  listed?: CoinDetail | null;
  cached?: CoinDetail | null;
  gecko?: CoinDetail | null;
  paprika?: CoinDetail | null;
  yahoo?: CoinDetail | null;
  checkedAt: string;
}

/**
 * Prefer a full live record, then fill holes from the snapshot and the last good record.
 * Always returns a detail so the page can label anything that is still missing.
 */
export function chooseCoinDepth(input: DepthChoice): CoinDetail {
  let current: CoinDetail | null = input.listed ?? null;
  for (const next of [input.gecko, input.paprika, input.yahoo]) {
    current = mergeCoinDepth(next, current);
  }
  current = mergeCoinDepth(current, input.cached ?? null);
  if (!current) return emptyCoinDetail(input.slug, input.checkedAt);
  return {
    ...withSlug(current, input.slug),
    // b28 review: checkedAt is when this page checked the feeds, not the quote time.
    checkedAt: input.checkedAt,
  };
}

function memoryKeys(detail: CoinDetail): string[] {
  const keys = new Set<string>();
  if (detail.id) keys.add(detail.id.toLowerCase());
  if (detail.symbol) keys.add(detail.symbol.toLowerCase());
  return [...keys];
}

/** Keep the fullest record seen for this coin. A later price-only print does not erase it. */
export function rememberCoinDepth(detail: CoinDetail | null | undefined): void {
  if (!detail?.id) return;
  const id = detail.id.toLowerCase();
  const prev = memory.get(id) ?? null;
  const next = mergeCoinDepth(detail, prev);
  if (!next || depthScore(next) === 0) return;
  const stored = { ...next, id };
  for (const key of memoryKeys(stored)) memory.set(key, stored);
}

export function recallCoinDepth(idOrSymbol: string | null | undefined): CoinDetail | null {
  const key = (idOrSymbol || "").trim().toLowerCase();
  if (!key) return null;
  return memory.get(key) ?? null;
}

export function resetCoinDepthMemory(): void {
  memory.clear();
}

/**
 * A refresh that omits a coin must not throw away the last full record.
 * b24 kept the list refresh alive, so a short seed could replace the snapshot
 * and drop tether, rain, and figure-heloc until the next lucky fetch.
 */
/** b28 review: a retained row older than this is dropped rather than carried into a new snapshot. */
export const RETAIN_MAX_AGE_MS = 6 * 60 * 60 * 1000;

export function retainDepthCoins(next: CoinMarket[], previous: CoinMarket[], limit = 400, now = Date.now()): CoinMarket[] {
  const symbols = new Set(next.map((coin) => (coin.symbol || "").toUpperCase()).filter(Boolean));
  const ids = new Set(next.map((coin) => (coin.id || "").toLowerCase()).filter(Boolean));
  const kept = previous.filter((coin) => {
    const symbol = (coin.symbol || "").toUpperCase();
    const id = (coin.id || "").toLowerCase();
    if (!symbol || !id) return false;
    if (symbols.has(symbol) || ids.has(id)) return false;
    // b28 review (honesty): only a row that carries its own quote time, younger than 6 h, is kept,
    // and it keeps that time, so the page never shows old figures as of the new snapshot.
    const quoted = Date.parse(coin.quotedAt || "");
    if (!Number.isFinite(quoted) || now - quoted > RETAIN_MAX_AGE_MS) return false;
    return marketDepthComplete(coin);
  });
  if (!kept.length) return next.slice(0, Math.max(0, limit));
  return [...next, ...kept]
    .sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0) || (a.rank ?? 999999) - (b.rank ?? 999999))
    .slice(0, Math.max(0, limit));
}

export interface DepthFieldView {
  key: "marketCap" | "volume24h" | "supply" | "change1h" | "change30d";
  label: string;
  text: string;
  missing: boolean;
}

export function coinDepthViewModel(
  detail: CoinDetail | null | undefined,
  checkedAt?: string | null
): { sourceLine: string; fields: DepthFieldView[] } {
  const checked = detail?.checkedAt || checkedAt || detail?.quotedAt || null;
  const missingText = depthMissingReason(detail?.source, checked);
  const cap = pos(detail?.marketCap);
  const volume = detail ? plausibleVolume24h(detail.volume24h, detail.marketCap, detail.symbol) : null;
  const supply = pos(detail?.circulatingSupply);
  const hour = change(detail?.change1h);
  const month = change(detail?.change30d);
  const sourceLine = coinMetricsSourceLine(detail?.source, detail?.quotedAt || checked);
  return {
    sourceLine,
    fields: [
      { key: "marketCap", label: "Market cap", text: cap != null ? fmtCompactUsd(cap) : missingText, missing: cap == null },
      { key: "volume24h", label: "24h volume", text: volume != null ? fmtCompactUsd(volume) : missingText, missing: volume == null },
      { key: "supply", label: "Circulating supply", text: supply != null ? fmtCompactNum(supply) : missingText, missing: supply == null },
      { key: "change1h", label: "1h change", text: hour != null ? fmtPct(hour) : missingText, missing: hour == null },
      { key: "change30d", label: "30d change", text: month != null ? fmtPct(month) : missingText, missing: month == null },
    ],
  };
}
