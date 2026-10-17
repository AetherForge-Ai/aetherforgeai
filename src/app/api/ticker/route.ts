import { NextResponse } from "next/server";
import { PUBLIC_EQUITY_SOURCE, publicCryptoSourcesLabel } from "@/lib/data-sources";
import { cryptoVenueForLabel } from "@/lib/crypto-price-chain";
import { loadPublicTicker } from "@/lib/public-ticker";
import { feedOffFromCookieHeader } from "@/lib/test-hooks";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/ticker — the single public tape.
 * Public provider names come from the shared data-source copy.
 * A symbol with no quote is omitted. Demo snapshots are not served and are
 * not labelled LIVE.
 */
export async function GET(req: Request) {
  // Goal b10 G-05 test hook: this browser asked for the feed to be off.
  if (feedOffFromCookieHeader(req.headers.get("cookie"))) {
    return NextResponse.json(
      { ok: false, error: "Feed switched off in test mode" },
      { status: 503, headers: { "Cache-Control": "no-store", "CDN-Cache-Control": "no-store" } }
    );
  }
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
          crypto: feed.providers.crypto || publicCryptoSourcesLabel(),
          nzx: "https://www.nzx.com/markets/NZSX",
          asx: "https://www.asx.com.au/markets/company/TLX",
          cryptoVenue: cryptoVenueForLabel(feed.providers.crypto).href,
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
