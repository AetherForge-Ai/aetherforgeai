/**
 * Crypto data source selector (server-only).
 *
 * Cascade (never leave the Crypto tab dark):
 *   1) CoinGecko
 *   2) Swyftx, only when SWYFTX_PUBLIC_DISPLAY is on
 *   3) Yahoo Finance major-coin fallback
 *
 * Id namespaces: short codes ("btc") and CoinGecko slugs ("bitcoin").
 * Fallback paths remap via canonicalCryptoId.
 */

import "server-only";
import * as swyftx from "@/lib/crypto-swyftx";
import * as coingecko from "@/lib/crypto-coingecko";
import * as yahoo from "@/lib/crypto-yahoo";
import {
  coinHasLivePrice,
  coinLogo,
  LIVE_CRYPTO_UNAVAILABLE,
  mergeSevenDayChanges,
  resolveSevenDayChange,
  sevenDayBoardIsMissing,
  type CoinMarket,
  type CoinDetail,
  type CoinChart,
} from "@/lib/crypto-market";
import { canonicalCryptoId, normalizeCryptoTicker } from "@/lib/crypto-ids";
import { formatDisplayDateTime } from "@/lib/currency";
import { listedMarketNotice, noticeWithAsOf } from "@/lib/crypto-coverage";
import { selectListedMarkets } from "@/lib/crypto-list";
import { persistCryptoSnapshot, readCryptoSnapshot, snapshotWorthSaving } from "@/lib/crypto-snapshot";
import { publicCoinDescription, publicCoinSourceLine } from "@/lib/data-sources";
import { swyftxPublicDisplay } from "@/lib/swyftx-display";

type RankedCryptoPage = Awaited<ReturnType<typeof coingecko.fetchTop400>>;

function toCgId(id: string): string {
  const t = normalizeCryptoTicker(id);
  // Already a coingecko slug?
  if (id.includes("-") || id.length > 6) return id.toLowerCase();
  return canonicalCryptoId(t);
}

const MIN_CRYPTO_UNIVERSE = 100;

function coinKey(c: CoinMarket): string {
  return (c.symbol || c.id || "").toUpperCase();
}

/** Keep the first copy of each symbol, ordered by market-cap rank. */
function mergeByRank(lists: CoinMarket[][]): CoinMarket[] {
  const seen = new Set<string>();
  const out: CoinMarket[] = [];
  for (const list of lists) {
    for (const coin of list) {
      const key = coinKey(coin);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(coin);
    }
  }
  return out.sort((a, b) => (a.rank ?? 999999) - (b.rank ?? 999999));
}

const PINNED_COINS: { symbol: string; id: string; name: string }[] = [
  { symbol: "JUP", id: "jupiter-exchange-solana", name: "Jupiter" },
];

/** Keep Jupiter (and any future pins) in the selector even if a feed omits them. */
async function ensurePinnedCoins(coins: CoinMarket[]): Promise<CoinMarket[]> {
  const have = new Set(coins.map((c) => (c.symbol || "").toUpperCase()));
  const missing = PINNED_COINS.filter((p) => !have.has(p.symbol));
  if (!missing.length) return coins;
  const extras: CoinMarket[] = [];
  for (const pin of missing) {
    try {
      const quote = await yahoo.fetchYahooCryptoQuote(pin.symbol);
      if (!quote || !(quote.price > 0)) continue;
      extras.push({
        id: pin.id,
        symbol: pin.symbol,
        name: pin.name,
        image: coinLogo(pin.symbol),
        rank: 90,
        price: quote.price,
        marketCap: 0,
        fdv: null,
        volume24h: 0,
        change1h: null,
        change24h: quote.changePct,
        change7d: quote.change7d ?? 0,
        sparkline7d: quote.sparkline7d ?? [],
        high24h: null,
        low24h: null,
        circulatingSupply: null,
        totalSupply: null,
        maxSupply: null,
        ath: null,
        athDate: null,
        atl: null,
        atlDate: null,
      });
    } catch (err) {
      console.error(`[crypto-source] pinned ${pin.symbol} lookup failed:`, err);
    }
  }
  return extras.length ? mergeByRank([coins, extras]) : coins;
}

/**
 * Swyftx only sparks the top handful of coins and writes 0 for everyone else.
 * When that leaves the 7-day column flat, fill it from CoinGecko sparklines
 * (or CoinGecko's own 7-day percentage) matched by symbol.
 */
