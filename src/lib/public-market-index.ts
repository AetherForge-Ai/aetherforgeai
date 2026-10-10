import "server-only";

import { fetchDexTop400 } from "@/lib/crypto-coingecko";
import { getCoinDetail, loadTop400Markets } from "@/lib/crypto-source";
import { formatDisplayDateTime, formatSignedPercent, formatUnitPrice } from "@/lib/currency";
import { MARKET_INDEX_PAGE, type PublicMarketIndex, type PublicPriceRow, type PublicPriceTab } from "@/lib/public-market-types";
import { boardCoverage, pageListings } from "@/lib/stock-catalog";
import { loadSavedQuoteLine, loadStockBoardPage } from "@/lib/stock-board.server";
import { PRICE_NOT_IN_RESPONSE, type StockBoard } from "@/lib/stock-markets";

const COIN_PAGE = 25;
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
  const rows: PublicPriceRow[] = page.rows.slice(0, MARKET_INDEX_PAGE).map((row) => ({
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
    rows,
  };
}

async function loadCryptoTab(): Promise<PublicPriceTab> {
  const page = await loadTop400Markets();
  const coins = page.coins.filter((coin) => coin.price > 0).slice(0, COIN_PAGE);
  const rows = coins.map((coin) => ({
    symbol: coin.symbol,
    name: coin.name,
    price: formatUnitPrice(coin.price, "USD"),
    change: formatSignedPercent(coin.change24h),
    href: `/markets/crypto/${encodeURIComponent(coin.id)}`,
  }));
  return {
    id: "CRYPTO",
    title: "Crypto",
    asOf: asOfLabel(latestIso(coins.map((coin) => coin.quotedAt))),
    rows,
  };
}

async function loadDexTab(): Promise<PublicPriceTab> {
  const page = await fetchDexTop400();
  const rows = page.rows
    .filter((row) => typeof row.price === "number" && row.price > 0 && row.detailId)
    .slice(0, COIN_PAGE)
    .map((row) => ({
      symbol: row.symbol,
      name: row.name,
      price: formatUnitPrice(row.price as number, "USD"),
      change: "change not stated",
      href: `/markets/crypto/${encodeURIComponent(row.detailId as string)}`,
    }));
  return {
    id: "DEX",
    title: "DEX",
    asOf: "as of not stated by the vendor",
    rows,
  };
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
    rows: page.rows.slice(0, MARKET_INDEX_PAGE).map((row) => ({
      symbol: row.symbol,
      name: row.name,
      price: PRICE_NOT_IN_RESPONSE,
      change: "change not stated",
      href: `/markets/stock/${encodeURIComponent(row.ticker)}`,
      source: "",
      asOf: "as of not stated by the vendor",
    })),
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
    within(loadCryptoTab(), { id: "CRYPTO", title: "Crypto", asOf: "as of not stated by the vendor", rows: [] }, ALT_BUDGET_MS).catch(() => ({
      id: "CRYPTO",
      title: "Crypto",
      asOf: "as of not stated by the vendor",
      rows: [] as PublicPriceRow[],
    })),
    within(loadDexTab(), { id: "DEX", title: "DEX", asOf: "as of not stated by the vendor", rows: [] }, ALT_BUDGET_MS).catch(() => ({
      id: "DEX",
      title: "DEX",
      asOf: "as of not stated by the vendor",
      rows: [] as PublicPriceRow[],
    })),
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

/** One equity ticker page. The saved print is used when both providers fail. */
export async function loadStockQuoteLine(ticker: string): Promise<string | null> {
  return within(loadSavedQuoteLine(ticker), null, EQUITY_BUDGET_MS);
}

/** One crypto ticker page. Null when no source returns a price. */
export async function loadCryptoQuoteLine(id: string): Promise<string | null> {
  try {
    const detail = await within<Awaited<ReturnType<typeof getCoinDetail>> | null>(getCoinDetail(id), null, 3000);
    if (!detail || !(detail.price > 0)) return null;
    const change = detail.change24h == null ? "change not stated" : formatSignedPercent(detail.change24h);
    return `${detail.symbol} ${formatUnitPrice(detail.price, "USD")} ${change} as of not stated by the vendor`;
  } catch {
    return null;
  }
}
