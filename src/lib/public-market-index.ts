import "server-only";

import { coinDepthComplete, isDuplicateOrTokenisedCoin, isJunkCoin } from "@/lib/coin-junk";
import { MARKET_SNAPSHOT_TARGET, pricesAsAtLabel } from "@/lib/crypto-board";
import { choosePublicPriceTab, formatPublicCryptoPrice, sourceLabel } from "@/lib/crypto-price-chain";
import { publicSourceAllowed } from "@/lib/swyftx-display";
import { loadPublicCryptoPrint, noteListedPrices, recallPublicTab, rememberPublicTab } from "@/lib/crypto-price-feed";
import { loadTop400Markets } from "@/lib/crypto-source";
import { fmtCompactNum, resolveSevenDayChange } from "@/lib/crypto-market";
import { formatDisplayDateTime, formatSignedPercent, formatUnitPrice } from "@/lib/currency";
import { PUBLIC_SEED_ROWS, type PublicMarketIndex, type PublicPriceRow, type PublicPriceTab } from "@/lib/public-market-types";
import { boardCoverage, pageListings } from "@/lib/stock-catalog";
import { loadSavedQuoteLine, loadStockBoardPage } from "@/lib/stock-board.server";
import { PRICE_NOT_IN_RESPONSE, unpricedFootnote, type StockBoard } from "@/lib/stock-markets";

/** Crypto and DEX pages embed the shared snapshot, the same list the signed-in tab reads. */
const COIN_PAGE = MARKET_SNAPSHOT_TARGET;
/** Rows embedded in the document. The client list still loads the full snapshot. */
const DOCUMENT_ROWS = PUBLIC_SEED_ROWS;
/** Cold /markets waits this long, then says the price is not in the response. */
const EQUITY_BUDGET_MS = 3000;
const ALT_BUDGET_MS = 3000;
/** Page cap for the DEX tab. Just above the 1.5s refresh wait so a pause banner can return. */
const DEX_BUDGET_MS = 1_800;
const INDEX_TTL_MS = 5 * 60 * 1000;
/** After a refresh that keeps the previous snapshot, wait before trying again. */
const REFRESH_BACKOFF_MS = 60 * 1000;
/** Names are on the page. Try the price calls again soon when this response has no print. */
const QUOTE_RETRY_MS = 15 * 1000;

const BOARD_TITLE: Record<StockBoard, string> = {
  NZX: "NZX",
  ASX: "ASX",
  DOW: "Dow Jones",
  NASDAQ: "NASDAQ",
  NYSE: "NYSE",
};

function shownSource(source: string | undefined, fallback: string): string {
  const id = (source || fallback).trim().toLowerCase();
  if (!id || !publicSourceAllowed(id)) return "public market data";
  return sourceLabel(id);
}

function asOfLabel(iso: string | null): string {
  if (!iso) return "time not given by the data provider";
  const wall = formatDisplayDateTime(iso);
  return wall === "—" ? "time not given by the data provider" : `as of ${wall}`;
}

function latestIso(values: Array<string | null | undefined>): string | null {
  let best = 0;
  let iso: string | null = null;
  for (const value of values) {
    if (!value) continue;
    const at = new Date(value).getTime();
    if (Number.isFinite(at) && at > best) {
      best = at;
      iso = value;
    }
  }
  return iso;
}

