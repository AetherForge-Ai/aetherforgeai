import { NextResponse } from "next/server";
import { PUBLIC_CRYPTO_SOURCE, PUBLIC_EQUITY_SOURCE } from "@/lib/data-sources";
import { loadPublicTicker } from "@/lib/public-ticker";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/ticker — the single public tape.
 * Public provider names come from the shared data-source copy.
 * A symbol with no quote is omitted. Demo snapshots are not served and are
 * not labelled LIVE.
 */
export async function GET() {
  const feed = await loadPublicTicker();

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
