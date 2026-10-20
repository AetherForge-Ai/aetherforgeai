import { fetchLiveQuotes } from "@/lib/market-data";
import { TICKER_TAPE, composeTickerTape, type TickerTapeFeed } from "@/lib/ticker-feed";
import { PUBLIC_EQUITY_SOURCE, publicCryptoSourcesLabel } from "@/lib/data-sources";
import { sourceLabel } from "@/lib/crypto-price-chain";
import { publicSourceAllowed } from "@/lib/swyftx-display";

/** The public tape. Same quotes as GET /api/ticker. A missing symbol is omitted. */
/** b31 REG-1: hard cap per tape part. */
export const TICKER_PART_TIMEOUT_MS = 1_500;
let lastGoodCrypto: Record<string, any> | null = null;
let lastGoodEquity: Record<string, any> | null = null;

function boundedPart<T>(work: Promise<T | null>): Promise<T | null> {
  return Promise.race([work, new Promise<null>((resolve) => setTimeout(() => resolve(null), TICKER_PART_TIMEOUT_MS))]);
}

export interface PublicTickerOptions {
  /**
   * b35 H-1 (GOAL-LOCK #25): the request's one snapshot read. When given, the crypto rows come from
   * it, so the rows and the x-af-snapshot headers always name the same list.
   */
  snapshot?: { at: string; coins: import("@/lib/crypto-market").CoinMarket[] } | null;
  /** b40 REG-1: skip the live equity fetch (deadline fallback); the last good equities are used. */
  skipEquityFetch?: boolean;
  /**
   * b50 P1: the request's one equity fetch, started at the top of GET /api/ticker before the snapshot
   * reads spend the Worker's subrequest budget. When given, no second fetch is made.
   */
  equityFresh?: Promise<Record<string, any> | null>;
}

