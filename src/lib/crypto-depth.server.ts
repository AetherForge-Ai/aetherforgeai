/**
 * Server read for one coin page (G-17).
 * Snapshot and the in-memory last good record come first.
 * CoinGecko's light markets row, CoinPaprika, and a mapped Yahoo quote fill gaps.
 * A price-only DexPaprika print is not a full record.
 */

import "server-only";

import { coinGeckoEndpoint, redactSecrets } from "@/lib/coingecko-auth";
import { tickerForCoingeckoId } from "@/lib/crypto-ids";
import { peekTop400 } from "@/lib/crypto-coingecko";
import { CROSS_PROVIDER_IDS } from "@/lib/crypto-provider-ids";

export { CROSS_PROVIDER_IDS };
import {
  chooseCoinDepth,
  detailFromGeckoMarkets,
  detailFromListedCoin,
  detailFromPaprikaTicker,
  emptyCoinDetail,
  pageDepthComplete,
  recallCoinDepth,
  rememberCoinDepth,
  type DepthChoice,
} from "@/lib/crypto-depth-record";
import type { CoinDetail, CoinMarket } from "@/lib/crypto-market";
import { readCryptoSnapshot } from "@/lib/crypto-snapshot";
import { fetchYahooCoinDetail } from "@/lib/crypto-yahoo";
import { withTimeout } from "@/lib/with-timeout";

/** Provider ids live in crypto-provider-ids.ts so redirects and this lookup share one map. */
const PAPRIKA_ID_BY_SLUG: Record<string, string> = Object.fromEntries(
  Object.entries(CROSS_PROVIDER_IDS).map(([slug, ids]) => [slug, ids.paprika])
);

const YAHOO_TICKER_BY_SLUG: Record<string, string> = {
  tether: "USDT",
  "usd-coin": "USDC",
  dai: "DAI",
};

function findListed(coins: CoinMarket[] | undefined, slug: string): CoinMarket | null {
  if (!coins?.length) return null;
  const mapped = CROSS_PROVIDER_IDS[slug];
  const symbol = (mapped?.symbol || tickerForCoingeckoId(slug) || "").toUpperCase();
  const ids = new Set([slug, mapped?.gecko, mapped?.paprika].filter(Boolean) as string[]);
  return coins.find((coin) => ids.has(coin.id)) ?? coins.find((coin) => !!symbol && coin.symbol.toUpperCase() === symbol) ?? null;
}

async function readListed(slug: string): Promise<CoinMarket | null> {
  // b31 H-1: the shared snapshot first, so the coin page shows the same price as /markets.
  const saved = await withTimeout(() => readCryptoSnapshot(), 1_500, null);
  return findListed(saved?.coins, slug) ?? findListed(peekTop400()?.coins, slug);
}

/** b31 H-1: this coin's row in the shared snapshot, with the snapshot's as-at and version. */
export async function snapshotCoinFor(slug: string): Promise<{ coin: CoinMarket; at: string; version: number } | null> {
  const saved = await withTimeout(() => readCryptoSnapshot(), 1_500, null);
  const coin = findListed(saved?.coins, slug);
  return coin && saved && coin.price > 0 ? { coin, at: saved.at, version: saved.version } : null;
}

/**
 * Saved-list id for this slug, including a row whose price is missing.
 * A zero price means the quote failed. It does not mean the coin is unknown.
 */
export async function savedCoinSlug(slug: string): Promise<string | null> {
  const saved = await withTimeout(() => readCryptoSnapshot(), 1_500, null);
  const coin = findListed(saved?.coins, slug) ?? findListed(peekTop400()?.coins, slug);
  const id = (coin?.id || "").trim().toLowerCase();
  return id || null;
}

async function fetchJson(url: string, headers: Record<string, string>, ms: number): Promise<unknown | null> {
  try {
    const res = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(ms) });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error("[crypto-depth] fetch failed:", redactSecrets(err instanceof Error ? err.message : "failed"));
    return null;
  }
}

async function loadGeckoMarket(slug: string, ms: number): Promise<CoinDetail | null> {
  const mapped = CROSS_PROVIDER_IDS[slug];
  if (mapped && mapped.gecko === null) return null;
  const geckoId = mapped?.gecko || slug;
  const path =
    `/coins/markets?vs_currency=usd&ids=${encodeURIComponent(geckoId)}` +
    "&order=market_cap_desc&per_page=1&page=1&sparkline=false&price_change_percentage=1h,24h,7d,30d";
  const first = coinGeckoEndpoint();
  let body = await fetchJson(`${first.base}${path}`, first.headers, ms);
  if (!body && first.mode !== "keyless") {
    const plain = coinGeckoEndpoint(process.env, true);
    body = await fetchJson(`${plain.base}${path}`, plain.headers, ms);
  }
  return detailFromGeckoMarkets(body, slug);
}

