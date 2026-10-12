import { fetchCryptoQuotes, fetchLiveQuotes } from "@/lib/market-data";
import { TICKER_TAPE, composeTickerTape, type TickerTapeFeed } from "@/lib/ticker-feed";
import { PUBLIC_EQUITY_SOURCE, publicCryptoSourcesLabel } from "@/lib/data-sources";
import { sourceLabel } from "@/lib/crypto-price-chain";
import { publicSourceAllowed } from "@/lib/swyftx-display";

/** The public tape. Same quotes as GET /api/ticker. A missing symbol is omitted. */
export async function loadPublicTicker(): Promise<TickerTapeFeed> {
  const asOf = new Date().toISOString();
  const equitySymbols = [...TICKER_TAPE.nzx, ...TICKER_TAPE.asx].map((row) => row.symbol);
  const cryptoSymbols = TICKER_TAPE.crypto.map((row) => row.symbol);

  const [cryptoQuotes, equityQuotes] = await Promise.all([
    fetchCryptoQuotes(cryptoSymbols).catch((err) => {
      console.error("[ticker] Crypto live fetch failed:", err);
      return {} as Awaited<ReturnType<typeof fetchCryptoQuotes>>;
    }),
    fetchLiveQuotes(equitySymbols).catch((err) => {
      console.error("[ticker] Equity live fetch failed:", err);
      return {} as Awaited<ReturnType<typeof fetchLiveQuotes>>;
    }),
  ]);

  const cryptoProvider = publicCryptoSourcesLabel();
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
