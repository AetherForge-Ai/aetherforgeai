/**
 * Stock board counts, quote checks, and the provider chain.
 *
 * pull-check:stock-markets-full-2026-10-11
 *
 * Listing counts recorded 10 Oct 2026 (see docs/stock-market-sources-2026-10-11.md):
 *   NZX  60 names in this repo; 178 instruments on the NZSX page (172 share-category).
 *   ASX  217 names in this repo; 212 of those codes were in the ASX company file of 1,923.
 *   Dow  30 of 30 names already in this repo.
 *   NASDAQ tab was 90 US names that are not Dow, not a Nasdaq list.
 *     SEC company file: 4,376 tagged Nasdaq. Nasdaq directory file: 5,622 non-test symbols.
 *   NYSE had no tab. SEC company file: 3,290 tagged NYSE.
 *     Other-listed directory file: 2,900 non-test NYSE symbols.
 * The Nasdaq and ASX website terms do not allow this repo to copy those directories.
 * The SEC file is a US government work. Prices stay on the existing Yahoo call, then
 * Twelve Data only when MARKET_DATA_API_KEY is set.
 */

export type StockBoard = "NZX" | "ASX" | "DOW" | "NASDAQ" | "NYSE";

export const STOCK_BOARDS: StockBoard[] = ["NZX", "ASX", "DOW", "NASDAQ", "NYSE"];

export const STOCK_PAGE_SIZE = 50;

/** Sitemap stays under the 50,000 URL limit, with room for the static pages. */
export const SITEMAP_TICKER_CAP = 45_000;

/**
 * US names added to the sitemap beyond NZX, ASX, and Dow.
 * A name qualifies with a verified name plus a stated sector or a recent saved price.
 */
export const SITEMAP_US_CAP = 300;

/** A saved print is recent enough for the sitemap when it is inside this window. */
export const SITEMAP_PRICE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export const FUND_TYPE_NOTE =
  "includes funds and other security types; type not stated by the source";

export const PRICE_NOT_IN_RESPONSE = "Not in this response";
export const CHANGE_NOT_STATED = "change not stated";

export const PROVIDER_TIMEOUT_MS = 2_500;
export const TWELVE_TIMEOUT_MS = 1_500;
export const BREAKER_FAILS = 3;
export const BREAKER_OPEN_MS = 60_000;
export const SNAPSHOT_FRESH_MS = 60_000;

/**
 * Directory or index size used in "Showing N of M listed".
 * These are counts from files and pages fetched on 10 Oct 2026, not a copied list.
 */
export const LISTED_COUNT: Record<StockBoard, number> = {
  NZX: 178,
  ASX: 1923,
  DOW: 30,
  NASDAQ: 5622,
  NYSE: 2900,
};

/** Repo ASX codes that were not in the ASX company file dated 11 Oct 2026 06:14 AEDT. */
export const ASX_CODES_ABSENT_FROM_FILE = ["ASK", "OPT", "QUB", "VAU", "WR1"] as const;

export interface StockListing {
  ticker: string;
  symbol: string;
  name: string;
  board: StockBoard;
  sector: string;
}

export type QuoteSource = "Yahoo Finance" | "Twelve Data" | "Last good";

export interface EquityPrint {
  price: number;
  changePct: number;
  quotedAt: string | null;
  source: "Yahoo Finance" | "Twelve Data";
}

export interface SavedPrint {
  price: number;
  changePct: number;
  quotedAt: string | null;
  source: QuoteSource;
}

export interface BreakerState {
  failures: number;
  openUntil: number;
}

export function freshBreaker(): BreakerState {
  return { failures: 0, openUntil: 0 };
}

export function breakerIsOpen(state: BreakerState, now: number): boolean {
  return state.openUntil > now;
}

export function noteProviderResult(state: BreakerState, ok: boolean, now: number): BreakerState {
  if (ok) return freshBreaker();
  const failures = state.failures + 1;
  if (failures >= BREAKER_FAILS) return { failures, openUntil: now + BREAKER_OPEN_MS };
  return { failures, openUntil: 0 };
}

/** Visitor line. Uses "Showing N of M listed" when the shown list is shorter than the count. */
export function coverageSentence(shown: number, listed: number): string {
  const n = Math.max(0, Math.round(Number(shown) || 0));
  const m = Math.max(0, Math.round(Number(listed) || 0));
  if (m > 0 && n <= m) return `Showing ${n} of ${m} listed`;
  if (m > 0) return `Showing ${n} names. A directory file counted ${m} symbols.`;
  return `Showing ${n} listed`;
}