async function within<T>(work: Promise<T>, fallback: T, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function loadEquityTab(board: StockBoard): Promise<PublicPriceTab> {
  let page;
  try {
    page = await loadStockBoardPage(board, { page: 1, waitMs: 1_200, rowLimit: PUBLIC_SEED_ROWS });
  } catch (err) {
    console.error(`[public-market-index] ${board} board failed:`, err);
    return equityFallback(board);
  }
  const rows: PublicPriceRow[] = page.rows.slice(0, PUBLIC_SEED_ROWS).map((row) => ({
    symbol: row.symbol,
    name: row.name,
    price: row.quoted ? row.priceLabel : PRICE_NOT_IN_RESPONSE,
    change: row.quoted ? row.changeLabel : "change not stated",
    href: `/markets/stock/${encodeURIComponent(row.ticker)}`,
    source: row.source || "",
    asOf: row.asOf,
    ...(row.quoted && row.price != null && row.price > 0
      ? {
          value: row.price,
          changePct: row.changePct ?? undefined,
          changeAbs: row.changeAbs ?? undefined,
          dayHigh: row.dayHigh ?? null,
          dayLow: row.dayLow ?? null,
        }
      : {}),
  }));
  return {
    id: board,
    title: page.label,
    asOf: page.asOf ? asOfLabel(page.asOf) : page.freshness,
    coverage: page.coverage,
    note: page.note,
    footnote: page.footnote || undefined,
    rows,
  };
}

type CryptoTabCoin = Awaited<ReturnType<typeof loadTop400Markets>>["coins"][number];
/** b37 H-1: one mapping for the live list and the stored snapshot. */
function cryptoRowsFromCoins(coins: CryptoTabCoin[], quotedAt: string): PublicPriceRow[] {
  return coins
    .filter((coin) => !isJunkCoin(coin.id, coin.name, coin.symbol))
    // Goal b12 G-17: no tokenised stocks or wrapped/bridged/staked duplicates, and
    // only coins whose page can show cap, volume, supply and 1h change.
    .filter((coin) => !isDuplicateOrTokenisedCoin(coin.id) && coinDepthComplete(coin))
    .slice(0, DOCUMENT_ROWS).map((coin) => ({
    symbol: coin.symbol,
    name: coin.name,
    price: formatUnitPrice(coin.price, "USD"),
    change: formatSignedPercent(coin.change24h),
    href: `/markets/crypto/${encodeURIComponent(coin.id)}`,
    usd: coin.price,
    changePct: coin.change24h,
    quoteId: coin.id,
    source: shownSource(coin.source, "coingecko"),
    asOf: asOfLabel(coin.quotedAt || quotedAt),
    blockchain: coin.blockchain || "",
    change1h: coin.change1h == null ? "—" : formatSignedPercent(coin.change1h),
    change7d: (() => {
      const week = resolveSevenDayChange(coin.change7d, coin.sparkline7d);
      return week == null ? "—" : formatSignedPercent(week);
    })(),
    supply: fmtCompactNum(coin.circulatingSupply),
  }));
}

/**
 * b37 H-1: /markets crypto tab had 0 rows on 4/127 loads (cold isolate, list read over budget).
 * The stored snapshot (the one /api/ticker serves) fills the tab instead of an empty table.
 */
async function cryptoTabFromSnapshot(): Promise<PublicPriceTab | null> {
  try {
    const { readCryptoSnapshot } = await import("@/lib/crypto-snapshot");
    const snap = await within(readCryptoSnapshot(1_500), null, 1_800);
    if (!snap?.coins.length) return null;
    const coins = snap.coins.filter((coin) => coin.price > 0).slice(0, COIN_PAGE) as CryptoTabCoin[];
    const rows = cryptoRowsFromCoins(coins, snap.at);
    if (!rows.length) return null;
    return { id: "CRYPTO", title: "Crypto", asOf: pricesAsAtLabel(snap.at) || asOfLabel(snap.at), rows };
  } catch {
    return null;
  }
}

let lastCryptoAsAt = "";

async function loadCryptoTab(): Promise<PublicPriceTab> {
  try {
    const page = await loadTop400Markets();
    let coins = page.coins.filter((coin) => coin.price > 0).slice(0, COIN_PAGE);
    const head = coins.slice(0, DOCUMENT_ROWS);
    if (head.some((coin) => coin.change1h == null || coin.circulatingSupply == null || resolveSevenDayChange(coin.change7d, coin.sparkline7d) == null)) {
      try {
        const { enrichListedCoins } = await import("@/lib/crypto-source");
        const filled = await within(enrichListedCoins(head), head, 800);
        const byId = new Map(filled.map((coin) => [coin.id, coin]));
        coins = coins.map((coin, index) => (index < filled.length ? byId.get(coin.id) ?? coin : coin));
      } catch {
        // The saved row stays. A missing figure is an em dash.
      }
    }
    const quotedAt = page.at || latestIso(coins.map((coin) => coin.quotedAt)) || new Date().toISOString();
    // b31 H-1: "Prices as at" never steps backwards on this server. An older list than one
    // already shown serves the remembered tab instead.
    if (lastCryptoAsAt && quotedAt < lastCryptoAsAt) {
      const kept = recallPublicTab("CRYPTO");
      if (kept?.rows.length) return kept;
    } else {
      lastCryptoAsAt = quotedAt;
    }
    noteListedPrices(
      coins.map((coin) => ({
        symbol: coin.symbol,
        id: coin.id,
        price: coin.price,
        changePct: coin.change24h,
        quotedAt: coin.quotedAt || quotedAt,
        source: coin.source || "coingecko",
      }))
    );
    const rows = cryptoRowsFromCoins(coins, quotedAt);
    const tab = {
      id: "CRYPTO",
      title: "Crypto",
      asOf: page.notice || pricesAsAtLabel(page.at || quotedAt) || asOfLabel(page.at || quotedAt),
      rows,
    };
    if (rows.length) rememberPublicTab(tab);
    return choosePublicPriceTab(tab, recallPublicTab("CRYPTO"));
  } catch (err) {
    console.error("[public-market] crypto tab failed:", err instanceof Error ? err.message.slice(0, 160) : "failed");
    return choosePublicPriceTab(
      { id: "CRYPTO", title: "Crypto", asOf: "time not given by the data provider", rows: [] },
      recallPublicTab("CRYPTO")
    );
  }
}

async function loadDexTab(): Promise<PublicPriceTab> {
  try {
    const { readSharedDexBoard } = await import("@/lib/crypto-board-store");
    const page = await readSharedDexBoard({ revalidate: true });
    const named = page.sources.find((source) => {
      const label = sourceLabel((source || "").toLowerCase());
      return !!label && !!page.notice && page.notice.includes(label);
    });
    const feed = (named || page.sources[0] || "").toLowerCase();
    const priced = page.rows
      .filter((row) => typeof row.price === "number" && row.price > 0 && row.detailId && row.network && row.dex)
      .filter((row) => !isJunkCoin(row.detailId, row.name, row.symbol))
      .filter((row) => !isDuplicateOrTokenisedCoin(row.detailId))
      // Goal b13 G-17: one row per token and chain (the list is already ordered by liquidity).
      .filter((row, index, all) => all.findIndex((other) => other.symbol?.toUpperCase() === row.symbol?.toUpperCase() && other.network === row.network) === index)
      .slice(0, COIN_PAGE);
    const quotedAt = page.at || new Date().toISOString();
    noteListedPrices(
      priced.map((row) => ({
        symbol: row.symbol,
        id: row.detailId,
        price: row.price as number,
        quotedAt,
        source: feed || "public market data",
      }))
    );
    const rows = priced.slice(0, DOCUMENT_ROWS).map((row) => ({
      symbol: row.symbol,
      name: row.name,
      price: formatUnitPrice(row.price as number, "USD"),
      // Goal b13 G-17: the DEX feed sends no 24h change; the column shows "—" (title explains) instead of text.
      change: "—",
      // Goal b13 G-17: DEX pool tokens have no cap/volume/supply from the source, so no coin page link.
      href: "",
      usd: row.price as number,
      quoteId: row.detailId as string,
      source: shownSource(feed, "") || "Public DEX data",
      asOf: asOfLabel(quotedAt),
      blockchain: row.network || "",
      dex: row.dex || "",
    }));
    const tab = {
      id: "DEX",
      title: "DEX",
      asOf: page.notice || pricesAsAtLabel(page.at) || asOfLabel(page.at),
      rows,
    };
    if (rows.length) rememberPublicTab(tab);
    return choosePublicPriceTab(tab, recallPublicTab("DEX"));
  } catch (err) {
    console.error("[public-market] DEX tab failed:", err instanceof Error ? err.message.slice(0, 160) : "failed");
    return choosePublicPriceTab(
      { id: "DEX", title: "DEX", asOf: "time not given by the data provider", rows: [] },
      recallPublicTab("DEX")
    );
  }
}

function equityFallback(id: StockBoard): PublicPriceTab {
  const coverage = boardCoverage(id);
  const page = pageListings(id, 1);
  return {
    id,
    title: BOARD_TITLE[id],
    asOf: "time not given by the data provider",
    coverage: coverage.line,
    note: coverage.note,
    footnote: unpricedFootnote(Math.min(PUBLIC_SEED_ROWS, page.rows.length)) ?? undefined,
    rows: [],
  };
}

function stockTabsNeedQuotes(value: PublicMarketIndex): boolean {
  return value.tabs.some(
    (tab) =>
      tab.id !== "CRYPTO" &&
      tab.id !== "DEX" &&
      tab.rows.length > 0 &&
      tab.rows.every((row) => !row.price || row.price === PRICE_NOT_IN_RESPONSE)
  );
}

async function buildIndex(): Promise<PublicMarketIndex> {
  const [nzx, asx, dow, nasdaq, nyse, crypto, dex] = await Promise.all([
    within(loadEquityTab("NZX"), equityFallback("NZX"), EQUITY_BUDGET_MS),
    within(loadEquityTab("ASX"), equityFallback("ASX"), EQUITY_BUDGET_MS),
    within(loadEquityTab("DOW"), equityFallback("DOW"), EQUITY_BUDGET_MS),
    within(loadEquityTab("NASDAQ"), equityFallback("NASDAQ"), EQUITY_BUDGET_MS),
    within(loadEquityTab("NYSE"), equityFallback("NYSE"), EQUITY_BUDGET_MS),
    within(loadCryptoTab(), { id: "CRYPTO", title: "Crypto", asOf: "time not given by the data provider", rows: [] }, ALT_BUDGET_MS)
      .catch(() => ({
        id: "CRYPTO",
        title: "Crypto",
        asOf: "time not given by the data provider",
        rows: [] as PublicPriceRow[],
      }))
      .then((tab) => choosePublicPriceTab(tab, recallPublicTab("CRYPTO")))
      .then(async (tab) => (tab.rows.length ? tab : (await cryptoTabFromSnapshot()) ?? tab)),
    within(loadDexTab(), { id: "DEX", title: "DEX", asOf: "time not given by the data provider", rows: [] }, DEX_BUDGET_MS)
      .catch(() => ({
        id: "DEX",
        title: "DEX",
        asOf: "time not given by the data provider",
        rows: [] as PublicPriceRow[],
      }))
      .then((tab) => choosePublicPriceTab(tab, recallPublicTab("DEX"))),
  ]);
  const tabs = [nzx, asx, dow, nasdaq, nyse, crypto, dex];
  return {
    tabs,
    priceRowCount: tabs.reduce((sum, tab) => sum + tab.rows.length, 0),
  };
}

let memo: { at: number; value: PublicMarketIndex } | null = null;
let inflight: Promise<PublicMarketIndex> | null = null;
/** Earliest time a warm snapshot may start another background refresh. */
let nextRefreshAt = 0;

function emptyIndex(): PublicMarketIndex {
  return {
    tabs: [
      { id: "NZX", title: "NZX", asOf: "time not given by the data provider", rows: [] },
      { id: "ASX", title: "ASX", asOf: "time not given by the data provider", rows: [] },
      { id: "DOW", title: "Dow Jones", asOf: "time not given by the data provider", rows: [] },
      { id: "NASDAQ", title: "NASDAQ", asOf: "time not given by the data provider", rows: [] },
      { id: "NYSE", title: "NYSE", asOf: "time not given by the data provider", rows: [] },
      { id: "CRYPTO", title: "Crypto", asOf: "time not given by the data provider", rows: [] },
      { id: "DEX", title: "DEX", asOf: "time not given by the data provider", rows: [] },
    ],
    priceRowCount: 0,
  };
}

/** Keep a richer snapshot. A short timeout must not wipe a page that already had rows. */
function remember(fresh: PublicMarketIndex) {
  const now = Date.now();
  // b37 H-1: a rebuild never empties one tab that had rows (the crypto tab went to 0 rows while the
  // equity tabs grew, so the total-count check accepted it).
  const value = mergeIndexTabs(fresh, memo?.value ?? null);
  const keepExisting =
    value.priceRowCount <= 0 || (memo != null && value.priceRowCount < memo.value.priceRowCount);
  if (keepExisting) {
    if (memo && memo.value.priceRowCount > 0) nextRefreshAt = now + REFRESH_BACKOFF_MS;
    return;
  }
  memo = { at: now, value };
  nextRefreshAt = now + (stockTabsNeedQuotes(value) ? QUOTE_RETRY_MS : INDEX_TTL_MS);
}

/** b37 H-1: keep each tab's previous rows when the rebuild came back empty for that tab. */
export function mergeIndexTabs(fresh: PublicMarketIndex, prev: PublicMarketIndex | null): PublicMarketIndex {
  if (!prev) return fresh;
  const tabs = fresh.tabs.map((tab) => {
    if (tab.rows.length) return tab;
    const old = prev.tabs.find((t) => t.id === tab.id);
    return old?.rows.length ? old : tab;
  });
  return { tabs, priceRowCount: tabs.reduce((sum, tab) => sum + tab.rows.length, 0) };
}

function startBuild(): Promise<PublicMarketIndex> {
  if (!inflight) {
    inflight = buildIndex()
      .then((value) => {
        remember(value);
        return mergeIndexTabs(value, memo?.value ?? null);
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/**
 * First page of each markets tab.
 * A warm snapshot is returned immediately. After it is older than the TTL,
 * the next read still returns it and refreshes in the background.
 * A refresh that keeps the old snapshot waits REFRESH_BACKOFF_MS before another try.
 * A cold read waits for the tab budget (EQUITY_BUDGET_MS). Empty tabs say the price is not in this response.
 */
export async function loadPublicMarketIndex(): Promise<PublicMarketIndex> {
  if (memo && memo.value.priceRowCount > 0) {
    if (Date.now() >= nextRefreshAt) void startBuild();
    return memo.value;
  }
  const value = await startBuild();
  return value.priceRowCount > 0 ? value : emptyIndex();
}

const quoteMemo = new Map<string, { at: number; value: Promise<string | null> }>();

/** One equity ticker page. The saved print is used when both providers fail. */
export async function loadStockQuoteLine(ticker: string, waitMs = EQUITY_BUDGET_MS): Promise<string | null> {
  const key = ticker.trim().toUpperCase();
  const now = Date.now();
  const hit = quoteMemo.get(key);
  if (hit && now - hit.at < 5_000) return hit.value;
  const value = within(loadSavedQuoteLine(key), null, waitMs);
  quoteMemo.set(key, { at: now, value });
  return value;
}

/** One crypto ticker page. The last good price is labelled when every source fails. */
export async function loadCryptoQuoteLine(id: string): Promise<string | null> {
  const print = await loadPublicCryptoPrint(id);
  if (!print || !(print.price > 0)) return null;
  return formatPublicCryptoPrice(print) || null;
}
