import { keepAlive } from "@/lib/keep-alive.server";
import { stampTicker, tickerPathHeaders, tickerReason, TICKER_EXPOSED_HEADERS, type TickerPath } from "@/lib/ticker-path";
import { kickCryptoRefreshIfOld } from "@/lib/crypto-board-store";
import { NextResponse } from "next/server";
import { PUBLIC_EQUITY_SOURCE, publicCryptoSourcesLabel } from "@/lib/data-sources";
import { cryptoVenueForLabel } from "@/lib/crypto-price-chain";
import { readCryptoSnapshot, snapshotHeaders } from "@/lib/crypto-snapshot";
import { loadPublicTicker } from "@/lib/public-ticker";
import { COLD_START_READ_MS, edgeJsonGet, edgeJsonPut, edgeSnapshotGet, edgeSnapshotGetVersion, edgeSnapshotPut, pickServedSnapshot, withDeadline } from "@/lib/ticker-serve";
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
    console.warn("[api/ticker] 503 path=test-feed-off");
    return NextResponse.json(
      { ok: false, error: "Feed switched off in test mode" },
      { status: 503, headers: { "Cache-Control": "no-store", "CDN-Cache-Control": "no-store", "x-af-503-reason": "testFeedOff=on ms=0", "Access-Control-Expose-Headers": TICKER_EXPOSED_HEADERS } }
    );
  }
  // b37 REG-1: the whole build is bounded. b40 REG-1/H-1 (a): a fallback snapshot read (edge copy,
  // then the durable one) starts alongside the build, so when the 4 s deadline is hit an isolate with
  // no lastGoodResponse still serves a snapshot as a 200 with its true time and the stale mark.
  // A 503 only when no snapshot exists anywhere.
  const t0 = Date.now();
  const floor = snapshotFloorFrom(req);
  // b46 H-1 (a) (TT b45: 11 × 503 with a snapshot, some at 2.7 s — before the 3 s deadline: the build
  // itself returned null, then the fallback snapshot read was also empty). Every path is now logged, the
  // fallback reads run in parallel (edge copy, durable copy, and the small last-good body copy), and
  // after EARLY_SNAPSHOT_MS the first ready snapshot reply wins over a still-running build.
  const trace: Record<string, string> = {};
  // b48: every reply names its branch (x-af-ticker-path), snapshot age and version.
  const fallbackReply = fallbackSnapshot(trace)
    .then(async (found) => {
      if (!found) return null;
      const floored = await floorSnapshot(found.snap, floor);
      const reply = await snapshotOnlyResponse(floored.snap, floor);
      return reply ? stampTicker(reply, tickerPathHeaders(floored.floorVersion ? "floor-version" : found.path, floored.snap)) : null;
    })
    .then((r) => ((trace.fallbackReply = r ? "ok" : "empty"), r))
    .catch(() => ((trace.fallbackReply = "threw"), null));
  const buildP = buildTicker(floor, cookie, hooksAllowed)
    .then((r) => ((trace.build = r ? "ok" : "null"), (trace.buildMs = String(Date.now() - t0)), r))
    .catch(() => ((trace.build = "threw"), null));
  const winner = await firstNonNull(
    [
      buildP,
      delay(EARLY_SNAPSHOT_MS).then(() => fallbackReply),
      // This isolate's last good reply (at or above the floor) is also ready after EARLY_SNAPSHOT_MS.
      delay(EARLY_SNAPSHOT_MS).then(() =>
        lastGoodResponse && lastGoodResponse.version >= floor
          ? stampTicker(
              NextResponse.json(lastGoodResponse.body, {
                headers: { ...lastGoodResponse.headers, "x-af-snapshot-stale": "1", "Set-Cookie": snapshotFloorCookie(Math.max(lastGoodResponse.version, floor)) },
              }),
              tickerPathHeaders("deadline", { version: lastGoodResponse.version, at: lastGoodResponse.headers["x-af-snapshot-at"] })
            )
          : null
      ),
    ],
    TICKER_TOTAL_BUDGET_MS - (Date.now() - t0)
  );
  if (winner) return winner;
  if (lastGoodResponse) {
    console.warn(`[api/ticker] path=last-good-memory ${traceLine(trace, t0)}`);
    return stampTicker(
      NextResponse.json(lastGoodResponse.body, {
        headers: { ...lastGoodResponse.headers, ...belowFloorHeaders(lastGoodResponse.version, floor), "x-af-snapshot-stale": "1", "Set-Cookie": snapshotFloorCookie(Math.max(lastGoodResponse.version, floor)) },
      }),
      tickerPathHeaders("last-good", { version: lastGoodResponse.version, at: lastGoodResponse.headers["x-af-snapshot-at"] })
    );
  }
  const edgeBody = await edgeJsonGet<{ body: unknown; headers: Record<string, string>; version: number }>("body", 400);
  if (edgeBody?.body && edgeBody.version > 0) {
    console.warn(`[api/ticker] path=last-good-colo ${traceLine(trace, t0)}`);
    return stampTicker(
      NextResponse.json(edgeBody.body, {
        headers: { ...edgeBody.headers, ...belowFloorHeaders(edgeBody.version, floor), "x-af-snapshot-stale": "1", "Set-Cookie": snapshotFloorCookie(Math.max(edgeBody.version, floor)) },
      }),
      tickerPathHeaders("last-good", { version: edgeBody.version, at: edgeBody.headers?.["x-af-snapshot-at"] })
    );
  }
  trace.coloBody = "miss";
  // b47 H-1 (a) (TT b46: 5 × 503 at 2.8–4.5 s; Worker logs not readable with the current token): every
  // candidate came back empty, often well before the budget. The stored DB copy gets one more read with
  // all the time left (up to 4.85 s in total) before a 503 is chosen.
  const left = LAST_RESORT_END_MS - (Date.now() - t0);
  if (left > 300) {
    const lateT = Date.now();
    const late = await withDeadline(readCryptoSnapshot(left - 50).catch(() => null), left, null);
    const lateSnap = pickServedSnapshot(late, lastGoodSnap);
    trace.lateDurable = late ? "hit" : Date.now() - lateT >= left - 20 ? "timeout" : "miss";
    trace.lateDurableMs = String(Date.now() - lateT);
    if (lateSnap) {
      const reply = await withDeadline(snapshotOnlyResponse(lateSnap, floor).catch(() => null), Math.max(200, LAST_RESORT_END_MS - (Date.now() - t0)), null);
      if (reply) {
        console.warn(`[api/ticker] path=late-durable ${traceLine(trace, t0)}`);
        return stampTicker(reply, tickerPathHeaders("late-durable", lateSnap));
      }
      trace.lateReply = "empty";
    }
  }
  console.warn(`[api/ticker] 503 path=no-copy-anywhere ${traceLine(trace, t0)}`);
  // b48: the 503 says which reads failed or timed out, and how long each took.
  return stampTicker(noCopyResponse(), {
    "x-af-503-reason": tickerReason(trace, Date.now() - t0),
    "Access-Control-Expose-Headers": TICKER_EXPOSED_HEADERS,
  });
}