export function boardNote(board: StockBoard): string {
  if (board === "NZX") {
    return "60 names kept in this repo. 178 is the NZSX instrument count on the NZX markets page on 10 Oct 2026 (172 were share-category). That page is not copied here. Not a direct NZX feed.";
  }
  if (board === "ASX") {
    return "Names kept in this repo that were also in the ASX company file dated 11 Oct 2026 06:14 AEDT (1,923 codes). That file is not copied here. Not a direct ASX feed.";
  }
  if (board === "DOW") {
    return "The 30 Dow Jones Industrial Average names kept in this repo.";
  }
  if (board === "NASDAQ") {
    return `SEC company file tagged Nasdaq, retrieved 10 Oct 2026. 5,622 is the non-test symbol count in the Nasdaq directory file created 9 Oct 2026 21:31. ${FUND_TYPE_NOTE}. Not a direct exchange feed.`;
  }
  return `SEC company file tagged NYSE, retrieved 10 Oct 2026. 2,900 is the non-test NYSE symbol count in the other-listed directory file created 9 Oct 2026 21:31. ${FUND_TYPE_NOTE}. Not a direct exchange feed.`;
}

export function sectorIsStated(sector: string | null | undefined): boolean {
  const value = (sector || "").trim();
  return value.length > 0 && value.toLowerCase() !== "not stated";
}

/** Public sentence. A sector that was not stated is left out. */
export function listingSentence(name: string, sector: string, exchange: string): string {
  if (sectorIsStated(sector) && exchange) return `${name} is in the ${sector} list on ${exchange}.`;
  if (exchange) return `${name} is listed on ${exchange}.`;
  return name;
}

/**
 * Warrants, units, rights, and test issues. Nasdaq often adds W, U, or R
 * (or WS, WT, WD, RT) to a 4-letter issuer. Ordinary tickers such as GROW stay.
 */
export function isDerivativeOrTestSecurity(ticker: string, name: string): boolean {
  const symbol = ticker
    .trim()
    .toUpperCase()
    .replace(/\.(NZ|AX|L)$/i, "");
  if (/\b(warrants?|units?|rights?)\b/i.test(name || "")) return true;
  if (/\btest\b/i.test(name || "")) return true;
  if (symbol.includes("TEST")) return true;
  if (/^Z[A-Z]ZZT$/.test(symbol)) return true;
  return /^[A-Z]{4}(W|U|R|WS|WT|WD|RT)$/.test(symbol);
}

export function hasRecentVerifiedPrice(
  print: { price?: unknown; quotedAt?: unknown } | null | undefined,
  now: number,
  maxAgeMs = SITEMAP_PRICE_MAX_AGE_MS
): boolean {
  const price = Number(print?.price);
  const quotedAt = typeof print?.quotedAt === "string" ? print.quotedAt : "";
  if (!(price > 0) || !quotedAt) return false;
  const at = Date.parse(quotedAt);
  if (!Number.isFinite(at)) return false;
  const age = now - at;
  return age <= maxAgeMs && at <= now + 24 * 60 * 60 * 1000;
}

/** US pages outside the sitemap set with no quote stay reachable and unindexed. */
export function usPageShouldNoindex(input: {
  board: StockBoard | null;
  inSitemap: boolean;
  hasQuote: boolean;
}): boolean {
  if (input.board !== "NASDAQ" && input.board !== "NYSE") return false;
  if (input.inSitemap) return false;
  return !input.hasQuote;
}

export function slicePage<T>(rows: T[], page: number, pageSize = STOCK_PAGE_SIZE): {
  page: number;
  pageCount: number;
  rows: T[];
} {
  const size = Math.max(1, pageSize);
  const pageCount = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(pageCount, Math.max(1, Math.round(page) || 1));
  const start = (current - 1) * size;
  return { page: current, pageCount, rows: rows.slice(start, start + size) };
}

export function filterByQuery<T extends { ticker: string; symbol: string; name: string }>(
  rows: T[],
  query: string
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(
    (row) =>
      row.symbol.toLowerCase().includes(q) ||
      row.ticker.toLowerCase().includes(q) ||
      row.name.toLowerCase().includes(q)
  );
}

function pricesAgree(a: number, b: number): boolean {
  if (!(a > 0) || !(b > 0)) return false;
  const ratio = a / b;
  return ratio >= 0.85 && ratio <= 1.15;
}

/**
 * Keep a positive finite print. A print more than double or less than half the
 * saved price is held back until a second print agrees with it, so one bad
 * tick does not replace the saved price and a real move is not stuck forever.
 */
export function resolveEquityPrint(
  next: EquityPrint | null | undefined,
  prior: SavedPrint | null | undefined,
  pending: EquityPrint | null | undefined
): { print: SavedPrint | null; pending: EquityPrint | null } {
  const priorOk = prior && prior.price > 0 && Number.isFinite(prior.price) ? prior : null;
  const nextOk =
    next && Number.isFinite(next.price) && next.price > 0 && Number.isFinite(next.changePct) ? next : null;
  if (!nextOk) return { print: priorOk, pending: pending && pending.price > 0 ? pending : null };
  if (!priorOk) {
    if (Math.abs(nextOk.changePct) > 80) return { print: null, pending: null };
    return {
      print: {
        price: nextOk.price,
        changePct: nextOk.changePct,
        quotedAt: nextOk.quotedAt,
        source: nextOk.source,
      },
      pending: null,
    };
  }
  const ratio = nextOk.price / priorOk.price;
  if (ratio >= 0.5 && ratio <= 2) {
    return {
      print: {
        price: nextOk.price,
        changePct: nextOk.changePct,
        quotedAt: nextOk.quotedAt,
        source: nextOk.source,
      },
      pending: null,
    };
  }
  if (pending && pending.price > 0 && pricesAgree(nextOk.price, pending.price)) {
    return {
      print: {
        price: nextOk.price,
        changePct: nextOk.changePct,
        quotedAt: nextOk.quotedAt,
        source: nextOk.source,
      },
      pending: null,
    };
  }
  return { print: priorOk, pending: nextOk };
}

