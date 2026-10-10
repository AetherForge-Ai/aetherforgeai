import { fetchCryptoQuotes, fetchLiveQuotes } from "@/lib/market-data";
import { TICKER_TAPE, composeTickerTape, type TickerTapeFeed } from "@/lib/ticker-feed";
import { PUBLIC_CRYPTO_SOURCE, PUBLIC_EQUITY_SOURCE } from "@/lib/data-sources";

/** The public tape. Same quotes as GET /api/ticker. A missing symbol is omitted. */
export async function loadPublicTicker(): Promise<TickerTapeFeed> {
  const asOf = new Date().toISOString();
  const equitySymbols = [...TICKER_TAPE.nzx, ...TICKER_TAPE.asx].map((row) => row.symbol);
  const cryptoSymbols = TICKER_TAPE.crypto.map((row) => row.symbol);

  let equityQuotes: Awaited<ReturnType<typeof fetchLiveQuotes>> = {};
  let cryptoQuotes: Awaited<ReturnType<typeof fetchCryptoQuotes>> = {};

  try {
    cryptoQuotes = await fetchCryptoQuotes(cryptoSymbols);
  } catch (err) {
    console.error("[ticker] Crypto live fetch failed:", err);
  }

  try {
    equityQuotes = await fetchLiveQuotes(equitySymbols);
  } catch (err) {
    console.error("[ticker] Equity live fetch failed:", err);
  }

  const feed = composeTickerTape({
    equityQuotes,
    cryptoQuotes,
    equityProvider: PUBLIC_EQUITY_SOURCE,
    cryptoProvider: PUBLIC_CRYPTO_SOURCE,
    asOf,
  });
  const label = (rows: typeof feed.rows.nzx, provider: string) =>
    rows.map((row) => ({ ...row, provider }));
  feed.rows.nzx = label(feed.rows.nzx, PUBLIC_EQUITY_SOURCE);
  feed.rows.asx = label(feed.rows.asx, PUBLIC_EQUITY_SOURCE);
  feed.rows.crypto = label(feed.rows.crypto, PUBLIC_CRYPTO_SOURCE);
  return feed;
}

/** Home HTML waits only a short time. The client tape still refreshes after that. */
export async function loadPublicTickerBounded(ms = 4000): Promise<TickerTapeFeed | null> {
  return Promise.race([
    loadPublicTicker(),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}
