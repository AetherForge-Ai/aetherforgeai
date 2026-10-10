import "server-only";

import { fetchDexTop400 } from "@/lib/crypto-coingecko";
import { getCoinDetail, loadTop400Markets } from "@/lib/crypto-source";
import { formatDisplayDateTime, formatSignedPercent, formatUnitPrice } from "@/lib/currency";
import {
  entriesForExchange,
  EXCHANGE_META,
  formatMarketPrice,
  type Exchange,
} from "@/lib/market-intel";
import { MARKET_INDEX_PAGE, type PublicMarketIndex, type PublicPriceRow, type PublicPriceTab } from "@/lib/public-market-types";
import { fetchYahooQuote, fetchYahooQuotesBatched, yahooEquitySymbol, type YahooQuote } from "@/lib/yahoo-finance";

const COIN_PAGE = 25;
const EQUITY_BUDGET_MS = 12000;
const ALT_BUDGET_MS = 5000;
const INDEX_TTL_MS = 5 * 60 * 1000;

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

async function loadEquityTab(exchange: Exchange): Promise<PublicPriceTab> {
  const entries = entriesForExchange(exchange).slice(0, MARKET_INDEX_PAGE);
  const map: Record<string, string> = {};
  for (const entry of entries) map[entry.ticker] = yahooEquitySymbol(entry.ticker);
  const quotes = await fetchYahooQuotesBatched(map);
  const meta = EXCHANGE_META[exchange];
  const rows: PublicPriceRow[] = [];
  const times: Array<string | null | undefined> = [];
  for (const entry of entries) {
    const quote = quotes[entry.ticker];
    if (!quote || !(quote.price > 0)) continue;
    times.push(quote.quotedAt);
    rows.push({
      symbol: entry.ticker.replace(/\.(NZ|AX|L)$/i, ""),
      name: entry.name,
      price: formatMarketPrice(quote.price, meta.currency),
      change: formatSignedPercent(quote.changePct),
      href: `/markets/stock/${encodeURIComponent(entry.ticker)}`,
    });
  }
  return {
    id: exchange,
    title: meta.label,
    asOf: asOfLabel(latestIso(times)),
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

async function buildIndex(): Promise<PublicMarketIndex> {
  const [nzx, asx, dow, nasdaq, crypto, dex] = await Promise.all([
    within(loadEquityTab("NZX"), { id: "NZX", title: "NZX", asOf: "as of not stated by the vendor", rows: [] }, EQUITY_BUDGET_MS),
    within(loadEquityTab("ASX"), { id: "ASX", title: "ASX", asOf: "as of not stated by the vendor", rows: [] }, EQUITY_BUDGET_MS),
    within(loadEquityTab("DOW"), { id: "DOW", title: "Dow Jones", asOf: "as of not stated by the vendor", rows: [] }, EQUITY_BUDGET_MS),
    within(loadEquityTab("NASDAQ"), { id: "NASDAQ", title: "NASDAQ", asOf: "as of not stated by the vendor", rows: [] }, EQUITY_BUDGET_MS),
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
  const tabs = [nzx, asx, dow, nasdaq, crypto, dex];
  return {
    tabs,
    priceRowCount: tabs.reduce((sum, tab) => sum + tab.rows.length, 0),
  };
}

let memo: { at: number; value: PublicMarketIndex } | null = null;
let inflight: Promise<PublicMarketIndex> | null = null;

/** First page of each markets tab. Cached in this process. A failed tab is an empty list, not a made-up price. */
export async function loadPublicMarketIndex(): Promise<PublicMarketIndex> {
  if (memo && Date.now() - memo.at < INDEX_TTL_MS && memo.value.priceRowCount > 0) return memo.value;
  if (!inflight) {
    inflight = buildIndex().finally(() => {
      inflight = null;
    });
  }
  const value = await inflight;
  if (value.priceRowCount > 0) memo = { at: Date.now(), value };
  return value;
}

/** One equity ticker page. Null when Yahoo does not return a price. */
export async function loadStockQuoteLine(ticker: string): Promise<string | null> {
  const quote = await within<YahooQuote | null>(fetchYahooQuote(ticker), null, 3000);
  if (!quote || !(quote.price > 0)) return null;
  const currency = ticker.toUpperCase().endsWith(".NZ") ? "NZD" : ticker.toUpperCase().endsWith(".AX") ? "AUD" : "USD";
  const when = quote.quotedAt ? asOfLabel(quote.quotedAt) : "as of not stated by the vendor";
  return `${ticker} ${formatMarketPrice(quote.price, currency)} ${formatSignedPercent(quote.changePct)} ${when}`;
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
