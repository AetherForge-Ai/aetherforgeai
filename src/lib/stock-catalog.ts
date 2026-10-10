import nasdaqFile from "@/data/listings/sec-nasdaq.json";
import nyseFile from "@/data/listings/sec-nyse.json";
import seedFile from "@/data/listings/last-good.json";
import { DOW_JONES_TICKERS, MARKET_UNIVERSE } from "@/lib/market-intel";
import {
  ASX_CODES_ABSENT_FROM_FILE,
  LISTED_COUNT,
  SITEMAP_TICKER_CAP,
  SITEMAP_US_CAP,
  boardCountClause,
  boardNote,
  coverageSentence,
  filterByQuery,
  hasRecentVerifiedPrice,
  isDerivativeOrTestSecurity,
  sectorIsStated,
  slicePage,
  type StockBoard,
  type StockListing,
} from "@/lib/stock-markets";

interface SecFile {
  rows: string[][];
}

const TICKER = /^[A-Z0-9][A-Z0-9.-]{0,14}$/;
const ABSENT_ASX = new Set<string>(ASX_CODES_ABSENT_FROM_FILE);

function cleanName(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 120);
}

function secListings(file: SecFile, board: "NASDAQ" | "NYSE"): StockListing[] {
  const out: StockListing[] = [];
  const seen = new Set<string>();
  for (const row of file.rows) {
    const symbol = String(row?.[0] || "").trim().toUpperCase();
    const name = cleanName(String(row?.[1] || ""));
    if (!symbol || !name || !TICKER.test(symbol) || symbol.includes("..") || seen.has(symbol)) continue;
    seen.add(symbol);
    out.push({ ticker: symbol, symbol, name, board, sector: "Not stated" });
  }
  out.sort((a, b) => a.symbol.localeCompare(b.symbol));
  return out;
}

function repoListings(market: "NZX" | "ASX"): StockListing[] {
  const suffix = market === "NZX" ? ".NZ" : ".AX";
  const out: StockListing[] = [];
  for (const entry of MARKET_UNIVERSE) {
    if (entry.market !== market) continue;
    const symbol = entry.ticker.replace(/\.(NZ|AX)$/i, "").toUpperCase();
    if (market === "ASX" && ABSENT_ASX.has(symbol)) continue;
    const name = cleanName(entry.name);
    if (!name) continue;
    out.push({
      ticker: entry.ticker.toUpperCase(),
      symbol,
      name,
      board: market,
      sector: entry.sector || "Not stated",
    });
  }
  out.sort((a, b) => a.symbol.localeCompare(b.symbol) || a.ticker.localeCompare(b.ticker));
  return out;
}

function dowListings(): StockListing[] {
  const out: StockListing[] = [];
  for (const entry of MARKET_UNIVERSE) {
    const symbol = entry.ticker.toUpperCase();
    if (symbol.includes(".")) continue;
    if (!DOW_JONES_TICKERS.has(symbol)) continue;
    const name = cleanName(entry.name);
    if (!name) continue;
    out.push({
      ticker: symbol,
      symbol,
      name,
      board: "DOW",
      sector: entry.sector || "Not stated",
    });
  }
  out.sort((a, b) => a.symbol.localeCompare(b.symbol));
  return out;
}

let cache: Record<StockBoard, StockListing[]> | null = null;

export function stockBoards(): Record<StockBoard, StockListing[]> {
  if (cache) return cache;
  cache = {
    NZX: repoListings("NZX"),
    ASX: repoListings("ASX"),
    DOW: dowListings(),
    NASDAQ: secListings(nasdaqFile as SecFile, "NASDAQ"),
    NYSE: secListings(nyseFile as SecFile, "NYSE"),
  };
  return cache;
}

export function listingsFor(board: StockBoard): StockListing[] {
  return stockBoards()[board];
}

export interface BoardView {
  includeDerivatives?: boolean;
}

/** NASDAQ and NYSE hide warrants, units, rights, and test issues unless asked. */
export function listingsForView(board: StockBoard, view?: BoardView): StockListing[] {
  const rows = listingsFor(board);
  if (view?.includeDerivatives || (board !== "NASDAQ" && board !== "NYSE")) return rows;
  return rows.filter((row) => !isDerivativeOrTestSecurity(row.ticker, row.name));
}

