import { parseQuoteTime } from "@/lib/market-freshness";
import { edgeJsonGet } from "@/lib/ticker-serve";
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

function asRows(value: unknown): TapeRow[] {
  if (!Array.isArray(value)) return [];
  const out: TapeRow[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Partial<TapeRow>;
    if (typeof row.symbol !== "string" || !row.symbol) continue;
    out.push({
      symbol: row.symbol,
      name: typeof row.name === "string" && row.name ? row.name : row.symbol,
      price: typeof row.price === "number" && Number.isFinite(row.price) ? row.price : 0,
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

function quoteRow(quote: { symbol: string; quotedAt: string | null; price: number | null; changePct: number | null }): TapeRow {
  const nz = quote.symbol.endsWith(".NZ");
  return {
    symbol: quote.symbol,
    name: quote.symbol,
    price: typeof quote.price === "number" && quote.price > 0 ? quote.price : 0,
    change: typeof quote.changePct === "number" ? quote.changePct : null,
    currency: nz ? "NZD" : "AUD",
    provider: "",
    asOf: quote.quotedAt ?? "",
    quotedAt: quote.quotedAt,
  };
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
    return tapeFeedFromStored({
      nzx: quotes.filter((quote) => quote.symbol.endsWith(".NZ")).map(quoteRow),
      asx: quotes.filter((quote) => quote.symbol.endsWith(".AX")).map(quoteRow),
    });
  } catch {
    return null;
  }
}
