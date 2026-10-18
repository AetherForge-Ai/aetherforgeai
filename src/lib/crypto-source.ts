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

import { keepAlive } from "@/lib/keep-alive.server";
import { flushCryptoAttempt, recordCryptoAttempt } from "@/lib/crypto-attempts";
import { ensureCoinDepth } from "@/lib/crypto-depth.server";
import { mergeCoinDepth, pageDepthComplete } from "@/lib/crypto-depth-record";
import { tickerForCoingeckoId } from "@/lib/crypto-ids";
import { withTimeout } from "@/lib/with-timeout";
import "server-only";
import * as swyftx from "@/lib/crypto-swyftx";
import * as coingecko from "@/lib/crypto-coingecko";
import * as yahoo from "@/lib/crypto-yahoo";
import {
  applyStatDonors,
  coinHasLivePrice,
  coinLogo,
  detailFromMarket,
  LIVE_CRYPTO_UNAVAILABLE,
  marketStatsMissing,
  mergeSevenDayChanges,
  overlayCoinDetail,
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
  // b41 H-1: every fresh list goes to the store, which decides: replace, merge the rows that pass the
  // per-row checks, or refuse with a logged reason. Gating on "verified" here meant a fallback list
  // never reached the b38 partial-refresh path, so the snapshot froze while a source answered.
  if (selected.reason !== "saved" && selected.coins.length) {
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

/**
 * Signed-in and public Crypto tabs read the same persisted snapshot.
 * An empty snapshot is seeded from keyless sources before this returns.
 * A stored list is served with its timestamp. wrangler.jsonc has no cron.
 *
 * pull-check:v3-tier1a-2026-10-12
 * pull-check:v3-crypto-seed-2026-10-12
 */
/** Fill empty cap, volume, range, supply and ATH from the keyless lists. Does not write the snapshot. */
export async function enrichListedCoins(coins: CoinMarket[]): Promise<CoinMarket[]> {
  if (!coins.length || !coins.some(marketStatsMissing)) return coins;
  try {
    const { loadKeylessStatDonors } = await import("@/lib/crypto-keyless-seed");
    const donors = await loadKeylessStatDonors();
    if (!donors.length) return coins;
    return applyStatDonors(coins, donors);
  } catch (err) {
    console.error("[crypto-source] stat fill failed:", err instanceof Error ? err.message.slice(0, 120) : "failed");
    return coins;
  }
}

const AWAIT_LIST_UPGRADE_MS = 8_000;

function storedListNeedsUpgrade(coins: { source?: string | null }[]): boolean {
  if (!coins.length) return false;
  if (coins.length < 300) return true;
  return coins.every((coin) => (coin.source || "") === "yahoo");
}

export const CRYPTO_REQUEST_REFRESH_MS = 5 * 60 * 1000;
let cryptoRequestRefresh: Promise<void> | null = null;
export function cryptoListOlderThan(at: string | null | undefined, ms: number, now = Date.now()): boolean {
  const t = at ? Date.parse(at) : NaN;
  return Number.isFinite(t) && now - t > ms;
}

export async function loadTop400Markets(): Promise<RankedCryptoPage> {
  const { readSharedCryptoBoard, upgradeStoredCryptoBoard, refreshMarketSnapshotsNow } = await import("@/lib/crypto-board-store");
  const board = await readSharedCryptoBoard({ seed: false });
  // Goal b18: refresh on request once the list is older than 5 minutes; one refresh
  // at a time per isolate (single flight), and the reader waits at most 1.5 s.
  if (board.coins.length && (board.delayed || cryptoListOlderThan(board.at, CRYPTO_REQUEST_REFRESH_MS))) {
    if (!cryptoRequestRefresh) {
      cryptoRequestRefresh = refreshMarketSnapshotsNow()
        // b24 G-05: the crypto-list attempt is recorded inside the seed as soon as the list is saved.
        .then(() => undefined)
        .catch((err) => {
          recordCryptoAttempt(false, err);
        })
        .finally(() => {
          cryptoRequestRefresh = null;
        });
      // b24 G-05: /api/crypto/markets is the list's real data path. Keep the refresh alive
      // past the response (Workers cancel detached promises) and log which way it ran.
      const how = await keepAlive(cryptoRequestRefresh.then(() => flushCryptoAttempt(2_000)));
      console.log(`[crypto-list] refresh started (age>${Math.round(CRYPTO_REQUEST_REFRESH_MS / 60000)}m, ${how})`);
    }
    await Promise.race([
      cryptoRequestRefresh,
      new Promise<void>((resolve) => setTimeout(resolve, 1_500)),
    ]);
    await flushCryptoAttempt();
    const fresh = await readSharedCryptoBoard({ seed: false });
    if (fresh.coins.length) {
      return {
        coins: fresh.coins.slice(0, 400),
        notice: fresh.notice,
        at: fresh.at,
        version: fresh.version,
      };
    }
  }
  if (board.coins.length) {
    if (storedListNeedsUpgrade(board.coins)) {
      void upgradeStoredCryptoBoard(AWAIT_LIST_UPGRADE_MS).catch(() => undefined);
    }
    return {
      coins: board.coins.slice(0, 400),
      notice: board.notice,
      at: board.at,
      version: board.version,
    };
  }
  await upgradeStoredCryptoBoard(AWAIT_LIST_UPGRADE_MS);
  const again = await readSharedCryptoBoard({ seed: false });
  return {
    coins: again.coins.slice(0, 400),
    notice: again.notice,
    at: again.at,
    version: again.version,
  };
}

function presentDetail(detail: CoinDetail, source: string): CoinDetail {
  return {
    ...detail,
    source,
    sourceLine: publicCoinSourceLine(source),
    description: publicCoinDescription(detail.description),
  };
}

async function listedCoinForDetail(id: string, code: string): Promise<CoinMarket | null> {
  try {
    const { readCryptoSnapshot } = await import("@/lib/crypto-snapshot");
    const saved = await withTimeout(() => readCryptoSnapshot(), 1_200, null);
    const slug = id.trim().toLowerCase();
    const symbol = (tickerForCoingeckoId(slug) || code).toUpperCase();
    const coin = saved?.coins.find((row) => row.id === slug || row.symbol.toUpperCase() === symbol) ?? null;
    if (!coin) return null;
    const [enriched] = await withTimeout(() => enrichListedCoins([coin]), 800, [coin]);
    return enriched ?? coin;
  } catch (err) {
    console.error("[crypto-source] snapshot detail failed:", err instanceof Error ? err.message.slice(0, 120) : "failed");
    return null;
  }
}

export async function getCoinDetail(id: string): Promise<CoinDetail> {
  const code = normalizeCryptoTicker(id);
  const slug = toCgId(id);
  let detail: CoinDetail | null = null;
  let source = "coingecko";
  try {
    // The heavy /coins/{id} document is often rate-limited for tether. Do not
    // spend the whole request on it — the markets row and CoinPaprika still
    // carry cap, volume, supply, 1h and 30d.
    detail = await withTimeout(() => coingecko.fetchCoinDetail(slug), 2_000, null);
    if (detail) source = "coingecko";
  } catch (err) {
    console.error(`[crypto-source] CoinGecko detail(${id}) failed:`, err instanceof Error ? err.message.slice(0, 160) : "failed");
  }
  if (!detail && swyftxPublicDisplay()) {
    try {
      detail = await withTimeout(() => swyftx.fetchCoinDetail(code), 1_200, null);
      if (detail) source = "swyftx";
    } catch (err) {
      console.error(`[crypto-source] detail backup(${id}) failed:`, err instanceof Error ? err.message.slice(0, 160) : "failed");
    }
  }
  if (!detail) {
    try {
      detail = await withTimeout(() => yahoo.fetchYahooCoinDetail(slug), 1_200, null);
      if (detail) source = "yahoo";
    } catch (err) {
      console.error(`[crypto-source] Yahoo detail(${id}) failed:`, err instanceof Error ? err.message.slice(0, 160) : "failed");
    }
  }
  const listed = await listedCoinForDetail(slug, code);
  const listedSource = (listed?.source || "").trim().toLowerCase();
  const pageSource = listed && listed.price > 0 ? listedSource || source : source || listedSource;
  const overlaid = detail ? overlayCoinDetail({ ...detail, source }, listed) : listed ? detailFromMarket(listed) : null;
  if (overlaid && listed && listed.price > 0 && !(overlaid.price > 0)) overlaid.price = listed.price;
  const live = overlaid ? { ...overlaid, id: overlaid.id || slug, source: overlaid.source || pageSource } : null;
  const ensured = await ensureCoinDepth({
    slug,
    listed,
    live,
    budgetMs: live && pageDepthComplete(live) ? 0 : 2_200,
  });
  const merged = mergeCoinDepth(live, ensured) ?? ensured;
  return presentDetail(merged, merged.source || pageSource || source);
}

async function paprikaChart(id: string, symbol: string, days: string): Promise<CoinChart | null> {
  const { chartFromPaprikaHistory } = await import("@/lib/crypto-paprika");
  const hours = days === "1" ? 30 : days === "7" ? 24 * 8 : 24 * 14;
  const start = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  let paprikaId = id.includes("-") ? id : "";
  if (!paprikaId && symbol) {
    try {
      const res = await fetch(
        `https://api.coinpaprika.com/v1/search?q=${encodeURIComponent(symbol)}&c=currencies&modifier=symbol&limit=5`,
        { headers: { accept: "application/json" }, signal: AbortSignal.timeout(800) }
      );
      if (res.ok) {
        const body = (await res.json()) as { currencies?: Array<{ id?: string; symbol?: string }> };
        paprikaId = String(body.currencies?.find((row) => String(row.symbol || "").toUpperCase() === symbol)?.id || "");
      }
    } catch {
      paprikaId = "";
    }
  }
  if (!paprikaId) return null;
  const interval = days === "1" ? "1h" : "1d";
  try {
    const res = await fetch(
      `https://api.coinpaprika.com/v1/tickers/${encodeURIComponent(paprikaId)}/historical?start=${encodeURIComponent(start)}&interval=${interval}`,
      { headers: { accept: "application/json" }, signal: AbortSignal.timeout(1200) }
    );
    if (!res.ok) return null;
    const chart = chartFromPaprikaHistory(await res.json());
    return chart.prices.length > 1 ? chart : null;
  } catch (err) {
    console.error(`[crypto-source] CoinPaprika chart(${id}) failed:`, err instanceof Error ? err.message.slice(0, 120) : "failed");
    return null;
  }
}

export async function getCoinChart(id: string, days: string): Promise<CoinChart> {
  const code = normalizeCryptoTicker(id);
  let listedSource = "";
  try {
    const { readSharedCryptoBoard } = await import("@/lib/crypto-board-store");
    const board = await readSharedCryptoBoard({ seed: false });
    const slug = id.trim().toLowerCase();
    const listed = board.coins.find((row) => row.id === slug || row.symbol.toUpperCase() === code.toUpperCase());
    listedSource = (listed?.source || "").toLowerCase();
    if (listedSource === "coinpaprika") {
      const chart = await paprikaChart(listed?.paprikaId || id, listed?.symbol || code, days);
      if (chart && chart.prices.length > 1) return chart;
    }
  } catch (err) {
    console.error(`[crypto-source] chart source lookup failed:`, err instanceof Error ? err.message.slice(0, 120) : "failed");
  }
  try {
    const chart = await coingecko.fetchCoinChart(toCgId(id), days);
    if (chart.prices.length > 0) return chart;
    throw new Error("CoinGecko returned an empty chart series");
  } catch (err) {
    console.error(`[crypto-source] CoinGecko chart(${id}) failed:`, err instanceof Error ? err.message.slice(0, 160) : "failed");
  }
  const paprika = await paprikaChart(id, code, days);
  if (paprika && paprika.prices.length > 1) return paprika;
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
