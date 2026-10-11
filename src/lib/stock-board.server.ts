import "server-only";

import seedFile from "@/data/listings/last-good.json";
import { formatDisplayDateTime, formatSignedPercent } from "@/lib/currency";
import { formatMarketPrice } from "@/lib/market-intel";
import { equityFreshnessLabel, parseQuoteTime, type EquityVenue } from "@/lib/market-freshness";
import { boardCoverage, findListing, pageListings } from "@/lib/stock-catalog";
import {
  CHANGE_NOT_STATED,
  PRICE_NOT_IN_RESPONSE,
  SNAPSHOT_FRESH_MS,
  unpricedFootnote,
  freshBreaker,
  quoteWithProviders,
  type BreakerState,
  type EquityPrint,
  type QuoteSource,
  type SavedPrint,
  type StockBoard,
} from "@/lib/stock-markets";
import { fetchYahooQuotesBatched } from "@/lib/yahoo-finance";

const TWELVE_FETCH_MS = 1_500;

const META: Record<StockBoard, { label: string; sub: string; currency: "NZD" | "AUD" | "USD" }> = {
  NZX: { label: "NZX", sub: "New Zealand Exchange", currency: "NZD" },
  ASX: { label: "ASX", sub: "Australian Securities Exchange", currency: "AUD" },
  DOW: { label: "Dow Jones", sub: "Dow Jones Industrial Average · 30", currency: "USD" },
  NASDAQ: { label: "NASDAQ", sub: "Nasdaq-tagged names in the SEC company file", currency: "USD" },
  NYSE: { label: "NYSE", sub: "NYSE-tagged names in the SEC company file", currency: "USD" },
};

export interface StockBoardRow {
  ticker: string;
  symbol: string;
  name: string;
  sector: string;
  board: StockBoard;
  currency: "NZD" | "AUD" | "USD";
  price: number | null;
  changePct: number | null;
  changeAbs: number | null;
  priceLabel: string;
  changeLabel: string;
  source: QuoteSource | null;
  quotedAt: string | null;
  asOf: string;
  quoted: boolean;
}

export interface StockBoardPage {
  board: StockBoard;
  label: string;
  sub: string;
  currency: "NZD" | "AUD" | "USD";
  coverage: string;
  note: string;
  shown: number;
  listed: number;
  page: number;
  pageCount: number;
  total: number;
  freshness: string;
  asOf: string | null;
  rows: StockBoardRow[];
  unpricedCount: number;
  footnote: string | null;
}

const memory = new Map<string, SavedPrint>();
const pending = new Map<string, EquityPrint>();
let yahooBreaker: BreakerState = freshBreaker();
let twelveBreaker: BreakerState = freshBreaker();
const refreshing = new Set<string>();
const inflightRefresh = new Map<string, Promise<Record<string, SavedPrint | null>>>();

/** Stay inside the 3s /markets budget, then return names with the saved print. */
const PAGE_WAIT_MS = 2_000;

function asSaved(value: unknown): SavedPrint | null {
  if (!value || typeof value !== "object") return null;
  const row = value as { price?: unknown; changePct?: unknown; quotedAt?: unknown };
  const price = Number(row.price);
  const changePct = Number(row.changePct);
  if (!(price > 0) || !Number.isFinite(price) || !Number.isFinite(changePct)) return null;
  const quotedAt = typeof row.quotedAt === "string" && row.quotedAt ? row.quotedAt : null;
  return { price, changePct, quotedAt, source: "Last good" };
}

const seed: Record<string, SavedPrint> = {};
for (const [ticker, value] of Object.entries(seedFile as Record<string, unknown>)) {
  const saved = asSaved(value);
  if (saved) seed[ticker.toUpperCase()] = saved;
}

function savedFor(ticker: string): SavedPrint | undefined {
  return memory.get(ticker) || seed[ticker];
}

function venue(board: StockBoard): EquityVenue {
  if (board === "NZX") return "NZX";
  if (board === "ASX") return "ASX";
  return "US";
}

function rowAsOf(iso: string | null): string {
  if (!iso) return "as of not stated by the vendor";
  const wall = formatDisplayDateTime(iso);
  return wall === "—" ? "as of not stated by the vendor" : `as of ${wall}`;
}

function currencyFor(ticker: string, board?: StockBoard | null): "NZD" | "AUD" | "USD" {
  if (board) return META[board].currency;
  const t = ticker.toUpperCase();
  if (t.endsWith(".NZ")) return "NZD";
  if (t.endsWith(".AX")) return "AUD";
  return "USD";
}

async function fetchYahoo(tickers: string[]): Promise<Record<string, EquityPrint>> {
  const map = Object.fromEntries(tickers.map((ticker) => [ticker, ticker.toUpperCase()]));
  const quotes = await fetchYahooQuotesBatched(map);
  const out: Record<string, EquityPrint> = {};
  for (const [ticker, quote] of Object.entries(quotes)) {
    if (!(quote.price > 0) || !Number.isFinite(quote.changePct)) continue;
    out[ticker] = {
      price: quote.price,
      changePct: quote.changePct,
      quotedAt: quote.quotedAt ?? null,
      source: "Yahoo Finance",
    };
  }
  return out;
}

