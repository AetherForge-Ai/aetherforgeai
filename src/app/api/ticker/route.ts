import { NextResponse } from "next/server";
import { PUBLIC_EQUITY_SOURCE, publicCryptoSourcesLabel } from "@/lib/data-sources";
import { cryptoVenueForLabel } from "@/lib/crypto-price-chain";
import { readCryptoSnapshot, snapshotHeaders } from "@/lib/crypto-snapshot";
import { loadPublicTicker } from "@/lib/public-ticker";
import { snapshotFloorCookie, snapshotFloorFrom } from "@/lib/snapshot-floor";
import { readFeedForce } from "@/lib/feed-freshness-hook";
import { feedOffFromCookieHeader } from "@/lib/test-hooks";
import { currentUserMayUseTestHooks } from "@/lib/test-hooks.server";

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
  // Goal b20 SECURITY: the cookie only counts for an allow-listed test account.
  const cookie = req.headers.get("cookie");
  // b31 REG-1: the session lookup runs only when the test cookie is present.
  const feedOff = feedOffFromCookieHeader(cookie);
  const hooksAllowed = feedOff || (cookie || "").includes("af_test_feed") ? await currentUserMayUseTestHooks() : false;
  if (feedOff && hooksAllowed) {
    return NextResponse.json(
      { ok: false, error: "Feed switched off in test mode" },
      { status: 503, headers: { "Cache-Control": "no-store", "CDN-Cache-Control": "no-store" } }
    );
  }
  // b35 H-1 (GOAL-LOCK #25): read the snapshot ONCE (with this client's version floor) and build
  // both the crypto rows and the x-af-snapshot headers from it. TT saw rows from one read and
  // headers from another (v30 headers over an empty list; no headers on a cold isolate).
  const floor = snapshotFloorFrom(req);
  const snap = await Promise.race([readCryptoSnapshot(undefined, { floor }).catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), 2_000))]);
  const feed = await loadPublicTicker({ snapshot: snap });
  // G-05: named stale/failed mark for this browser. Omitted unless the account is allow-listed.
  const testFeedForce = readFeedForce(cookie, hooksAllowed);
  // Never a 200 with an empty crypto list: no copy anywhere is a 503 the tape retries.
  if (!feed.rows.crypto.length && !snap) {
    return NextResponse.json(
      { ok: false, error: "Crypto prices are not available yet. Retrying shortly." },
      { status: 503, headers: { "Cache-Control": "no-store", "CDN-Cache-Control": "no-store", "Retry-After": "5" } }
    );
  }
  const stale = !!snap && (!feed.rows.crypto.length || !feed.live.crypto);

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
        ...(testFeedForce ? { testFeedForce } : {}),
        ...(stale ? { stale: true } : {}),
      },
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "CDN-Cache-Control": "no-store",
        ...snapshotHeaders(snap),
        ...(stale ? { "x-af-snapshot-stale": "1" } : {}),
        ...(snap ? { "Set-Cookie": snapshotFloorCookie(Math.max(snap.version, floor)) } : {}),
      },
    }
  );
}