async function hydrateSevenDay(coins: CoinMarket[]): Promise<CoinMarket[]> {
  const primed = coins.map((c) => {
    const pct = resolveSevenDayChange(c.change7d, c.sparkline7d);
    return pct == null ? c : { ...c, change7d: pct };
  });
  if (!sevenDayBoardIsMissing(primed)) return primed;
  try {
    const cg = await coingecko.fetchTop500();
    const merged = mergeSevenDayChanges(primed, cg);
    const filled = merged.filter((c) => resolveSevenDayChange(c.change7d, c.sparkline7d) != null).length;
    console.log(`[crypto-source] 7-day backfill ${filled}/${merged.length} coins via CoinGecko`);
    return merged;
  } catch (err) {
    console.error("[crypto-source] 7-day backfill failed:", err);
    return primed;
  }
}

function tagSource(rows: CoinMarket[], source: string): CoinMarket[] {
  return rows.map((row) => ({ ...row, source: row.source || source }));
}

function hideSwyftxRows(rows: CoinMarket[]): CoinMarket[] {
  if (swyftxPublicDisplay()) return rows;
  return rows.filter((row) => row.source !== "swyftx");
}

export async function getTop500(): Promise<CoinMarket[]> {
  const parts: CoinMarket[][] = [];

  try {
    const coins = await coingecko.fetchTop500();
    if (coins && coins.length > 0) {
      console.log(`[crypto-source] top500 via CoinGecko (${coins.length})`);
      const tagged = tagSource(coins, "coingecko");
      if (tagged.length >= MIN_CRYPTO_UNIVERSE) return hydrateSevenDay(await ensurePinnedCoins(tagged));
      parts.push(tagged);
    } else {
      throw new Error("CoinGecko returned an empty market list");
    }
  } catch (err) {
    console.error("[crypto-source] CoinGecko top500 failed:", err instanceof Error ? err.message.slice(0, 160) : "failed");
  }

  if (swyftxPublicDisplay() && mergeByRank(parts).length < MIN_CRYPTO_UNIVERSE) {
    try {
      const coins = await swyftx.fetchTop500();
      if (coins && coins.length > 0) {
        console.log(`[crypto-source] top500 backup list (${coins.length})`);
        parts.push(tagSource(coins, "swyftx"));
      }
    } catch (err) {
      console.error("[crypto-source] backup top500 failed:", err instanceof Error ? err.message.slice(0, 160) : "failed");
    }
  }

  if (mergeByRank(parts).length < MIN_CRYPTO_UNIVERSE) {
    const y = await yahoo.fetchYahooMajorMarkets();
    if (y.length) {
      console.log(`[crypto-source] topping up via Yahoo major (${y.length})`);
      parts.push(tagSource(y, "yahoo"));
    }
  }

  const merged = hideSwyftxRows(mergeByRank(parts));
  if (!merged.length) throw new Error("All crypto market sources failed");
  console.log(`[crypto-source] crypto universe → ${merged.length} coins`);
  return hydrateSevenDay(await ensurePinnedCoins(merged));
}

const LIST_FRESH_MS = 60_000;
const LIST_MAX_AGE_MS = 5 * 60 * 1000;
const LIST_BACKOFF_MS = 60_000;
const LIST_COLD_MS = 3_000;

let listSnap: { at: number; page: RankedCryptoPage } | null = null;
let listInflight: Promise<RankedCryptoPage> | null = null;
let listBackoffUntil = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pageFrom(
  coins: CoinMarket[],
  reason: "page2" | "backup" | "short" | "saved" | null,
  asOf: string | null = null
): RankedCryptoPage {
  const capped = hideSwyftxRows(coins).slice(0, 400);
  const label = asOf ? formatDisplayDateTime(asOf) : "";
  return {
    coins: capped,
    notice: noticeWithAsOf(listedMarketNotice(capped.length, reason), label === "—" ? null : label),
  };
}

function liveCoins(page: RankedCryptoPage | null | undefined): CoinMarket[] {
  return (page?.coins || []).filter(coinHasLivePrice);
}

/**
 * Top 400 for the Crypto tab and the Koins sweep.
 * CoinGecko pages 1 and 2 by market cap. When that list is short and
 * SWYFTX_PUBLIC_DISPLAY is on, the backup list fills symbols that are not
 * already present. A saved CoinGecko list is next. Yahoo is used only when no saved list exists.
 * Kraken and Coinbase quote one symbol. They do not replace this list.
 * A snapshot younger than 60 seconds is returned as-is. A failed refresh waits 60 seconds.
 * Old rows are not appended to a shorter live result.
 *
 * pull-check:retest4-2026-10-11
 */