async function loadPaprikaTicker(paprikaId: string, slug: string, ms: number): Promise<CoinDetail | null> {
  const body = await fetchJson(
    `https://api.coinpaprika.com/v1/tickers/${encodeURIComponent(paprikaId)}?quotes=USD`,
    { accept: "application/json" },
    ms
  );
  return detailFromPaprikaTicker(body, slug);
}

async function searchPaprikaId(slug: string, ms: number): Promise<string> {
  const symbol = (tickerForCoingeckoId(slug) || "").toUpperCase();
  const body = await fetchJson(
    `https://api.coinpaprika.com/v1/search/?q=${encodeURIComponent(slug)}&c=currencies&limit=8`,
    { accept: "application/json" },
    ms
  );
  const currencies = body && typeof body === "object" && Array.isArray((body as { currencies?: unknown }).currencies)
    ? ((body as { currencies: Array<{ id?: string; symbol?: string }> }).currencies)
    : [];
  const match = currencies.find((row) => {
    const id = String(row.id || "").toLowerCase();
    const code = String(row.symbol || "").toUpperCase();
    return id === slug || id.endsWith(`-${slug}`) || (symbol && code === symbol);
  });
  return String(match?.id || "").trim();
}

async function loadPaprika(slug: string, ms: number): Promise<CoinDetail | null> {
  const known = PAPRIKA_ID_BY_SLUG[slug];
  if (known) {
    const direct = await loadPaprikaTicker(known, slug, ms);
    if (direct) return direct;
  }
  const id = await searchPaprikaId(slug, ms);
  if (!id) return null;
  return loadPaprikaTicker(id, slug, ms);
}

async function loadYahoo(slug: string): Promise<CoinDetail | null> {
  const ticker = YAHOO_TICKER_BY_SLUG[slug] || null;
  if (!ticker) return null;
  try {
    const detail = await fetchYahooCoinDetail(ticker);
    if (!(detail.price > 0)) return null;
    return { ...detail, id: slug, symbol: ticker, source: "yahoo" };
  } catch (err) {
    console.error("[crypto-depth] yahoo fallback failed:", err instanceof Error ? err.message.slice(0, 120) : "failed");
    return null;
  }
}

async function fetchFallbacks(slug: string, budgetMs: number): Promise<Pick<DepthChoice, "gecko" | "paprika" | "yahoo">> {
  const ms = Math.max(400, Math.min(budgetMs, 2_200));
  const [gecko, paprika, yahoo] = await Promise.all([
    loadGeckoMarket(slug, ms).catch(() => null),
    loadPaprika(slug, ms).catch(() => null),
    loadYahoo(slug).catch(() => null),
  ]);
  return { gecko, paprika, yahoo };
}

/**
 * Full depth for one listed coin. `budgetMs` 0 skips the network and uses only
 * the snapshot plus the last good record.
 */
export async function ensureCoinDepth(opts: {
  slug: string;
  listed?: CoinMarket | null;
  live?: CoinDetail | null;
  budgetMs?: number;
}): Promise<CoinDetail> {
  const slug = opts.slug.trim().toLowerCase();
  const checkedAt = new Date().toISOString();
  const cached = recallCoinDepth(slug);
  const listedCoin = opts.listed === undefined ? await readListed(slug) : opts.listed;
  const listed = listedCoin ? detailFromListedCoin(listedCoin, slug) : null;
  const ready = chooseCoinDepth({
    slug,
    listed,
    cached,
    gecko: opts.live ?? null,
    checkedAt,
  });
  if (pageDepthComplete(ready) || (opts.budgetMs ?? 2_200) <= 0) {
    rememberCoinDepth(ready);
    return { ...ready, checkedAt };
  }
  const fetched = await withTimeout(() => fetchFallbacks(slug, opts.budgetMs ?? 2_200), opts.budgetMs ?? 2_200, {
    gecko: null,
    paprika: null,
    yahoo: null,
  });
  const chosen = chooseCoinDepth({
    slug,
    listed: ready,
    gecko: fetched?.gecko ?? null,
    paprika: fetched?.paprika ?? null,
    yahoo: fetched?.yahoo ?? null,
    checkedAt,
  });
  const final = chosen.id ? chosen : emptyCoinDetail(slug, checkedAt);
  rememberCoinDepth(final);
  return { ...final, checkedAt };
}