export function boardCoverage(
  board: StockBoard,
  view?: BoardView
): { shown: number; listed: number; line: string; note: string } {
  const includeDerivatives = !!view?.includeDerivatives;
  const shown = listingsForView(board, view).length;
  const secBoard = board === "NASDAQ" || board === "NYSE";
  const listed = secBoard ? shown : LISTED_COUNT[board];
  const clause = boardCountClause(board, includeDerivatives && secBoard);
  const line = coverageSentence(shown, listed);
  return {
    shown,
    listed,
    line: clause ? `${line}. ${clause}` : line,
    note: boardNote(board),
  };
}

export function pageListings(
  board: StockBoard,
  page: number,
  query = "",
  view?: BoardView
): { rows: StockListing[]; total: number; page: number; pageCount: number } {
  const filtered = filterByQuery(listingsForView(board, view), query);
  const sliced = slicePage(filtered, page);
  return { rows: sliced.rows, total: filtered.length, page: sliced.page, pageCount: sliced.pageCount };
}

const FIND_ORDER: StockBoard[] = ["NZX", "ASX", "NASDAQ", "NYSE", "DOW"];

export function findListing(ticker: string): StockListing | null {
  const key = ticker.trim().toUpperCase();
  if (!key) return null;
  const boards = stockBoards();
  if (key.endsWith(".NZ")) return boards.NZX.find((row) => row.ticker === key) ?? null;
  if (key.endsWith(".AX")) return boards.ASX.find((row) => row.ticker === key) ?? null;
  for (const board of FIND_ORDER) {
    const hit = boards[board].find((row) => row.ticker === key);
    if (hit) return hit;
  }
  return null;
}

function recentPriceTickers(now: number): Set<string> {
  const out = new Set<string>();
  const file = seedFile as Record<string, { price?: unknown; quotedAt?: unknown }>;
  for (const [ticker, value] of Object.entries(file)) {
    if (hasRecentVerifiedPrice(value, now)) out.add(ticker.toUpperCase());
  }
  return out;
}

let sitemapCache: { key: number; rows: StockListing[] } | null = null;

/**
 * Sitemap names: every NZX, ASX, and Dow listing, plus up to SITEMAP_US_CAP
 * US names with a verified name and a stated sector or a recent saved price.
 * Warrants, units, rights, and test-like issues are left out.
 */
export function sitemapStockListings(now = Date.now()): StockListing[] {
  const key = Math.floor(now / 60_000);
  if (sitemapCache && sitemapCache.key === key) return sitemapCache.rows;
  const recent = recentPriceTickers(now);
  const seen = new Set<string>();
  const rows: StockListing[] = [];
  const push = (row: StockListing) => {
    if (!row.name || seen.has(row.ticker)) return false;
    if (isDerivativeOrTestSecurity(row.ticker, row.name)) return false;
    seen.add(row.ticker);
    rows.push(row);
    return true;
  };
  for (const board of ["NZX", "ASX", "DOW"] as const) {
    for (const row of listingsFor(board)) push(row);
  }
  let us = 0;
  for (const entry of MARKET_UNIVERSE) {
    if (us >= SITEMAP_US_CAP) break;
    if (entry.market === "NZX" || entry.market === "ASX" || entry.market === "CRYPTO") continue;
    const listing = findListing(entry.ticker);
    if (!listing || listing.board === "NZX" || listing.board === "ASX") continue;
    if (seen.has(listing.ticker)) continue;
    const sector = sectorIsStated(entry.sector) ? entry.sector : listing.sector;
    const priced = recent.has(listing.ticker);
    if (!sectorIsStated(sector) && !priced) continue;
    if (push(listing)) us += 1;
  }
  if (us < SITEMAP_US_CAP) {
    for (const board of ["NASDAQ", "NYSE"] as const) {
      for (const row of listingsFor(board)) {
        if (us >= SITEMAP_US_CAP) break;
        if (!recent.has(row.ticker) || seen.has(row.ticker)) continue;
        if (push(row)) us += 1;
      }
    }
  }
  sitemapCache = { key, rows };
  return rows;
}

export function isSitemapStock(ticker: string, now = Date.now()): boolean {
  const key = ticker.trim().toUpperCase();
  return sitemapStockListings(now).some((row) => row.ticker === key);
}

/** Ticker paths that render a company name from the catalog. Capped for the sitemap limit. */
export function catalogTickerPaths(now = Date.now()): string[] {
  return sitemapStockListings(now)
    .slice(0, SITEMAP_TICKER_CAP)
    .map((row) => `/markets/stock/${encodeURIComponent(row.ticker)}`);
}