async function buildTopList(): Promise<RankedCryptoPage> {
  const started = Date.now();
  const showSwyftx = swyftxPublicDisplay();
  let sxRows: CoinMarket[] | null = showSwyftx ? null : [];
  const sxTask = showSwyftx
    ? swyftx
        .fetchRankedMarkets(400)
        .then((rows) => {
          const tagged = tagSource(rows, "swyftx");
          sxRows = tagged;
          return tagged;
        })
        .catch((err) => {
          console.error("[crypto-source] ranked backup list failed:", err instanceof Error ? err.message.slice(0, 160) : "failed");
          sxRows = [];
          return [] as CoinMarket[];
        })
    : Promise.resolve([] as CoinMarket[]);

  const pendingCg = coingecko.fetchTop400();
  let cgPage: RankedCryptoPage | null = null;
  try {
    cgPage = await Promise.race([pendingCg, sleep(LIST_COLD_MS).then(() => null)]);
    if (!cgPage?.coins.length) cgPage = (await pendingCg) ?? coingecko.peekTop400();
  } catch (err) {
    console.error("[crypto-source] CoinGecko top list failed:", err instanceof Error ? err.message.slice(0, 160) : "failed");
    listBackoffUntil = Date.now() + LIST_BACKOFF_MS;
    cgPage = coingecko.peekTop400();
  }

  const peeked = cgPage ?? coingecko.peekTop400();
  const cgCoins = tagSource(liveCoins(peeked), "coingecko");
  const left = LIST_COLD_MS - (Date.now() - started);
  if (sxRows == null && left > 100) await Promise.race([sxTask, sleep(Math.max(0, left))]);
  const sx = sxRows ?? [];
  let savedRows: CoinMarket[] = [];
  let savedAt: string | null = null;
  if (!cgCoins.length) {
    const saved = await readCryptoSnapshot();
    if (saved?.coins.length) {
      savedRows = tagSource(saved.coins, "coingecko");
      savedAt = saved.at;
    }
  }
  let yahooRows: CoinMarket[] = [];
  if (!cgCoins.length && !sx.length && !savedRows.length) {
    try {
      yahooRows = tagSource(
        await Promise.race([yahoo.fetchYahooMajorMarkets(), sleep(1_000).then(() => [] as CoinMarket[])]),
        "yahoo"
      );
    } catch (err) {
      console.error("[crypto-source] Yahoo crypto list failed:", err instanceof Error ? err.message.slice(0, 160) : "failed");
      yahooRows = [];
    }
  }
  const page2Missed = (peeked?.notice || "").includes("second page");
  const selected = selectListedMarkets({
    coingecko: cgCoins,
    page2Missing: page2Missed,
    backup: sx,
    saved: savedRows,
    yahoo: yahooRows,
  });
  if (!selected.coins.length) {
    listBackoffUntil = Date.now() + LIST_BACKOFF_MS;
    throw new Error(LIVE_CRYPTO_UNAVAILABLE);
  }
  const asOf = selected.reason === "saved" ? savedAt : latestQuotedAt(selected.coins);
  const page = pageFrom(selected.coins, selected.reason, asOf);
  listSnap = { at: Date.now(), page };
  if (snapshotWorthSaving(tagSource(selected.coins, selected.reason === "saved" ? "coingecko" : cgCoins.length ? "coingecko" : ""))) {
    await persistCryptoSnapshot(tagSource(selected.coins, "coingecko"), asOf || new Date().toISOString());
  }
  void Promise.all([sxTask, pendingCg.catch(() => null)]).then(() => {
    const doneCg = tagSource(liveCoins(coingecko.peekTop400()), "coingecko");
    if (!doneCg.length) return;
    const done = selectListedMarkets({
      coingecko: doneCg,
      page2Missing: (coingecko.peekTop400()?.notice || "").includes("second page"),
      backup: sxRows ?? [],
      saved: [],
      yahoo: [],
    });
    if (!done.coins.length) return;
    const doneAt = latestQuotedAt(done.coins);
    listSnap = { at: Date.now(), page: pageFrom(done.coins, done.reason, doneAt) };
    if (snapshotWorthSaving(tagSource(done.coins, "coingecko"))) {
      void persistCryptoSnapshot(tagSource(done.coins, "coingecko"), doneAt || new Date().toISOString());
    }
  });
  return page;
}

function latestQuotedAt(coins: CoinMarket[]): string | null {
  let best = 0;
  let iso: string | null = null;
  for (const coin of coins) {
    const at = Date.parse(coin.quotedAt || "");
    if (Number.isFinite(at) && at >= best) {
      best = at;
      iso = coin.quotedAt || null;
    }
  }
  return iso;
}

function releasePage(page: RankedCryptoPage): RankedCryptoPage {
  if (swyftxPublicDisplay()) return page;
  const coins = page.coins.filter((coin) => coin.source !== "swyftx");
  if (coins.length === page.coins.length) return page;
  return pageFrom(coins, coins.length >= 400 ? null : "short");
}

async function warmSavedList(): Promise<RankedCryptoPage | null> {
  const saved = await readCryptoSnapshot();
  if (!saved?.coins.length) return null;
  const page = pageFrom(tagSource(saved.coins, "coingecko"), "saved", saved.at);
  listSnap = { at: Date.now(), page };
  return page;
}

