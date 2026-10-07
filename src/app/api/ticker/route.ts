import { NextResponse } from "next/server";
import { fetchCryptoQuotes, fetchLiveQuotes } from "@/lib/market-data";
import {
  TICKER_TAPE,
  composeTickerTape,
} from "@/lib/ticker-feed";
import { PUBLIC_CRYPTO_SOURCE, PUBLIC_EQUITY_SOURCE } from "@/lib/data-sources";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/ticker — the single public tape.
 * Public provider names come from the shared data-source copy.
 * A symbol with no quote is omitted. Demo snapshots are not served and are
 * not labelled LIVE.
 */
export async function GET() {
  const asOf = new Date().toISOString();
  const equitySymbols = [...TICKER_TAPE.nzx, ...TICKER_TAPE.asx].map((row) => row.symbol);
  const cryptoSymbols = TICKER_TAPE.crypto.map((row) => row.symbol);

  let equityQuotes: Awaited<ReturnType<typeof fetchLiveQuotes>> = {};
  let cryptoQuotes: Awaited<ReturnType<typeof fetchCryptoQuotes>> = {};

  try {
    cryptoQuotes = await fetchCryptoQuotes(cryptoSymbols);
  } catch (err) {
    console.error("[api/ticker] Crypto live fetch failed:", err);
  }

  try {
    equityQuotes = await fetchLiveQuotes(equitySymbols);
  } catch (err) {
    console.error("[api/ticker] Equity live fetch failed:", err);
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

  console.log(
    `[api/ticker] Served rows — crypto ${feed.live.crypto ? "live" : "quiet"} (${feed.rows.crypto.length}), equities ${feed.live.equities ? "live" : "quiet"} (${feed.rows.nzx.length + feed.rows.asx.length})`
  );

  return NextResponse.json(
    {
      ok: true,
      data: {
        ...feed,
        sources: {
          equities: PUBLIC_EQUITY_SOURCE,
          crypto: PUBLIC_CRYPTO_SOURCE,
          nzx: "https://www.nzx.com/markets/NZSX",
          asx: "https://www.asx.com.au/markets/company/TLX",
          cryptoVenue: "https://www.coingecko.com/",
        },
      },
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "CDN-Cache-Control": "no-store",
      },
    }
  );
}
