import { attemptLabel, attemptIsGuard, cryptoFeedKilled, readCryptoAttempt, readSharedCryptoAttempt, type CryptoAttempt } from "@/lib/crypto-attempts";
import "server-only";

import { getFxSnapshot } from "@/lib/fx";
import { getMetalsSpot } from "@/lib/metals";
import { loadPublicTickerBounded } from "@/lib/public-ticker";
import { FEED_FORCE_LABEL, FEED_FRESHNESS_WINDOWS } from "@/lib/feed-freshness-hook";
// b28 G-05: registers the durable attempt store this page reads.
import "@/lib/crypto-snapshot";
import { formatDisplayDateTime } from "@/lib/currency";
import { latestIso, savedSnapshotLabel, shapeStatusFeed, type StatusFeedRow } from "@/lib/status-feeds";

/** b31 M-2/REG-1: a probe waits at most this long; on a timeout the last OK time is shown. */
export const STATUS_PROBE_TIMEOUT_MS = 1_500;
const lastOk: Record<string, string> = {};

function remember(key: string, at: string | null | undefined): string | null {
  if (at && (!lastOk[key] || at > lastOk[key])) lastOk[key] = at;
  return at ?? null;
}

/** On a probe timeout, the last time this server saw the feed OK, marked as a timed-out check. */
function withLastOk(row: StatusFeedRow, timedOut: boolean): StatusFeedRow {
  return timedOut && row.text !== "unavailable" && !row.text.startsWith("—") ? { ...row, text: `${row.text} · check timed out` } : row;
}

/* b40 M-2: a cold isolate has no lastOk memory and the bundled equity seed carries no times, so
   /status said "no saved quote time yet" (equities) or "unavailable" (crypto) on a few loads. The last OK
   time per feed is also kept in the colo's Cache API, and the crypto row falls back to the edge
   snapshot copy that /api/ticker keeps. */