export async function loadTop400Markets(): Promise<RankedCryptoPage> {
  const now = Date.now();
  if (!listSnap) {
    const warmed = await warmSavedList();
    if (warmed?.coins.length) {
      if (!listInflight) {
        listInflight = buildTopList().finally(() => {
          listInflight = null;
        });
      }
      void listInflight.catch((err) => {
        listBackoffUntil = Date.now() + LIST_BACKOFF_MS;
        console.error("[crypto-source] background crypto list failed:", err instanceof Error ? err.message.slice(0, 160) : "failed");
      });
      return releasePage(warmed);
    }
  }
  if (listSnap && now - listSnap.at < LIST_FRESH_MS) return releasePage(listSnap.page);
  if (listSnap && listSnap.page.coins.length >= 100 && (now < listBackoffUntil || now - listSnap.at >= LIST_FRESH_MS)) {
    if (now - listSnap.at >= LIST_FRESH_MS && now >= listBackoffUntil) {
      if (!listInflight) {
        listInflight = buildTopList().finally(() => {
          listInflight = null;
        });
      }
      void listInflight.catch((err) => {
        listBackoffUntil = Date.now() + LIST_BACKOFF_MS;
        console.error("[crypto-source] background crypto list failed:", err instanceof Error ? err.message.slice(0, 160) : "failed");
      });
    }
    return releasePage(listSnap.page);
  }
  if (!listSnap && now < listBackoffUntil) throw new Error(LIVE_CRYPTO_UNAVAILABLE);
  if (!listInflight) {
    listInflight = buildTopList().finally(() => {
      listInflight = null;
    });
  }
  const pending = listInflight;
  if (listSnap && listSnap.page.coins.length) {
    void pending.catch((err) => {
      listBackoffUntil = Date.now() + LIST_BACKOFF_MS;
      console.error("[crypto-source] background crypto list failed:", err instanceof Error ? err.message.slice(0, 160) : "failed");
    });
    return releasePage(listSnap.page);
  }
  try {
    const raced = await Promise.race([pending, sleep(LIST_COLD_MS).then(() => null)]);
    if (raced?.coins.length) return releasePage(raced);
  } catch (err) {
    listBackoffUntil = Date.now() + LIST_BACKOFF_MS;
    console.error("[crypto-source] crypto list failed:", err instanceof Error ? err.message.slice(0, 160) : "failed");
  }
  if (listSnap && listSnap.page.coins.length) return releasePage(listSnap.page);
  const peeked = coingecko.peekTop400();
  if (peeked && liveCoins(peeked).length) return pageFrom(liveCoins(peeked), "short", latestQuotedAt(liveCoins(peeked)));
  const saved = await readCryptoSnapshot();
  if (saved?.coins.length) return pageFrom(tagSource(saved.coins, "coingecko"), "saved", saved.at);
  throw new Error(LIVE_CRYPTO_UNAVAILABLE);
}

function presentDetail(detail: CoinDetail, source: string): CoinDetail {
  return {
    ...detail,
    source,
    sourceLine: publicCoinSourceLine(source),
    description: publicCoinDescription(detail.description),
  };
}

export async function getCoinDetail(id: string): Promise<CoinDetail> {
  const code = normalizeCryptoTicker(id);
  try {
    return presentDetail(await coingecko.fetchCoinDetail(toCgId(id)), "coingecko");
  } catch (err) {
    console.error(`[crypto-source] CoinGecko detail(${id}) failed:`, err instanceof Error ? err.message.slice(0, 160) : "failed");
  }
  if (swyftxPublicDisplay()) {
    try {
      return presentDetail(await swyftx.fetchCoinDetail(code), "swyftx");
    } catch (err) {
      console.error(`[crypto-source] detail backup(${id}) failed:`, err instanceof Error ? err.message.slice(0, 160) : "failed");
    }
  }
  return presentDetail(await yahoo.fetchYahooCoinDetail(id), "yahoo");
}

export async function getCoinChart(id: string, days: string): Promise<CoinChart> {
  const code = normalizeCryptoTicker(id);
  try {
    const chart = await coingecko.fetchCoinChart(toCgId(id), days);
    if (chart.prices.length > 0) return chart;
    throw new Error("CoinGecko returned an empty chart series");
  } catch (err) {
    console.error(`[crypto-source] CoinGecko chart(${id}) failed:`, err instanceof Error ? err.message.slice(0, 160) : "failed");
  }
  if (swyftxPublicDisplay()) {
    try {
      const chart = await swyftx.fetchCoinChart(code, days);
      if (chart.prices.length > 0) return chart;
      throw new Error("backup chart returned an empty series");
    } catch (err) {
      console.error(`[crypto-source] chart backup(${id}) failed:`, err instanceof Error ? err.message.slice(0, 160) : "failed");
    }
  }
  return yahoo.fetchYahooCoinChart(id, days);
}
