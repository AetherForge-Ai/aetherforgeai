import { NextResponse } from "next/server";
import { PUBLIC_EQUITY_SOURCE, publicCryptoSourcesLabel } from "@/lib/data-sources";
import { cryptoVenueForLabel } from "@/lib/crypto-price-chain";
import { readCryptoSnapshot, snapshotHeaders } from "@/lib/crypto-snapshot";
import { loadPublicTicker } from "@/lib/public-ticker";
import { COLD_START_READ_MS, edgeSnapshotGet, edgeSnapshotPut, pickServedSnapshot, TICKER_ROUTE_DEADLINE_MS, withDeadline } from "@/lib/ticker-serve";
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
  // b37 REG-1: the whole build is bounded. b40 REG-1/H-1 (a): a fallback snapshot read (edge copy,
  // then the durable one) starts alongside the build, so when the 4 s deadline is hit an isolate with
  // no lastGoodResponse still serves a snapshot as a 200 with its true time and the stale mark.
  // A 503 only when no snapshot exists anywhere.
  const t0 = Date.now();
  const floor = snapshotFloorFrom(req);
  // b45 H-1 (a) (TT b41/b42: 10 and 12 × 503 at 3.7–4.2 s with a snapshot present). The real path:
  // after the 3 s deadline the snapshot-only reply was only *started*, then given 600 ms; building it
  // (loadPublicTicker) often took longer, so it fell through to the 503. The snapshot-only reply is now
  // built in parallel from the start, and at the deadline it gets the rest of the 4.6 s budget.
  const fallbackReply = fallbackSnapshot()
    .then((s) => pickServedSnapshot(s, lastGoodSnap))
    .then((snap) => (snap ? snapshotOnlyResponse(snap, floor) : null))
    .catch(() => null);
  const built = await Promise.race([
    buildTicker(floor, cookie, hooksAllowed).catch(() => null),
    new Promise<null>((r) => setTimeout(() => r(null), TICKER_ROUTE_DEADLINE_MS)),
  ]);
  if (built) return built;
  if (lastGoodResponse && lastGoodResponse.version >= floor) {
    return NextResponse.json(lastGoodResponse.body, {
      headers: { ...lastGoodResponse.headers, "x-af-snapshot-stale": "1", "Set-Cookie": snapshotFloorCookie(Math.max(lastGoodResponse.version, floor)) },
    });
  }
  const fromSnap = await withDeadline(fallbackReply, Math.max(300, TICKER_TOTAL_BUDGET_MS - (Date.now() - t0)), null);
  if (fromSnap) return fromSnap;
  if (lastGoodResponse) {
    return NextResponse.json(lastGoodResponse.body, {
      headers: { ...lastGoodResponse.headers, ...belowFloorHeaders(lastGoodResponse.version, floor), "x-af-snapshot-stale": "1", "Set-Cookie": snapshotFloorCookie(Math.max(lastGoodResponse.version, floor)) },
    });
  }
  return noCopyResponse();
}

/** b45 H-1: whole-request budget; the 5 s bar minus headroom for the Worker to send the reply. */
const TICKER_TOTAL_BUDGET_MS = 4_600;

/** b45 H-1 (c): a reply below the client's floor names the floor it is under, so it is never unmarked. */
function belowFloorHeaders(version: number, floor: number): Record<string, string> {
  return floor > 0 && version < floor ? { "x-af-snapshot-below-floor": String(floor) } : {};
}

/** b45 H-1 (3) (TT b42: one 200 with 0 NZX and 0 ASX rows): keep this isolate's last equity rows. */
type Feed = Awaited<ReturnType<typeof loadPublicTicker>>;
let lastEquityRows: { nzx: Feed["rows"]["nzx"]; asx: Feed["rows"]["asx"] } | null = null;
function keepEquityRows(feed: Feed): Feed {
  if (feed.rows.nzx.length || feed.rows.asx.length) {
    lastEquityRows = { nzx: feed.rows.nzx, asx: feed.rows.asx };
    return feed;
  }
  // Rows keep their own quotedAt; live.equities stays false, so nothing is relabelled as live.
  return lastEquityRows ? { ...feed, rows: { ...feed.rows, nzx: lastEquityRows.nzx, asx: lastEquityRows.asx } } : feed;
}

