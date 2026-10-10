import nasdaqFile from "@/data/listings/sec-nasdaq.json";
import nyseFile from "@/data/listings/sec-nyse.json";
import { DOW_JONES_TICKERS, MARKET_UNIVERSE } from "@/lib/market-intel";
import {
  ASX_CODES_ABSENT_FROM_FILE,
  LISTED_COUNT,
  SITEMAP_TICKER_CAP,
  boardNote,
  coverageSentence,
  filterByQuery,
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

export function boardCoverage(board: StockBoard): { shown: number; listed: number; line: string; note: string } {
  const shown = listingsFor(board).length;
  const listed = LISTED_COUNT[board];
  return { shown, listed, line: coverageSentence(shown, listed), note: boardNote(board) };
}

export function pageListings(
  board: StockBoard,
  page: number,
  query = ""
): { rows: StockListing[]; total: number; page: number; pageCount: number } {
  const filtered = filterByQuery(listingsFor(board), query);
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

/** Ticker paths that render a company name from the catalog. Capped for the sitemap limit. */
export function catalogTickerPaths(): string[] {
  const seen = new Set<string>();
  const paths: string[] = [];
  for (const board of ["NZX", "ASX", "DOW", "NASDAQ", "NYSE"] as StockBoard[]) {
    for (const row of listingsFor(board)) {
      if (!row.name || seen.has(row.ticker)) continue;
      seen.add(row.ticker);
      paths.push(`/markets/stock/${encodeURIComponent(row.ticker)}`);
      if (paths.length >= SITEMAP_TICKER_CAP) return paths;
    }
  }
  return paths;
}
