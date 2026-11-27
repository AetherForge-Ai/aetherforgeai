import buildSnapshot from "@/data/tape-build-snapshot.json";
import { equitySessionDate, expectedEquityCloseIso, parseQuoteTime, tapeCloseIso } from "@/lib/market-freshness";
import { keepAlive } from "@/lib/keep-alive.server";
import { loadPublicTickerBounded, tickerEquityQuotes } from "@/lib/public-ticker";
import { edgeJsonGet, edgeJsonPut } from "@/lib/ticker-serve";
import type { TapeRow, TickerTapeFeed } from "@/lib/ticker-feed";

/**
 * H-1-TAPE-SSR: the header tape's first HTML used to render with empty rows, so a
 * shut session said "Close unavailable" until the browser fetched /api/ticker.
 * This reads the same last-good body and equity rows that route stores
 * (ticker-serve). A miss is null — the tape then uses the neutral fallback.
 */

const BODY_MS = 200;
const EQUITY_MS = 200;
const QUOTE_MS = 200;
/**
 * H-1-TAPE-SSR-3: how long the first HTML waits when no stored tape and no
 * build snapshot are in hand. The background refresh uses the public ticker's
 * own 1800 ms bound. This number does not shorten that lookup.
 */
export const SSR_LIVE_WAIT_MS = 250;

/** A tape row with no real print is omitted. Zero is not a price. */
function positivePrice(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function asRows(value: unknown): TapeRow[] {
  if (!Array.isArray(value)) return [];
  const out: TapeRow[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Partial<TapeRow>;
    const price = positivePrice(row.price);
    if (typeof row.symbol !== "string" || !row.symbol || price == null) continue;
    out.push({
      symbol: row.symbol,
      name: typeof row.name === "string" && row.name ? row.name : row.symbol,
      price,
      change: typeof row.change === "number" && Number.isFinite(row.change) ? row.change : null,
      currency: typeof row.currency === "string" && row.currency ? row.currency : "NZD",
      provider: typeof row.provider === "string" ? row.provider : "",
      asOf: typeof row.asOf === "string" ? row.asOf : "",
      quotedAt: typeof row.quotedAt === "string" && row.quotedAt ? row.quotedAt : null,
    });
  }
  return out;
}

function feedFromRows(nzx: TapeRow[], asx: TapeRow[], crypto: TapeRow[], rest?: Partial<TickerTapeFeed>): TickerTapeFeed | null {
  if (!nzx.length && !asx.length) return null;
  if (![...nzx, ...asx].some((row) => parseQuoteTime(row.quotedAt))) return null;
  return {
    rows: { nzx, asx, crypto },
    live: { crypto: !!rest?.live?.crypto, equities: !!rest?.live?.equities },
    providers: {
      equities: rest?.providers?.equities ?? null,
      crypto: rest?.providers?.crypto ?? null,
    },
    asOf: typeof rest?.asOf === "string" ? rest.asOf : null,
  };
}

/** A ticker-serve cache value: the last reply `{ body: { data } }`, or `{ nzx, asx }` rows. */
export function tapeFeedFromStored(value: unknown): TickerTapeFeed | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const candidates: unknown[] = [];
  if (record.body && typeof record.body === "object") candidates.push((record.body as { data?: unknown }).data);
  if (record.data && typeof record.data === "object") candidates.push(record.data);
  if (record.nzx || record.asx) candidates.push({ rows: { nzx: record.nzx, asx: record.asx, crypto: [] } });
  candidates.push(record);
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const bag = candidate as Partial<TickerTapeFeed> & { rows?: { nzx?: unknown; asx?: unknown; crypto?: unknown } };
    if (!bag.rows || typeof bag.rows !== "object") continue;
    const feed = feedFromRows(asRows(bag.rows.nzx), asRows(bag.rows.asx), asRows(bag.rows.crypto), bag);
    if (feed) return feed;
  }
  return null;
}

