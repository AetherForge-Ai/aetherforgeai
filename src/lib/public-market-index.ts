import "server-only";

import { fetchDexTop400 } from "@/lib/crypto-coingecko";
import { choosePublicPriceTab, formatPublicCryptoPrice, sourceLabel } from "@/lib/crypto-price-chain";
import { publicSourceAllowed } from "@/lib/swyftx-display";
import { loadPublicCryptoPrint, noteListedPrices, recallPublicTab, rememberPublicTab } from "@/lib/crypto-price-feed";
import { loadTop400Markets } from "@/lib/crypto-source";
import { formatDisplayDateTime, formatSignedPercent, formatUnitPrice } from "@/lib/currency";
import { PUBLIC_SEED_ROWS, type PublicMarketIndex, type PublicPriceRow, type PublicPriceTab } from "@/lib/public-market-types";
import { boardCoverage, pageListings } from "@/lib/stock-catalog";
import { loadSavedQuoteLine, loadStockBoardPage } from "@/lib/stock-board.server";
import { PRICE_NOT_IN_RESPONSE, type StockBoard } from "@/lib/stock-markets";

const COIN_PAGE = PUBLIC_SEED_ROWS;
/** Cold /markets waits this long, then says the price is not in the response. */
const EQUITY_BUDGET_MS = 3000;
const ALT_BUDGET_MS = 3000;
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
  if (!iso) return "as of not stated by the vendor";
  const wall = formatDisplayDateTime(iso);
  return wall === "—" ? "as of not stated by the vendor" : `as of ${wall}`;
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
    page = await loadStockBoardPage(board, { page: 1, waitMs: 2_000 });
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

async function loadCryptoTab(): Promise<PublicPriceTab> {
  try {
    const page = await loadTop400Markets();
    const coins = page.coins.filter((coin) => coin.price > 0).slice(0, COIN_PAGE);
    const quotedAt = latestIso(coins.map((coin) => coin.quotedAt)) || new Date().toISOString();
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
    const rows = coins.map((coin) => ({
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
    }));
    const tab = {
      id: "CRYPTO",
      title: "Crypto",
      asOf: asOfLabel(latestIso(coins.map((coin) => coin.quotedAt))),
      rows,
    };
    if (rows.length) rememberPublicTab(tab);
    return choosePublicPriceTab(tab, recallPublicTab("CRYPTO"));
  } catch (err) {
    console.error("[public-market] crypto tab failed:", err instanceof Error ? err.message.slice(0, 160) : "failed");
    return choosePublicPriceTab(
      { id: "CRYPTO", title: "Crypto", asOf: "as of not stated by the vendor", rows: [] },
      recallPublicTab("CRYPTO")
    );
  }
}

async function loadDexTab(): Promise<PublicPriceTab> {
  try {
    const page = await fetchDexTop400();
    const priced = page.rows
      .filter((row) => typeof row.price === "number" && row.price > 0 && row.detailId)
      .slice(0, COIN_PAGE);
    const quotedAt = new Date().toISOString();
    noteListedPrices(
      priced.map((row) => ({
        symbol: row.symbol,
        id: row.detailId,
        price: row.price as number,
        quotedAt,
        source: "geckoterminal",
      }))
    );
    const rows = priced.map((row) => ({
      symbol: row.symbol,
      name: row.name,
      price: formatUnitPrice(row.price as number, "USD"),
      change: "change not stated",
      href: `/markets/crypto/${encodeURIComponent(row.detailId as string)}`,
      usd: row.price as number,
      quoteId: row.detailId as string,
      source: shownSource("geckoterminal", "geckoterminal"),
      asOf: asOfLabel(quotedAt),
    }));
    const tab = {
      id: "DEX",
      title: "DEX",
      asOf: "as of not stated by the vendor",
      rows,
    };
    if (rows.length) rememberPublicTab(tab);
    return choosePublicPriceTab(tab, recallPublicTab("DEX"));
  } catch (err) {
    console.error("[public-market] DEX tab failed:", err instanceof Error ? err.message.slice(0, 160) : "failed");
    return choosePublicPriceTab(
      { id: "DEX", title: "DEX", asOf: "as of not stated by the vendor", rows: [] },
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
    asOf: "as of not stated by the vendor",
    coverage: coverage.line,
    note: coverage.note,
    footnote: page.rows.length
      ? `${Math.min(PUBLIC_SEED_ROWS, page.rows.length)} listings have no price in this response`
      : undefined,
    asOf: "as of not stated by the vendor",
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
    within(loadCryptoTab(), { id: "CRYPTO", title: "Crypto", asOf: "as of not stated by the vendor", rows: [] }, ALT_BUDGET_MS)
      .catch(() => ({
        id: "CRYPTO",
        title: "Crypto",
        asOf: "as of not stated by the vendor",
        rows: [] as PublicPriceRow[],
      }))
      .then((tab) => choosePublicPriceTab(tab, recallPublicTab("CRYPTO"))),
    within(loadDexTab(), { id: "DEX", title: "DEX", asOf: "as of not stated by the vendor", rows: [] }, ALT_BUDGET_MS)
      .catch(() => ({
        id: "DEX",
        title: "DEX",
        asOf: "as of not stated by the vendor",
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
      { id: "NZX", title: "NZX", asOf: "as of not stated by the vendor", rows: [] },
      { id: "ASX", title: "ASX", asOf: "as of not stated by the vendor", rows: [] },
      { id: "DOW", title: "Dow Jones", asOf: "as of not stated by the vendor", rows: [] },
      { id: "NASDAQ", title: "NASDAQ", asOf: "as of not stated by the vendor", rows: [] },
      { id: "NYSE", title: "NYSE", asOf: "as of not stated by the vendor", rows: [] },
      { id: "CRYPTO", title: "Crypto", asOf: "as of not stated by the vendor", rows: [] },
      { id: "DEX", title: "DEX", asOf: "as of not stated by the vendor", rows: [] },
    ],
    priceRowCount: 0,
  };
}

/** Keep a richer snapshot. A short timeout must not wipe a page that already had rows. */
function remember(value: PublicMarketIndex) {
  const now = Date.now();
  const keepExisting =
    value.priceRowCount <= 0 || (memo != null && value.priceRowCount < memo.value.priceRowCount);
  if (keepExisting) {
    if (memo && memo.value.priceRowCount > 0) nextRefreshAt = now + REFRESH_BACKOFF_MS;
    return;
  }
  memo = { at: now, value };
  nextRefreshAt = now + (stockTabsNeedQuotes(value) ? QUOTE_RETRY_MS : INDEX_TTL_MS);
}

function startBuild(): Promise<PublicMarketIndex> {
  if (!inflight) {
    inflight = buildIndex()
      .then((value) => {
        remember(value);
        return value;
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
export async function loadStockQuoteLine(ticker: string): Promise<string | null> {
  const key = ticker.trim().toUpperCase();
  const now = Date.now();
  const hit = quoteMemo.get(key);
  if (hit && now - hit.at < 5_000) return hit.value;
  const value = within(loadSavedQuoteLine(key), null, EQUITY_BUDGET_MS);
  quoteMemo.set(key, { at: now, value });
  return value;
}

/** One crypto ticker page. The last good price is labelled when every source fails. */
export async function loadCryptoQuoteLine(id: string): Promise<string | null> {
  const print = await loadPublicCryptoPrint(id);
  if (!print || !(print.price > 0)) return null;
  return formatPublicCryptoPrice(print) || null;
}