/** b47: the last-resort stored-copy read ends by this point (the bar is 5 s). */
const LAST_RESORT_END_MS = 4_850;
/** b46 H-1 (a): after this long a ready snapshot reply is served instead of waiting on the build. */
const EARLY_SNAPSHOT_MS = 2_000;
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
function traceLine(trace: Record<string, string>, t0: number): string {
  return `${Object.entries(trace).map(([k, v]) => `${k}=${v}`).join(" ")} ms=${Date.now() - t0}`;
}
/** First promise to resolve non-null, or null once all are null or the time is up. */
function firstNonNull<T>(work: Array<Promise<T | null>>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    let left = work.length;
    const timer = setTimeout(() => resolve(null), Math.max(300, ms));
    for (const p of work) {
      p.then(
        (v) => {
          if (v) {
            clearTimeout(timer);
            resolve(v);
          } else if (--left === 0) {
            clearTimeout(timer);
            resolve(null);
          }
        },
        () => {
          if (--left === 0) {
            clearTimeout(timer);
            resolve(null);
          }
        }
      );
    }
  });
}

/** b46 H-1 (c): below the client's floor, fetch the floor version itself from the colo copy. */
async function floorSnapshot(snap: CryptoSnap, floor: number): Promise<{ snap: CryptoSnap; floorVersion: boolean }> {
  if (!(floor > 0) || snap.version >= floor) return { snap, floorVersion: false };
  const exact = await edgeSnapshotGetVersion<CryptoSnap>(floor).catch(() => null);
  if (exact) return { snap: exact, floorVersion: true };
  // b47 H-1 (c) (TT b46: 1 step-back, −10.6 s): then the stored DB copy, read with the floor (forces a
  // store read when memory is older); then hold briefly for a copy at or above the floor to land.
  const stored = await readCryptoSnapshot(1_500, { floor }).catch(() => null);
  if (stored && stored.version >= floor) return { snap: stored, floorVersion: true };
  const until = Date.now() + FLOOR_HOLD_MS;
  while (Date.now() < until) {
    await delay(250);
    const next =
      (await edgeSnapshotGetVersion<CryptoSnap>(floor, 300).catch(() => null)) ??
      (await edgeSnapshotGet<CryptoSnap>(300).catch(() => null));
    if (next && next.version >= floor) return { snap: next, floorVersion: true };
  }
  console.warn(`[api/ticker] path=below-floor floor=${floor} served=${snap.version}`);
  return { snap: pickServedSnapshot(stored, snap) ?? snap, floorVersion: false };
}
/** b47: how long a reply waits for a copy at or above the client's floor before it is served marked. */
const FLOOR_HOLD_MS = 1_000;