/** b40 REG-1: edge copy first (fast), then the durable snapshot; never throws, bounded. */
async function fallbackSnapshot(): Promise<CryptoSnap | null> {
  const edge = await edgeSnapshotGet<CryptoSnap>().catch(() => null);
  if (edge) return edge;
  return withDeadline(readCryptoSnapshot(COLD_START_READ_MS).catch(() => null), COLD_START_READ_MS + 200, null);
}

/** b40 REG-1: a 200 built only from a snapshot (no live equity fetch), always marked stale. */
async function snapshotOnlyResponse(snap: CryptoSnap, floor: number) {
  const feed = keepEquityRows(await loadPublicTicker({ snapshot: snap, skipEquityFetch: true }));
  if (!feed.rows.crypto.length) return null;
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
      stale: true,
    },
  };
  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "CDN-Cache-Control": "no-store",
      ...snapshotHeaders(snap),
      ...belowFloorHeaders(snap.version, floor),
      "x-af-snapshot-stale": "1",
      "Set-Cookie": snapshotFloorCookie(Math.max(snap.version, floor)),
    },
  });
}

type CryptoSnap = NonNullable<Awaited<ReturnType<typeof readCryptoSnapshot>>>;
/** b37 H-1: the newest snapshot this isolate has served; a slow or failed read never means 503. */
let lastGoodSnap: CryptoSnap | null = null;
let lastEdgePut = 0;
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
  let snap = pickServedSnapshot(read ?? coldRead, lastGoodSnap);
  // b38 H-1 (c): a cookie client must never step back. Below its floor, use the colo's newest copy.
  if ((floor > 0 && (!snap || snap.version < floor)) || !snap) {
    const edge = await edgeSnapshotGet<CryptoSnap>();
    snap = pickServedSnapshot(snap, edge);
  }
  if (snap) {
    lastGoodSnap = snap;
    if (snap.version > lastEdgePut) {
      lastEdgePut = snap.version;
      void edgeSnapshotPut(snap);
    }
  }
  const feed = keepEquityRows(await loadPublicTicker({ snapshot: snap }));
  // G-05: named stale/failed mark for this browser. Omitted unless the account is allow-listed.
  const testFeedForce = readFeedForce(cookie, hooksAllowed);
  // Never a 200 with an empty crypto list: no copy anywhere is a 503 the tape retries.
  // b41 H-1 (TT: 2 × 503 with a snapshot available): this used to return the 503 as the build's
  // answer, which skipped the fallback snapshot read already running in GET. Null hands over to it.
  // b45 H-1 (2): never a version-0 reply. With no stored snapshot the build hands over to the
  // snapshot fallback in GET (TT b42: 3 × 200 with x-af-snapshot-version 0).
  if (!snap) return null;
  // b40 H-1 (c): a body older than the client's floor (no newer copy found above) is always marked
  // stale; a cookie client is never served below its floor unmarked.
  const belowFloor = !!snap && floor > 0 && snap.version < floor;
  const stale = !!snap && (coldStart || belowFloor || !feed.rows.crypto.length || !feed.live.crypto);

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
        ...snapshotHeaders(snap),
        ...belowFloorHeaders(snap.version, floor),
        ...(stale ? { "x-af-snapshot-stale": "1" } : {}),
  };
  if (!stale && !testFeedForce) lastGoodResponse = { body, headers, version: snap.version };
  return NextResponse.json(body, {
    headers: { ...headers, "Set-Cookie": snapshotFloorCookie(Math.max(snap.version, floor)) },
  });
}
