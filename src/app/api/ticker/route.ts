import { NextResponse } from "next/server";
import { PUBLIC_EQUITY_SOURCE, publicCryptoSourcesLabel } from "@/lib/data-sources";
import { cryptoVenueForLabel } from "@/lib/crypto-price-chain";
import { readCryptoSnapshot, snapshotHeaders } from "@/lib/crypto-snapshot";
import { loadPublicTicker } from "@/lib/public-ticker";
import { COLD_START_READ_MS, pickServedSnapshot, TICKER_ROUTE_DEADLINE_MS } from "@/lib/ticker-serve";
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
  // b37 REG-1: the whole build is bounded. A hang serves this isolate's last good answer (stale),
  // never a 30 s wait; only a cold isolate with no copy anywhere answers 503.
  const floor = snapshotFloorFrom(req);
  const built = await Promise.race([
    buildTicker(floor, cookie, hooksAllowed).catch(() => null),
    new Promise<null>((r) => setTimeout(() => r(null), TICKER_ROUTE_DEADLINE_MS)),
  ]);
  if (!built) {
    if (lastGoodResponse) {
      return NextResponse.json(lastGoodResponse.body, {
        headers: { ...lastGoodResponse.headers, "x-af-snapshot-stale": "1", "Set-Cookie": snapshotFloorCookie(Math.max(lastGoodResponse.version, floor)) },
      });
    }
    return noCopyResponse();
  }
  return built;
}

type CryptoSnap = NonNullable<Awaited<ReturnType<typeof readCryptoSnapshot>>>;
/** b37 H-1: the newest snapshot this isolate has served; a slow or failed read never means 503. */
let lastGoodSnap: CryptoSnap | null = null;
let lastGoodResponse: { body: unknown; headers: Record<string, string>; version: number } | null = null;

function noCopyResponse() {
  return NextResponse.json(
    { ok: false, error: "Crypto prices are not available yet. Retrying shortly." },
    { status: 503, headers: { "Cache-Control": "no-store", "CDN-Cache-Control": "no-store", "Retry-After": "5" } }
  );
}

async function buildTicker(floor: number, cookie: string | null, hooksAllowed: boolean) {
  // b35 H-1 (GOAL-LOCK #25): read the snapshot ONCE (with this client's version floor) and build
  // both the crypto rows and the x-af-snapshot headers from it.
  const read = await Promise.race([readCryptoSnapshot(undefined, { floor }).catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), 2_000))]);
  // b38 (Chief ruling 2): a cold isolate loads the last saved snapshot from durable storage (longer
  // bounded read) and serves it as a 200 marked x-af-snapshot-stale with its true time. Only when no
  // snapshot exists at all is the answer a 503 + Retry-After (the tape shows "Prices loading").
  const coldStart = !lastGoodSnap;
  const coldRead = !read && coldStart ? await readCryptoSnapshot(COLD_START_READ_MS).catch(() => null) : null;
  // b38 (Chief ruling 3): step-backs. A browser sends the af_snap_v floor cookie, so it is never served
  // a version below one it has seen (floor read above, plus this isolate's newest copy). A client with
  // no cookie and no x-af-snapshot-floor header (curl, scripts) may see an older version from another
  // isolate; that is accepted by design and only for no-cookie clients.
  const snap = pickServedSnapshot(read ?? coldRead, lastGoodSnap);
  if (snap) lastGoodSnap = snap;
  const feed = await loadPublicTicker({ snapshot: snap });
  // G-05: named stale/failed mark for this browser. Omitted unless the account is allow-listed.
  const testFeedForce = readFeedForce(cookie, hooksAllowed);
  // Never a 200 with an empty crypto list: no copy anywhere is a 503 the tape retries.
  if (!feed.rows.crypto.length && !snap) return noCopyResponse();
  const stale = !!snap && (coldStart || !feed.rows.crypto.length || !feed.live.crypto);

  console.log(
    `[api/ticker] Served rows — crypto ${feed.live.crypto ? "live" : "quiet"} (${feed.rows.crypto.length}), equities ${feed.live.equities ? "live" : "quiet"} (${feed.rows.nzx.length + feed.rows.asx.length})`
  );

  const body = {
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
    };
  const headers: Record<string, string> = {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "CDN-Cache-Control": "no-store",
        // b37 H-1: every 200 names its snapshot (version 0 = built without a stored list).
        ...(snap ? snapshotHeaders(snap) : { "x-af-snapshot-at": feed.asOf || new Date().toISOString(), "x-af-snapshot-version": "0" }),
        ...(stale ? { "x-af-snapshot-stale": "1" } : {}),
  };
  if (snap && !stale && !testFeedForce) lastGoodResponse = { body, headers, version: snap.version };
  return NextResponse.json(body, {
    headers: { ...headers, ...(snap ? { "Set-Cookie": snapshotFloorCookie(Math.max(snap.version, floor)) } : {}) },
  });
}