function twelveSymbol(ticker: string): { symbol: string; country?: string } {
  const t = ticker.toUpperCase();
  if (t.endsWith(".NZ")) return { symbol: t.replace(/\.NZ$/, ""), country: "New Zealand" };
  if (t.endsWith(".AX")) return { symbol: t.replace(/\.AX$/, ""), country: "Australia" };
  return { symbol: t };
}

function twelveTime(value: unknown): string | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  const date = new Date(n > 1e12 ? n : n * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function fetchTwelve(tickers: string[]): Promise<Record<string, EquityPrint>> {
  const key = process.env.MARKET_DATA_API_KEY;
  if (!key || !tickers.length) return {};
  const groups = new Map<string, { country?: string; tickers: string[] }>();
  for (const ticker of tickers) {
    const mapped = twelveSymbol(ticker);
    const id = mapped.country || "US";
    const group = groups.get(id) || { country: mapped.country, tickers: [] };
    group.tickers.push(ticker);
    groups.set(id, group);
  }
  const out: Record<string, EquityPrint> = {};
  await Promise.all(
    [...groups.values()].map(async (group) => {
      const symbolMap = new Map<string, string>();
      for (const ticker of group.tickers) symbolMap.set(twelveSymbol(ticker).symbol, ticker);
      const params = new URLSearchParams({
        symbol: [...symbolMap.keys()].join(","),
        apikey: key,
        dp: "4",
      });
      if (group.country) params.set("country", group.country);
      const res = await fetch(`https://api.twelvedata.com/quote?${params.toString()}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(TWELVE_FETCH_MS),
      });
      if (!res.ok) throw new Error(`Twelve Data HTTP ${res.status}`);
      const json = (await res.json()) as Record<string, Record<string, unknown>> | Record<string, unknown>;
      const entries: [string, Record<string, unknown>][] =
        json && (typeof (json as { symbol?: unknown }).symbol === "string" || "close" in json || "code" in json)
          ? [[String((json as { symbol?: unknown }).symbol || ""), json as Record<string, unknown>]]
          : Object.entries(json as Record<string, Record<string, unknown>>);
      for (const [sym, quote] of entries) {
        if (!quote || quote.code || quote.status === "error") continue;
        const ticker = symbolMap.get(sym) || symbolMap.get(sym.toUpperCase());
        if (!ticker) continue;
        const close = Number(quote.close ?? quote.price);
        const prev = Number(quote.previous_close);
        const price = Number.isFinite(close) && close > 0 ? close : Number.isFinite(prev) && prev > 0 ? prev : NaN;
        const changePct = Number(quote.percent_change ?? 0);
        if (!(price > 0) || !Number.isFinite(changePct)) continue;
        out[ticker] = {
          price,
          changePct,
          quotedAt: twelveTime(quote.timestamp),
          source: "Twelve Data",
        };
      }
    })
  );
  return out;
}

function snapshotFresh(tickers: string[], now: number): boolean {
  return tickers.every((ticker) => {
    const saved = memory.get(ticker);
    if (!saved || !(saved.price > 0) || !saved.quotedAt) return false;
    const at = Date.parse(saved.quotedAt);
    return Number.isFinite(at) && now - at < SNAPSHOT_FRESH_MS;
  });
}

function savedSnapshot(tickers: string[]): Record<string, SavedPrint | null> {
  return Object.fromEntries(tickers.map((ticker) => [ticker, savedFor(ticker) || null]));
}

async function refreshTickers(tickers: string[], now: number): Promise<Record<string, SavedPrint | null>> {
  const key = tickers.map((ticker) => ticker.toUpperCase()).sort().join(",");
  const existing = key ? inflightRefresh.get(key) : undefined;
  if (existing) return existing;
  const work = refreshTickersOnce(tickers, now);
  if (key) inflightRefresh.set(key, work);
  try {
    return await work;
  } finally {
    if (key && inflightRefresh.get(key) === work) inflightRefresh.delete(key);
  }
}

async function refreshTickersOnce(tickers: string[], now: number): Promise<Record<string, SavedPrint | null>> {
  const saved: Record<string, SavedPrint | undefined> = {};
  const held: Record<string, EquityPrint | undefined> = {};
  for (const ticker of tickers) {
    const prior = savedFor(ticker);
    if (prior) saved[ticker] = prior;
    const hold = pending.get(ticker);
    if (hold) held[ticker] = hold;
  }
  const twelve = process.env.MARKET_DATA_API_KEY ? fetchTwelve : null;
  const result = await quoteWithProviders({
    tickers,
    now,
    yahooBreaker,
    twelveBreaker,
    saved,
    pending: held,
    yahoo: fetchYahoo,
    twelve,
  });
  yahooBreaker = result.yahooBreaker;
  twelveBreaker = result.twelveBreaker;
  for (const [ticker, value] of Object.entries(result.saved)) {
    if (value && value.price > 0) memory.set(ticker, value);
  }
  for (const ticker of tickers) {
    const hold = result.pending[ticker];
    if (hold) pending.set(ticker, hold);
    else pending.delete(ticker);
  }
  return result.rows;
}

function scheduleRefresh(tickers: string[]) {
  const key = tickers.slice().sort().join(",");
  if (!key || refreshing.has(key)) return;
  refreshing.add(key);
  void refreshTickers(tickers, Date.now())
    .catch((err) => console.error("[stock-board] background refresh failed:", err))
    .finally(() => refreshing.delete(key));
}

async function printsFor(
  tickers: string[],
  now: number,
  waitMs = PAGE_WAIT_MS
): Promise<Record<string, SavedPrint | null>> {
  if (!tickers.length) return {};
  const covered = tickers.every((ticker) => {
    const saved = savedFor(ticker);
    return !!saved && saved.price > 0;
  });
  if (covered && snapshotFresh(tickers, now)) return savedSnapshot(tickers);
  if (covered || waitMs <= 0) {
    scheduleRefresh(tickers);
    return savedSnapshot(tickers);
  }
  const work = refreshTickers(tickers, now);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timed = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), waitMs);
  });
  const winner = await Promise.race([work.then(() => "done" as const), timed]);
  if (timer) clearTimeout(timer);
  if (winner === "timeout") return savedSnapshot(tickers);
  return work;
}

function toRow(
  listing: { ticker: string; symbol: string; name: string; sector: string; board: StockBoard },
  print: SavedPrint | null
): StockBoardRow {
  const currency = META[listing.board].currency;
  const quoted = !!print && print.price > 0;
  const changeAbs = quoted ? (print!.price * print!.changePct) / 100 : null;
  return {
    ticker: listing.ticker,
    symbol: listing.symbol,
    name: listing.name,
    sector: listing.sector,
    board: listing.board,
    currency,
    price: quoted ? print!.price : null,
    changePct: quoted ? print!.changePct : null,
    changeAbs,
    priceLabel: quoted ? formatMarketPrice(print!.price, currency) : PRICE_NOT_IN_RESPONSE,
    changeLabel: quoted ? formatSignedPercent(print!.changePct) : CHANGE_NOT_STATED,
    source: quoted ? print!.source : null,
    quotedAt: quoted ? print!.quotedAt : null,
    asOf: rowAsOf(quoted ? print!.quotedAt : null),
    quoted,
  };
}

export async function loadStockBoardPage(
  board: StockBoard,
  opts?: { page?: number; query?: string; now?: number; waitMs?: number; includeDerivatives?: boolean; rowLimit?: number }
): Promise<StockBoardPage> {
  const now = opts?.now ?? Date.now();
  const query = (opts?.query || "").trim().slice(0, 40);
  const view = { includeDerivatives: !!opts?.includeDerivatives };
  const page = pageListings(board, opts?.page ?? 1, query, view);
  const coverage = boardCoverage(board, view);
  const quoteRows = opts?.rowLimit && opts.rowLimit > 0 ? page.rows.slice(0, opts.rowLimit) : page.rows;
  const prints = await printsFor(
    quoteRows.map((row) => row.ticker),
    now,
    opts?.waitMs
  );
  // Every catalog row is returned. Dropping an unpriced name made "Showing N of N"
  // disagree with the rows collected by paging.
  const rows = quoteRows.map((row) => toRow(row, prints[row.ticker] || null));
  const unpricedCount = rows.filter((row) => !row.quoted).length;
  const times = rows.map((row) => parseQuoteTime(row.quotedAt)).filter((value): value is Date => !!value);
  const latest = times.sort((a, b) => b.getTime() - a.getTime())[0] || null;
  const meta = META[board];
  console.log(
    `[stock-board] ${board} page ${page.page}/${page.pageCount}: ${rows.length} quoted, ${unpricedCount} without a price, catalog ${coverage.shown}`
  );
  return {
    board,
    label: meta.label,
    sub: meta.sub,
    currency: meta.currency,
    coverage: coverage.line,
    note: coverage.note,
    shown: coverage.shown,
    listed: coverage.listed,
    page: page.page,
    pageCount: page.pageCount,
    total: page.total,
    freshness: equityFreshnessLabel(venue(board), new Date(now), latest).label,
    asOf: latest ? latest.toISOString() : null,
    rows,
    unpricedCount,
    footnote: unpricedFootnote(unpricedCount),
  };
}

/** One ticker page. Uses the saved print when both providers fail. */
export async function loadSavedQuoteLine(ticker: string, now = Date.now()): Promise<string | null> {
  const key = ticker.trim().toUpperCase();
  if (!key) return null;
  const listing = findListing(key);
  const prints = await printsFor([key], now);
  const print = prints[key];
  if (!print || !(print.price > 0)) return null;
  const currency = currencyFor(key, listing?.board);
  const source = print.source;
  return `${key} ${formatMarketPrice(print.price, currency)} ${formatSignedPercent(print.changePct)} ${rowAsOf(print.quotedAt)} · ${source}`;
}