/** b45 H-1: whole-request budget; the 5 s bar minus headroom for the Worker to send the reply. */
const TICKER_TOTAL_BUDGET_MS = 4_600;

/** b45 H-1 (c): a reply below the client's floor names the floor it is under, so it is never unmarked. */
function belowFloorHeaders(version: number, floor: number): Record<string, string> {
  return floor > 0 && version < floor ? { "x-af-snapshot-below-floor": String(floor) } : {};
}

/** b45 H-1 (3) / b46 (4) (TT b45: 2/495 with 0 NZX/ASX rows, both clients at once — a cold isolate):
 * keep the last equity rows in this isolate and in the colo copy, and merge them in on a failed fetch. */
type Feed = Awaited<ReturnType<typeof loadPublicTicker>>;
type EquityRows = { nzx: Feed["rows"]["nzx"]; asx: Feed["rows"]["asx"] };
let lastEquityRows: EquityRows | null = null;
let lastEquityPut = 0;
async function keepEquityRows(feed: Feed): Promise<Feed> {
  if (feed.rows.nzx.length || feed.rows.asx.length) {
    lastEquityRows = { nzx: feed.rows.nzx.length ? feed.rows.nzx : lastEquityRows?.nzx ?? [], asx: feed.rows.asx.length ? feed.rows.asx : lastEquityRows?.asx ?? [] };
    if (Date.now() - lastEquityPut > 60_000) {
      lastEquityPut = Date.now();
      void keepAlive(edgeJsonPut("equity", lastEquityRows)); // b47: waitUntil, or the put is cancelled with the reply
    }
    return { ...feed, rows: { ...feed.rows, ...lastEquityRows } };
  }
  const prev = lastEquityRows ?? (await edgeJsonGet<EquityRows>("equity", 400));
  if (prev && (prev.nzx?.length || prev.asx?.length)) lastEquityRows = prev;
  // Rows keep their own quotedAt; live.equities stays false, so nothing is relabelled as live.
  return lastEquityRows ? { ...feed, rows: { ...feed.rows, nzx: lastEquityRows.nzx, asx: lastEquityRows.asx } } : feed;
}