function quoteRow(quote: { symbol: string; quotedAt: string | null; price: number | null; changePct: number | null }): TapeRow | null {
  const price = positivePrice(quote.price);
  if (price == null) return null;
  const nz = quote.symbol.endsWith(".NZ");
  return {
    symbol: quote.symbol,
    name: quote.symbol,
    price,
    change: typeof quote.changePct === "number" ? quote.changePct : null,
    currency: nz ? "NZD" : "AUD",
    provider: "",
    asOf: quote.quotedAt ?? "",
    quotedAt: quote.quotedAt,
  };
}

/** A price with no vendor quote time is not shown. The close label is that time. */
function stampedRows(rows: TapeRow[]): TapeRow[] {
  return rows.filter((row) => positivePrice(row.price) != null && parseQuoteTime(row.quotedAt) != null);
}

/** A feed counts only when an equity row has a real price and a quote time. */
export function quotedTape(feed: TickerTapeFeed | null): TickerTapeFeed | null {
  if (!feed?.rows) return null;
  const nzx = stampedRows(feed.rows.nzx ?? []);
  const asx = stampedRows(feed.rows.asx ?? []);
  const crypto = stampedRows(feed.rows.crypto ?? []);
  if (!nzx.length && !asx.length) return null;
  return { ...feed, rows: { nzx, asx, crypto } };
}

/** Newest NZX/ASX close date this isolate has seen from the ticker, YYYY-MM-DD. */
let latestTickerCloseIso: string | null = null;

function noteTickerClose(iso: string | null | undefined): void {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return;
  if (!latestTickerCloseIso || iso > latestTickerCloseIso) latestTickerCloseIso = iso;
}

/** Vitest only. Undefined in production so the reset is not a runtime API. */
export const __test =
  process.env.NODE_ENV === "test"
    ? {
        resetTapeCloseMemory() {
          latestTickerCloseIso = null;
        },
      }
    : undefined;

function closeIsoOf(feed: TickerTapeFeed | null | undefined, now = new Date()): string | null {
  if (!feed?.rows) return null;
  return tapeCloseIso(feed.rows, now);
}

/**
 * A close remembered on this isolate. Judged against both NZX and ASX.
 * Weekends only: there is no holiday calendar, so a holiday weekday can still
 * look like a session until the ticker close moves. A close from a later clock
 * (tests moving time backwards) is dropped for either venue.
 */
function rememberedClose(now: Date): string | null {
  if (!latestTickerCloseIso) return null;
  if (latestTickerCloseIso > equitySessionDate("NZX", now)) return null;
  if (latestTickerCloseIso > equitySessionDate("ASX", now)) return null;
  return latestTickerCloseIso;
}

/**
 * Newest of the ticker/last-good close and the expected last completed
 * NZX/ASX session. A stale quote is not authority to print that older date.
 */
function authorityIso(observed: string | null, now: Date): string {
  const floor = expectedEquityCloseIso(now);
  const seen = newestClose([observed, rememberedClose(now)]);
  if (seen && seen > floor) return seen;
  return floor;
}

function newestClose(values: Array<string | null | undefined>): string | null {
  let best: string | null = null;
  for (const value of values) {
    if (!value) continue;
    if (!best || value > best) best = value;
  }
  return best;
}

type EquityQuote = { symbol: string; quotedAt: string | null; price: number | null; changePct: number | null };

/** The ticker's own equity quotes, as a tape. Crypto is filled by the live read. */
function feedFromEquityQuotes(quotes: EquityQuote[]): TickerTapeFeed | null {
  const row = (quote: EquityQuote): TapeRow | null => {
    const price = positivePrice(quote.price);
    if (!quote.symbol || price == null || !parseQuoteTime(quote.quotedAt)) return null;
    const nz = quote.symbol.endsWith(".NZ");
    return {
      symbol: quote.symbol,
      name: quote.symbol,
      price,
      change: typeof quote.changePct === "number" && Number.isFinite(quote.changePct) ? quote.changePct : null,
      currency: nz ? "NZD" : "AUD",
      provider: "",
      asOf: quote.quotedAt ?? "",
      quotedAt: quote.quotedAt,
    };
  };
  const nzx = quotes.filter((quote) => quote.symbol.endsWith(".NZ")).map(row).filter((item) => item != null);
  const asx = quotes.filter((quote) => quote.symbol.endsWith(".AX")).map(row).filter((item) => item != null);
  return feedFromRows(nzx, asx, []);
}

