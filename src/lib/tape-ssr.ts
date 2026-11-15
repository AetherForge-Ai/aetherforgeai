import buildSnapshot from "@/data/tape-build-snapshot.json";
import { parseQuoteTime } from "@/lib/market-freshness";
import { keepAlive } from "@/lib/keep-alive.server";
import { loadPublicTickerBounded } from "@/lib/public-ticker";
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

/**
 * A finished background read fills the colo copy the next request reads.
 * A body the ticker route stored (version > 0) is left alone.
 */
async function publishTape(feed: TickerTapeFeed | null): Promise<void> {
  const quoted = quotedTape(feed);
  if (!quoted) return;
  await edgeJsonPut("equity", { nzx: quoted.rows.nzx, asx: quoted.rows.asx });
  const existing = await edgeJsonGet<{ version?: number }>("body", BODY_MS).catch(() => null);
  if (existing && typeof existing.version === "number" && existing.version > 0) return;
  await edgeJsonPut("body", { body: { ok: true, data: quoted }, headers: {}, version: 0 });
}

/** Prices shipped with the build. Used when the colo copy and the live read are both missing. */
export function bundledTape(): TickerTapeFeed | null {
  return quotedTape(buildSnapshot as TickerTapeFeed);
}

/**
 * First HTML uses a tape that is already in hand. The stored colo copy wins,
 * then a live read that has already finished, then the build snapshot. The
 * live lookup is loadPublicTickerBounded() — the 1800 ms public-ticker bound.
 * keepAlive is registered before any await, so a read that finishes during the
 * colo lookup is still held on Workers while publishTape writes.
 * SSR_LIVE_WAIT_MS caps only the foreground wait, and only when nothing is in hand.
 */
export async function loadRequestTape(): Promise<TickerTapeFeed | null> {
  let settled: TickerTapeFeed | null | undefined;
  const live = loadPublicTickerBounded()
    .then(async (feed) => {
      settled = feed;
      await publishTape(feed).catch(() => undefined);
      return feed;
    })
    .catch(() => {
      settled = null;
      return null;
    });
  void keepAlive(live);
  const stored = quotedTape(await loadServerTape());
  if (stored) return stored;
  if (settled !== undefined) {
    const fresh = quotedTape(settled);
    if (fresh) return fresh;
  }
  const built = bundledTape();
  if (built) return built;
  const raced = await Promise.race([
    live,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), SSR_LIVE_WAIT_MS)),
  ]);
  return quotedTape(raced);
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
