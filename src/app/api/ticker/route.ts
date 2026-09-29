import { NextResponse } from "next/server";
import { fetchCryptoQuotes, fetchLiveQuotes } from "@/lib/market-data";
import {
  CRYPTO_TAPE_PROVIDER,
  TICKER_TAPE,
  composeTickerTape,
  equityTapeProvider,
} from "@/lib/ticker-feed";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/ticker — the single public tape.
 * Equities: Twelve Data when that key is configured, otherwise Yahoo Finance.
 * Crypto: the live crypto pipeline (CoinGecko and its live fallbacks).
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

  const equityProvider = equityTapeProvider();
  const feed = composeTickerTape({
    equityQuotes,
    cryptoQuotes,
    equityProvider,
    cryptoProvider: CRYPTO_TAPE_PROVIDER,
    asOf,
  });

  console.log(
    `[api/ticker] Served rows — crypto ${feed.live.crypto ? "live" : "unavailable"} (${feed.rows.crypto.length}), equities ${feed.live.equities ? "live" : "unavailable"} (${feed.rows.nzx.length + feed.rows.asx.length})`
  );

  return NextResponse.json(
    {
      ok: true,
      data: {
        ...feed,
        sources: {
          equities: equityProvider,
          crypto: CRYPTO_TAPE_PROVIDER,
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