/**
 * Cache-busted (?cb=) and no-store documents must not render a stale close.
 * Outside a request (unit tests, scripts) this is false unless the caller opts in.
 */
export async function requestTapeMustBeFresh(): Promise<boolean> {
  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    if (h.get("x-af-tape-fresh") === "1") return true;
    const cache = `${h.get("cache-control") ?? ""} ${h.get("cdn-cache-control") ?? ""}`.toLowerCase();
    if (/\bno-store\b/.test(cache)) return true;
    const search = `${h.get("x-af-search") ?? ""} ${h.get("next-url") ?? ""}`;
    if (/(?:^|[?&])cb=/.test(search)) return true;
  } catch {
    return false;
  }
  return false;
}

/**
 * A finished background read fills the colo copy the next request reads.
 * A body the ticker route stored (version > 0) is left alone when its close
 * is current. A close date that has moved forward replaces that body.
 */
async function publishTape(feed: TickerTapeFeed | null): Promise<void> {
  const quoted = quotedTape(feed);
  if (!quoted) return;
  noteTickerClose(closeIsoOf(quoted));
  await edgeJsonPut("equity", { nzx: quoted.rows.nzx, asx: quoted.rows.asx });
  const existing = await edgeJsonGet<{ version?: number }>("body", BODY_MS).catch(() => null);
  const version = existing && typeof existing.version === "number" ? existing.version : 0;
  const existingIso = closeIsoOf(quotedTape(tapeFeedFromStored(existing)));
  const nextIso = closeIsoOf(quoted);
  if (version > 0 && !(existingIso && nextIso && nextIso > existingIso)) return;
  await edgeJsonPut("body", { body: { ok: true, data: quoted }, headers: {}, version: version > 0 ? version : 0 });
}

/** Prices shipped with the build. Used when the colo copy and the live read are both missing. */
export function bundledTape(): TickerTapeFeed | null {
  return quotedTape(buildSnapshot as TickerTapeFeed);
}

/**
 * First HTML uses a tape that is already in hand, unless that tape's close
 * date is older than the latest NZX/ASX ticker close (or, with the session
 * shut, older than the current session). A stale colo body, module quote, or
 * build snapshot is not rendered. The live lookup is loadPublicTickerBounded()
 * — the 1800 ms public-ticker bound. keepAlive is registered before any await,
 * so a read that finishes during the colo lookup is still held on Workers
 * while publishTape writes. SSR_LIVE_WAIT_MS caps only the foreground wait,
 * and only when nothing current is in hand. On that timeout the ticker's own
 * close is used, or the date is omitted. An older date is never printed.
 * Cache-busted (?cb=) and no-store requests follow the same rule.
 */
