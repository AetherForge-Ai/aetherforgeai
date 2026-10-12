import { fetchLiveQuotes } from "@/lib/market-data";
import { TICKER_TAPE, composeTickerTape, type TickerTapeFeed } from "@/lib/ticker-feed";
import { PUBLIC_EQUITY_SOURCE, publicCryptoSourcesLabel } from "@/lib/data-sources";
import { sourceLabel } from "@/lib/crypto-price-chain";
import { publicSourceAllowed } from "@/lib/swyftx-display";

/** The public tape. Same quotes as GET /api/ticker. A missing symbol is omitted. */
export async function loadPublicTicker(): Promise<TickerTapeFeed> {
  const asOf = new Date().toISOString();
  const equitySymbols = [...TICKER_TAPE.nzx, ...TICKER_TAPE.asx].map((row) => row.symbol);
  const cryptoSymbols = TICKER_TAPE.crypto.map((row) => row.symbol);

  const { snapshotQuotesForSymbols } = await import("@/lib/crypto-board-store");
  const [cryptoRaw, equityQuotes] = await Promise.all([
    snapshotQuotesForSymbols(cryptoSymbols).catch((err) => {
      console.error("[ticker] Crypto snapshot read failed:", err instanceof Error ? err.message.slice(0, 120) : "failed");
      return {} as Awaited<ReturnType<typeof snapshotQuotesForSymbols>>;
    }),
    fetchLiveQuotes(equitySymbols).catch((err) => {
      console.error("[ticker] Equity live fetch failed:", err);
      return {} as Awaited<ReturnType<typeof fetchLiveQuotes>>;
    }),
  ]);
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

/** Home HTML waits only a short time. The client tape still refreshes after that. */
export async function loadPublicTickerBounded(ms = 1800): Promise<TickerTapeFeed | null> {
  return Promise.race([
    loadPublicTicker(),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}