/** b40 REG-1 / b46: edge copy and durable copy read in parallel; the newer one that arrives wins. */
async function fallbackSnapshot(trace: Record<string, string> = {}): Promise<{ snap: CryptoSnap; path: TickerPath } | null> {
  const t = Date.now();
  const EDGE_MS = 1_500;
  const DURABLE_MS = COLD_START_READ_MS + 200;
  const edge = edgeSnapshotGet<CryptoSnap>(EDGE_MS)
    .catch(() => null)
    .then((v) => {
      const ms = Date.now() - t;
      trace.edge = v ? "hit" : ms >= EDGE_MS - 20 ? "timeout" : "miss";
      trace.edgeMs = String(ms);
      return v ? { snap: v, path: "shared-cache" as TickerPath } : null;
    });
  const durable = withDeadline(readCryptoSnapshot(COLD_START_READ_MS).catch(() => null), DURABLE_MS, null).then((v) => {
    const ms = Date.now() - t;
    trace.durable = v ? "hit" : ms >= DURABLE_MS - 20 ? "timeout" : "miss";
    trace.durableMs = String(ms);
    return v ? { snap: v, path: "store-read" as TickerPath } : null;
  });
  const first = await firstNonNull<{ snap: CryptoSnap; path: TickerPath }>([edge, durable], COLD_START_READ_MS + 300);
  if (first) {
    // This isolate's own copy wins when it is newer; then the reply is a deadline answer from memory.
    const best = pickServedSnapshot(first.snap, lastGoodSnap);
    return best === first.snap ? first : best ? { snap: best, path: "deadline" } : first;
  }
  trace.memory = lastGoodSnap ? "hit" : "miss";
  return lastGoodSnap ? { snap: lastGoodSnap, path: "deadline" } : null;
}

/** b40 REG-1: a 200 built only from a snapshot (no live equity fetch), always marked stale. */
async function snapshotOnlyResponse(snap: CryptoSnap, floor: number) {
  const feed = await keepEquityRows(await loadPublicTicker({ snapshot: snap, skipEquityFetch: true }));
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
  // b48: which branch supplied the snapshot (reported in x-af-ticker-path).
  let path: TickerPath = snap && snap === coldRead && !read ? "cold" : "snapshot-hit";
  // b38 H-1 (c): a cookie client must never step back. Below its floor, use the colo's newest copy.
  if ((floor > 0 && (!snap || snap.version < floor)) || !snap) {
    const edge = await edgeSnapshotGet<CryptoSnap>(800);
    const before = snap;
    snap = pickServedSnapshot(snap, edge);
    if (snap && snap !== before) path = "shared-cache";
  }
  // b46 H-1 (c): still below the floor — serve the floor version itself (colo copy by version).
  if (snap) {
    const floored = await floorSnapshot(snap, floor);
    snap = floored.snap;
    if (floored.floorVersion) path = "floor-version";
  }
  if (snap) {
    // b47 H-1 freeze: a tape read of a list over 5 min old starts a single-flight background refresh.
    try {
      kickCryptoRefreshIfOld(snap.at);
    } catch {
      /* best effort */
    }
    lastGoodSnap = snap;
    if (snap.version > lastEdgePut) {
      lastEdgePut = snap.version;
      void keepAlive(edgeSnapshotPut(snap)); // b47: waitUntil, or the put is cancelled with the reply
    }
  }
  const feed = await keepEquityRows(await loadPublicTicker({ snapshot: snap }));
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
  if (!stale && !testFeedForce) {
    const prevVersion = lastGoodResponse?.version ?? 0;
    lastGoodResponse = { body, headers, version: snap.version };
    if (snap.version > prevVersion) void keepAlive(edgeJsonPut("body", lastGoodResponse)); // b47: waitUntil
  }
  return stampTicker(
    NextResponse.json(body, {
      headers: { ...headers, "Set-Cookie": snapshotFloorCookie(Math.max(snap.version, floor)) },
    }),
    tickerPathHeaders(path, snap)
  );
}