export function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

export interface ProviderMaps {
  yahoo: Record<string, EquityPrint | null | undefined> | null;
  twelve: Record<string, EquityPrint | null | undefined> | null;
}

/** Apply Yahoo, then Twelve Data, then the saved print. Never returns a zero price. */
export function mergeProviderPrints(
  tickers: string[],
  maps: ProviderMaps,
  saved: Record<string, SavedPrint | undefined>,
  pending: Record<string, EquityPrint | undefined>
): { rows: Record<string, SavedPrint | null>; pending: Record<string, EquityPrint | undefined> } {
  const rows: Record<string, SavedPrint | null> = {};
  const nextPending: Record<string, EquityPrint | undefined> = { ...pending };
  for (const ticker of tickers) {
    const yahoo = maps.yahoo?.[ticker] ?? null;
    const twelve = maps.twelve?.[ticker] ?? null;
    const prior = saved[ticker];
    const hold = pending[ticker];
    const first = resolveEquityPrint(yahoo, prior, hold);
    const second =
      first.print && first.print.source !== "Last good" && yahoo
        ? first
        : resolveEquityPrint(twelve, first.print, first.pending);
    // If Yahoo was accepted, do not let Twelve Data replace it.
    const chosen = yahoo && first.print && first.print.source === yahoo.source ? first : second;
    rows[ticker] = chosen.print && chosen.print.price > 0 ? chosen.print : null;
    if (chosen.pending && chosen.pending.price > 0) nextPending[ticker] = chosen.pending;
    else delete nextPending[ticker];
  }
  return { rows, pending: nextPending };
}

export async function quoteWithProviders(input: {
  tickers: string[];
  now: number;
  yahooBreaker: BreakerState;
  twelveBreaker: BreakerState;
  saved: Record<string, SavedPrint | undefined>;
  pending: Record<string, EquityPrint | undefined>;
  yahoo: ((tickers: string[]) => Promise<Record<string, EquityPrint>>) | null;
  twelve: ((tickers: string[]) => Promise<Record<string, EquityPrint>>) | null;
  yahooTimeoutMs?: number;
  twelveTimeoutMs?: number;
}): Promise<{
  rows: Record<string, SavedPrint | null>;
  pending: Record<string, EquityPrint | undefined>;
  saved: Record<string, SavedPrint | undefined>;
  yahooBreaker: BreakerState;
  twelveBreaker: BreakerState;
}> {
  let yahooBreaker = input.yahooBreaker;
  let twelveBreaker = input.twelveBreaker;
  let yahooMap: Record<string, EquityPrint> | null = null;
  let twelveMap: Record<string, EquityPrint> | null = null;

  if (input.yahoo && input.tickers.length && !breakerIsOpen(yahooBreaker, input.now)) {
    try {
      yahooMap = await withTimeout(input.yahoo(input.tickers), input.yahooTimeoutMs ?? PROVIDER_TIMEOUT_MS);
      yahooBreaker = noteProviderResult(yahooBreaker, Object.keys(yahooMap).length > 0, input.now);
    } catch {
      yahooBreaker = noteProviderResult(yahooBreaker, false, input.now);
      yahooMap = null;
    }
  }

  const yahooResolved = mergeProviderPrints(input.tickers, { yahoo: yahooMap, twelve: null }, input.saved, input.pending);
  const missing = input.tickers.filter((ticker) => {
    const row = yahooResolved.rows[ticker];
    return !row || row.source === "Last good";
  });

  if (input.twelve && missing.length && !breakerIsOpen(twelveBreaker, input.now)) {
    try {
      twelveMap = await withTimeout(input.twelve(missing), input.twelveTimeoutMs ?? TWELVE_TIMEOUT_MS);
      const hit = missing.some((ticker) => twelveMap && twelveMap[ticker]);
      twelveBreaker = noteProviderResult(twelveBreaker, hit || Object.keys(twelveMap).length > 0, input.now);
    } catch {
      twelveBreaker = noteProviderResult(twelveBreaker, false, input.now);
      twelveMap = null;
    }
  }

  const merged = mergeProviderPrints(
    input.tickers,
    { yahoo: yahooMap, twelve: twelveMap },
    input.saved,
    input.pending
  );
  const saved: Record<string, SavedPrint | undefined> = { ...input.saved };
  for (const ticker of input.tickers) {
    const row = merged.rows[ticker];
    if (row && row.price > 0 && row.source !== "Last good") saved[ticker] = row;
  }
  return {
    rows: merged.rows,
    pending: merged.pending,
    saved,
    yahooBreaker,
    twelveBreaker,
  };
}