const EDGE_TIME_URL = (key: string) => `https://af-internal.invalid/status-last-ok/${key}`;
function edgeCache(): Cache | null {
  try {
    return (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default ?? null;
  } catch {
    return null;
  }
}
async function edgeTimeGet(key: string): Promise<string | null> {
  const cache = edgeCache();
  if (!cache) return null;
  try {
    const hit = await cache.match(EDGE_TIME_URL(key));
    const text = hit ? (await hit.text()).trim() : "";
    return text && Number.isFinite(Date.parse(text)) ? text : null;
  } catch {
    return null;
  }
}
const edgePutAt: Record<string, string> = {};
function edgeTimePut(key: string, at: string | null) {
  const cache = edgeCache();
  if (!cache || !at || (edgePutAt[key] && edgePutAt[key] >= at)) return;
  edgePutAt[key] = at;
  void cache.put(EDGE_TIME_URL(key), new Response(at, { headers: { "Cache-Control": "max-age=604800" } })).catch(() => undefined);
}
/** Memory first, then the colo copy; the result is remembered in this isolate. */
async function lastOkFor(key: string): Promise<string | null> {
  if (lastOk[key]) return lastOk[key];
  const edge = await within(edgeTimeGet(key), 600) /* b46 M-2: was 300 ms */;
  return edge ? remember(key, edge) : null;
}

async function within<T>(work: Promise<T>, ms = STATUS_PROBE_TIMEOUT_MS): Promise<T | null> {
  return Promise.race([
    work.then((value) => value).catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

/**
 * b34 M-2: never "unavailable" for equities while a saved snapshot time exists.
 * b37 M-2: the "unavailable" fallback is gone. The saved time is always considered (seed plus memory), and
 * with no time anywhere the row says so plainly instead of reading as an outage.
 */
async function equityRow(row: StatusFeedRow, now: number): Promise<StatusFeedRow> {
  if (!/^unavailable/.test(row.text)) return row;
  const { latestSavedEquityAt } = await import("@/lib/stock-board.server");
  // b41 P3: then the ticker's own last good equity quotes (memory, then the colo copy).
  const { lastGoodEquityAt } = await import("@/lib/public-ticker");
  // b46 M-2 (TT b45: "no saved quote time yet" 1/140): the ticker's colo copy of its last NZX/ASX rows too.
  const { edgeJsonGet } = await import("@/lib/ticker-serve");
  const coloRows = async () => {
    const rows = await edgeJsonGet<{ nzx?: Array<{ quotedAt?: string | null }>; asx?: Array<{ quotedAt?: string | null }> }>("equity", 500);
    return rows ? latestIso([...(rows.nzx ?? []), ...(rows.asx ?? [])].map((r) => r.quotedAt)) : null;
  };
  const at =
    latestSavedEquityAt() ?? (await lastOkFor("equity")) ?? (await within(lastGoodEquityAt(), 800)) ?? (await within(coloRows(), 700));
  return at
    ? { ...row, tone: "amber", text: savedSnapshotLabel(at, now) }
    : { ...row, tone: "amber", text: EQUITY_NO_TIME_TEXT };
}

export const EQUITY_NO_TIME_TEXT = "— no saved quote time yet";

/** Provider timestamps only. A failed or baseline feed is unavailable. */
export async function loadStatusFeeds(now = Date.now()): Promise<StatusFeedRow[]> {
  const [fx, metals, tape] = await Promise.all([
    within(getFxSnapshot()),
    within(getMetalsSpot()),
    within(loadPublicTickerBounded(STATUS_PROBE_TIMEOUT_MS - 100)),
  ]);
  const tapeTimedOut = !tape;
  const fxTimedOut = !fx;
  const metalsTimedOut = !metals;
  const equityFresh = tapeTimedOut
    ? null
    : remember("equity", latestIso([
        ...(tape?.rows.nzx ?? []).map((row) => row.quotedAt),
        ...(tape?.rows.asx ?? []).map((row) => row.quotedAt),
      ]));
  edgeTimePut("equity", equityFresh);
  const equityAt = equityFresh ?? (await lastOkFor("equity"));
  // b37 M-2: crypto "Last OK" comes from the shared snapshot, the same source as the page's
  // x-af-snapshot-at stamp, so the two times can't disagree. The tape is used only when there's no snapshot.
  const { readCryptoSnapshot } = await import("@/lib/crypto-snapshot");
  const snap = await within(readCryptoSnapshot());
  let cryptoAt = remember("crypto", snap?.at ?? null);
  if (!cryptoAt) {
    cryptoAt = tapeTimedOut ? null : remember("crypto", latestIso((tape?.rows.crypto ?? []).map((row) => row.quotedAt)));
  }
  if (!cryptoAt) {
    // b40 M-2: the edge snapshot copy, then the colo's last OK time; never "unavailable" while one exists.
    const { edgeSnapshotGet } = await import("@/lib/ticker-serve");
    const edge = await within(edgeSnapshotGet<{ version: number; at: string }>(800), 900); // b46 M-2: was 300 ms
    cryptoAt = edge?.at ? remember("crypto", edge.at) : await lastOkFor("crypto");
  }
  edgeTimePut("crypto", cryptoAt);
  // b46 M-2 (TT b45: crypto "check timed out" 4/140): the crypto time comes from the snapshot, so a slow
  // tape probe does not make the crypto row a timed-out check when a snapshot time was read.
  const cryptoTimedOut = tapeTimedOut && !snap?.at;
  const fxAt = fxTimedOut ? lastOk.fx ?? null : remember("fx", fx?.sourced ? fx.asOf : null);
  const metalsAt = metalsTimedOut ? lastOk.metals ?? null : remember("metals", metals?.live ? metals.quotedAt : null);
  const killed = cryptoFeedKilled();
  return [
    await equityRow(withLastOk(shapeStatusFeed({ label: FEED_FORCE_LABEL.equity, at: equityAt, now, ...FEED_FRESHNESS_WINDOWS.equity }), tapeTimedOut), now),
    withLastOk(shapeStatusFeed({
      label: FEED_FORCE_LABEL.crypto,
      at: cryptoAt,
      now,
      ...FEED_FRESHNESS_WINDOWS.crypto,
      failed: killed,
      failedText: "— switched off by the operator",
    }), cryptoTimedOut),
    (await within(cryptoAttemptRow())) ?? localCryptoAttemptRow(),
    withLastOk(shapeStatusFeed({
      label: FEED_FORCE_LABEL.fx,
      at: fxAt,
      now,
      ...FEED_FRESHNESS_WINDOWS.fx,
    }), fxTimedOut),
    withLastOk(shapeStatusFeed({
      label: FEED_FORCE_LABEL.metals,
      at: metalsAt,
      now,
      ...FEED_FRESHNESS_WINDOWS.metals,
    }), metalsTimedOut),
  ];
}

/** Goal b14: the last CoinGecko attempt this server made, so a silent fallback shows. */
/** b41 P3: the shared attempt read timed out; this server's own last attempt (or the one it last read). */
function localCryptoAttemptRow(): StatusFeedRow {
  const last = readCryptoAttempt().last ?? lastSharedAttempt;
  if (!last) return { label: "Crypto list last attempt", tone: "amber", text: "— check timed out" };
  return {
    label: "Crypto list last attempt",
    tone: last.ok || attemptIsGuard(last.code) ? "ok" : "red",
    text: `${formatDisplayDateTime(last.at)} · ${attemptLabel(last)} (this server)`,
  };
}
let lastSharedAttempt: CryptoAttempt | null = null;

async function cryptoAttemptRow(): Promise<StatusFeedRow> {
  const { last, scope } = await readSharedCryptoAttempt();
  if (!last) return { label: "Crypto list last attempt", tone: "amber", text: "— no refresh attempt recorded yet" };
  lastSharedAttempt = last;
  return {
    label: "Crypto list last attempt",
    tone: last.ok || attemptIsGuard(last.code) ? "ok" : "red",
    text: `${formatDisplayDateTime(last.at)} · ${attemptLabel(last)}`,
  };
}