const EDGE_EQUITY_KEY = "https://af-internal.invalid/ticker-equity-last-good";
function equityCache(): Cache | null {
  try {
    return (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default ?? null;
  } catch {
    return null;
  }
}
/** b41 P3: the colo's last good equity quotes (bounded read; null when none or slow). */
async function edgeEquityGet(ms = 150): Promise<Record<string, unknown> | null> {
  const cache = equityCache();
  if (!cache) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const hit = await Promise.race([cache.match(EDGE_EQUITY_KEY), new Promise<undefined>((r) => (timer = setTimeout(() => r(undefined), ms)))]);
    if (!hit) return null;
    const v = (await hit.json()) as Record<string, unknown>;
    return v && typeof v === "object" && Object.keys(v).length ? v : null;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
let lastEquityPut = 0;
async function edgeEquityPut(quotes: unknown): Promise<void> {
  const cache = equityCache();
  if (!cache || Date.now() - lastEquityPut < 30_000) return;
  lastEquityPut = Date.now();
  try {
    await cache.put(EDGE_EQUITY_KEY, new Response(JSON.stringify(quotes), { headers: { "Content-Type": "application/json", "Cache-Control": "max-age=86400" } }));
  } catch {
    /* best effort */
  }
}

/** b41 P3: newest equity quote time this isolate (or the colo copy) holds, for /status. */
export async function lastGoodEquityAt(): Promise<string | null> {
  const quotes = (lastGoodEquity ?? (await edgeEquityGet(200))) as Record<string, { quotedAt?: string | null }> | null;
  let best: string | null = null;
  for (const q of Object.values(quotes ?? {})) {
    const t = q?.quotedAt;
    if (t && Number.isFinite(Date.parse(t)) && (!best || t > best)) best = t;
  }
  return best;
}

export async function loadPublicTicker(opts: PublicTickerOptions = {}): Promise<TickerTapeFeed> {
  const asOf = new Date().toISOString();
  const equitySymbols = [...TICKER_TAPE.nzx, ...TICKER_TAPE.asx].map((row) => row.symbol);
  const cryptoSymbols = TICKER_TAPE.crypto.map((row) => row.symbol);

  const { snapshotQuotesForSymbols, quotesFromCoins } = await import("@/lib/crypto-board-store");
  const fromSnapshot = opts.snapshot?.coins.length ? quotesFromCoins(opts.snapshot.coins, opts.snapshot.at, cryptoSymbols) : null;
  // b31 REG-1: each part waits at most TICKER_PART_TIMEOUT_MS; a timeout serves the last-good part.
  const [cryptoFresh, equityFresh] = await Promise.all([
    fromSnapshot && Object.keys(fromSnapshot).length
      ? Promise.resolve(fromSnapshot)
      : boundedPart(
      snapshotQuotesForSymbols(cryptoSymbols).catch((err) => {
        console.error("[ticker] Crypto snapshot read failed:", err instanceof Error ? err.message.slice(0, 120) : "failed");
        return null;
      })
    ),
    // b40 REG-1: the deadline fallback skips the live equity fetch and serves the last good equities.
    opts.equityFresh ? boundedPart(opts.equityFresh.catch(() => null)) : opts.skipEquityFetch ? Promise.resolve(null) : boundedPart(
      fetchLiveQuotes(equitySymbols).catch((err) => {
        console.error("[ticker] Equity live fetch failed:", err instanceof Error ? err.message.slice(0, 120) : "failed");
        return null;
      })
    ),
  ]);
  if (cryptoFresh && Object.keys(cryptoFresh).length) lastGoodCrypto = cryptoFresh;
  // b41 P3 (TT: 43/627 replies lacked NZX/ASX rows): merge per symbol, so a partial or missed equity
  // fetch keeps every symbol's last good quote (with its own quote time). A cold isolate takes the
  // colo's saved copy first.
  if (!lastGoodEquity) lastGoodEquity = (await edgeEquityGet()) as typeof lastGoodEquity;
  if (equityFresh && Object.keys(equityFresh).length) {
    lastGoodEquity = { ...(lastGoodEquity ?? {}), ...equityFresh } as typeof lastGoodEquity;
    void edgeEquityPut(lastGoodEquity);
  }
  const cryptoRaw = (cryptoFresh && Object.keys(cryptoFresh).length ? cryptoFresh : lastGoodCrypto ?? {}) as Awaited<ReturnType<typeof snapshotQuotesForSymbols>>;
  const equityQuotes = (lastGoodEquity ?? equityFresh ?? {}) as Awaited<ReturnType<typeof fetchLiveQuotes>>;
  const cryptoQuotes: Record<string, { price: number; changePct?: number; quotedAt: string | null; source: string; provider: string }> = {};
  for (const [symbol, quote] of Object.entries(cryptoRaw)) {
    cryptoQuotes[symbol] = {
      price: quote.price,
      changePct: quote.changePct,
      quotedAt: quote.quotedAt,
      source: quote.source || "",
      provider: quote.source && publicSourceAllowed(quote.source) ? sourceLabel(quote.source) : "Source unavailable",
    };
  }

  const actualSources = [...new Set(Object.values(cryptoQuotes).map((quote) => quote.source).filter(Boolean))];
  const cryptoProvider = actualSources.length
    ? actualSources.map((source) => sourceLabel(source)).filter(Boolean).join(", ")
    : publicCryptoSourcesLabel();
  const feed = composeTickerTape({
    equityQuotes,
    cryptoQuotes,
    equityProvider: PUBLIC_EQUITY_SOURCE,
    cryptoProvider,
    asOf,
  });
  const label = (rows: typeof feed.rows.nzx, provider: string) =>
    rows.map((row) => ({ ...row, provider }));
  feed.rows.nzx = label(feed.rows.nzx, PUBLIC_EQUITY_SOURCE);
  feed.rows.asx = label(feed.rows.asx, PUBLIC_EQUITY_SOURCE);
  feed.rows.crypto = feed.rows.crypto.map((row) => {
    const source = cryptoQuotes[row.symbol]?.source;
    const provider = source && publicSourceAllowed(source) ? sourceLabel(source) : cryptoProvider;
    return { ...row, provider };
  });
  return feed;
}

/**
 * b50 P1: start the live NZX/ASX fetch once per request, first thing (see equityFresh). Never throws.
 */
export function startEquityFetch(): Promise<Record<string, any> | null> {
  const equitySymbols = [...TICKER_TAPE.nzx, ...TICKER_TAPE.asx].map((row) => row.symbol);
  return fetchLiveQuotes(equitySymbols).catch((err) => {
    console.error("[ticker] Equity live fetch failed:", err instanceof Error ? err.message.slice(0, 120) : "failed");
    return null;
  });
}

/** Home HTML waits only a short time. The client tape still refreshes after that. */
export async function loadPublicTickerBounded(ms = 1800): Promise<TickerTapeFeed | null> {
  return Promise.race([
    loadPublicTicker(),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}