export async function loadRequestTape(opts?: { fresh?: boolean }): Promise<TickerTapeFeed | null> {
  const now = () => new Date();
  let settled: TickerTapeFeed | null | undefined;
  let quoteRows: EquityQuote[] | undefined;
  const live = loadPublicTickerBounded()
    .then(async (feed) => {
      settled = feed;
      noteTickerClose(closeIsoOf(quotedTape(feed)));
      await publishTape(feed).catch(() => undefined);
      return feed;
    })
    .catch(() => {
      settled = null;
      return null;
    });
  void keepAlive(live);
  const quotesP = tickerEquityQuotes()
    .then((rows) => {
      quoteRows = rows;
      noteTickerClose(closeIsoOf(feedFromEquityQuotes(rows)));
      return rows;
    })
    .catch(() => {
      // A rejection must settle the wait. Leaving quoteRows unset makes the
      // loop re-await an already-finished promise and busy-spin until the cap.
      quoteRows = [];
      return [] as EquityQuote[];
    });
  // Start the colo read before the first await. A live result that resolves
  // during that read must not take the body lock the colo read is holding.
  const storedPromise = loadServerTape();

  const fresh = opts?.fresh ?? (await requestTapeMustBeFresh());
  const stored = quotedTape(await storedPromise);

  const observed = () =>
    newestClose([
      closeIsoOf(feedFromEquityQuotes(quoteRows ?? [])),
      settled !== undefined ? closeIsoOf(quotedTape(settled)) : null,
    ]);

  const accept = (feed: TickerTapeFeed | null): TickerTapeFeed | null => {
    const quoted = quotedTape(feed);
    if (!quoted) return null;
    const iso = closeIsoOf(quoted, now());
    const auth = authorityIso(observed(), now());
    // Older than the expected last completed session, or older than a newer
    // ticker close. cb / no-store (fresh) uses the same floor: never print it.
    if (iso && iso < auth) return null;
    if (fresh && iso && iso < auth) return null;
    return quoted;
  };

  // Ticker quotes already in hand win when their close is the same day or newer,
  // so SSR prices match /api/ticker without waiting out the colo snapshot.
  const storedOk = accept(stored);
  const tickerNow = quoteRows ? accept(feedFromEquityQuotes(quoteRows)) : null;
  if (tickerNow) {
    const tickerIso = closeIsoOf(tickerNow, now());
    const storedIso = closeIsoOf(stored, now());
    const storedWins = !!(storedOk && storedIso && tickerIso && tickerIso < storedIso);
    if (!storedWins) {
      if (storedIso && tickerIso && tickerIso > storedIso) await publishTape(tickerNow).catch(() => undefined);
      return tickerNow;
    }
  }

  // Current colo snapshot, including while the cash session is open.
  // A body older than the previous completed session is already rejected above.
  if (storedOk) return storedOk;

  if (settled !== undefined) {
    const liveOk = accept(settled);
    if (liveOk) return liveOk;
  }

  const builtOk = accept(bundledTape());
  if (builtOk) return builtOk;

  if (settled === undefined || quoteRows === undefined) {
    const pending = new Promise<never>(() => undefined);
    await Promise.race([
      (async () => {
        while (settled === undefined || quoteRows === undefined) {
          if (quoteRows && accept(feedFromEquityQuotes(quoteRows))) return;
          if (settled !== undefined && accept(settled)) return;
          if (settled !== undefined && quoteRows !== undefined) return;
          // An already-finished side must not resolve this race or the loop spins.
          await Promise.race([
            quoteRows === undefined ? quotesP.then(() => undefined, () => undefined) : pending,
            settled === undefined ? live.then(() => undefined, () => undefined) : pending,
          ]);
        }
      })(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), SSR_LIVE_WAIT_MS)),
    ]);
  }

  const tickerLate = accept(feedFromEquityQuotes(quoteRows ?? []));
  if (tickerLate) return tickerLate;
  if (settled !== undefined) {
    const liveOk = accept(settled);
    if (liveOk) return liveOk;
  }
  // Fresh close was not available within the cap. Never print an older date.
  return null;
}

/**
 * Last tape the colo served. Body first (the /api/ticker payload), then the
 * equity-row copy, then this isolate's equity quotes. No live vendor fetch.
 */
export async function loadServerTape(): Promise<TickerTapeFeed | null> {
  const storedBody = await edgeJsonGet<unknown>("body", BODY_MS).catch(() => null);
  const fromBody = tapeFeedFromStored(storedBody);
  if (fromBody) return fromBody;
  const storedRows = await edgeJsonGet<unknown>("equity", EQUITY_MS).catch(() => null);
  const fromRows = tapeFeedFromStored(storedRows);
  if (fromRows) return fromRows;
  try {
    const quotes = await Promise.race([
      import("@/lib/public-ticker").then((mod) => mod.tickerEquityQuotes()),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), QUOTE_MS)),
    ]);
    if (!quotes?.length) return null;
    const row = (quote: (typeof quotes)[number]) => quoteRow(quote);
    return tapeFeedFromStored({
      nzx: quotes.filter((quote) => quote.symbol.endsWith(".NZ")).map(row).filter((item) => item != null),
      asx: quotes.filter((quote) => quote.symbol.endsWith(".AX")).map(row).filter((item) => item != null),
    });
  } catch {
    return null;
  }
}
