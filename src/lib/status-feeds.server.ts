import { keepAlive } from "@/lib/keep-alive.server";
import { attemptLabel, attemptIsGuard, cryptoFeedKilled, readCryptoAttempt, readSharedCryptoAttempt, type CryptoAttempt } from "@/lib/crypto-attempts";
import "server-only";

import { getFxSnapshot } from "@/lib/fx";
import { getMetalsSpot } from "@/lib/metals";
import { loadPublicTickerBounded } from "@/lib/public-ticker";
import { FEED_FORCE_LABEL, FEED_FRESHNESS_WINDOWS } from "@/lib/feed-freshness-hook";
// b28 G-05: registers the durable attempt store this page reads.
import "@/lib/crypto-snapshot";
import { formatStatusTime, latestIso, shapeStatusFeed, statusSavedLabel, type StatusFeedRow } from "@/lib/status-feeds";
import { readStatusLastOk, saveStatusLastOk } from "@/lib/status-last-ok.server";

/** b31 M-2/REG-1: a probe waits at most this long; on a timeout the last OK time is shown. */
export const STATUS_PROBE_TIMEOUT_MS = 1_500;
/** b51 M-2: how long the tape may keep loading for the equity quote time (the page bar is 5 s). */
export const STATUS_TAPE_LATE_MS = 3_000;
const lastOk: Record<string, string> = {};

function remember(key: string, at: string | null | undefined): string | null {
  if (at && (!lastOk[key] || at > lastOk[key])) lastOk[key] = at;
  // M-2 P2: also kept in the existing Totalum store so a redeploy does not lose it (throttled, background).
  saveStatusLastOk(key, at);
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
  void keepAlive(cache.put(EDGE_TIME_URL(key), new Response(at, { headers: { "Cache-Control": "max-age=604800" } })).catch(() => undefined)); // b47: waitUntil
}
/** Memory first, then the colo copy; the result is remembered in this isolate. */
async function lastOkFor(key: string): Promise<string | null> {
  if (lastOk[key]) return lastOk[key];
  const edge = await within(edgeTimeGet(key), 600) /* b46 M-2: was 300 ms */;
  if (edge) return remember(key, edge);
  // M-2 P2: a fresh deploy has an empty colo cache too; the durable Totalum copy is last.
  const stored = (await within(readStatusLastOk(), 900))?.[key] ?? null;
  return stored ? remember(key, stored) : null;
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
async function equityRow(row: StatusFeedRow, now: number, tapeLate?: Promise<{ rows: { nzx: Array<{ quotedAt?: string | null }>; asx: Array<{ quotedAt?: string | null }> } } | null>): Promise<StatusFeedRow> {
  if (!/^unavailable/.test(row.text)) return row;
  const lateTape = async () => {
    const t = tapeLate ? await tapeLate.catch(() => null) : null;
    return t ? latestIso([...t.rows.nzx, ...t.rows.asx].map((r) => r.quotedAt ?? null)) : null;
  };
  const { latestSavedEquityAt } = await import("@/lib/stock-board.server");
  // b41 P3: then the ticker's own last good equity quotes (memory, then the colo copy).
  const { lastGoodEquityAt } = await import("@/lib/public-ticker");
  // b46 M-2 (TT b45: "no saved quote time yet" 1/140): the ticker's colo copy of its last NZX/ASX rows too.
  const { edgeJsonGet } = await import("@/lib/ticker-serve");
  const coloRows = async () => {
    const rows = await edgeJsonGet<{ nzx?: Array<{ quotedAt?: string | null }>; asx?: Array<{ quotedAt?: string | null }> }>("equity", 500);
    return rows ? latestIso([...(rows.nzx ?? []), ...(rows.asx ?? [])].map((r) => r.quotedAt)) : null;
  };
  // M-2 P2: the newest NZX/ASX quotedAt in the ticker snapshot (memory/colo, then the colo rows, then the
  // late tape) comes before the bundled seed, and the durable store covers a fresh deploy.
  const at =
    (await within(lastGoodEquityAt(), 800)) ?? (await within(coloRows(), 700)) ?? (await lastOkFor("equity")) ?? latestSavedEquityAt() ?? (await lateTape());
  if (at) remember("equity", at);
  return at
    ? { ...row, tone: "amber", text: statusSavedLabel(at, now) }
    : { ...row, tone: "amber", text: EQUITY_NO_TIME_TEXT };
}

export const EQUITY_NO_TIME_TEXT = "— no saved quote time yet";

/** Provider timestamps only. A failed or baseline feed is unavailable. */
export async function loadStatusFeeds(now = Date.now()): Promise<StatusFeedRow[]> {
  // b51 M-2: every crypto fallback starts now, alongside the probes (see the crypto row below).
  const { readCryptoSnapshot } = await import("@/lib/crypto-snapshot");
  const { edgeSnapshotGet } = await import("@/lib/ticker-serve");
  const snapP = within(readCryptoSnapshot());
  const edgeP = within(edgeSnapshotGet<{ version: number; at: string }>(800), 900);
  const lastOkP = lastOkFor("crypto");
  const attemptP = within(readSharedCryptoAttempt(), 1_600);
  // b51 M-2 (TT b50: equities "no saved quote time yet" 2/140, cold IAD isolates): the tape keeps
  // loading past the probe timeout; a late tape still supplies the NZX/ASX quote time (same request).
  const tapeLate = loadPublicTickerBounded(STATUS_TAPE_LATE_MS);
  const [fx, metals, tape] = await Promise.all([
    within(getFxSnapshot()),
    within(getMetalsSpot()),
    within(tapeLate, STATUS_PROBE_TIMEOUT_MS - 100),
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
  // b51 M-2 (TT b50: crypto "unavailable" on 1 of 140 loads, a 5.1 s cold IAD load): the fallbacks used to
  // run one after another (up to ~5 s). They now start together and the first in priority order wins:
  // snapshot → tape → colo snapshot copy → colo last-OK time → last successful shared refresh attempt
  // (a succeeded refresh wrote a snapshot at that time) → one longer stored read.
  const snap = await snapP;
  let cryptoAt = remember("crypto", snap?.at ?? null);
  if (!cryptoAt) cryptoAt = tapeTimedOut ? null : remember("crypto", latestIso((tape?.rows.crypto ?? []).map((row) => row.quotedAt)));
  if (!cryptoAt) cryptoAt = remember("crypto", (await edgeP)?.at ?? null);
  if (!cryptoAt) cryptoAt = await lastOkP;
  if (!cryptoAt) {
    const att = (await attemptP)?.last;
    cryptoAt = att?.ok && att.at ? remember("crypto", att.at) : null;
  }
  if (!cryptoAt) {
    const again = await within(readCryptoSnapshot(2_000), 2_200);
    cryptoAt = again?.at ? remember("crypto", again.at) : null;
  }
  edgeTimePut("crypto", cryptoAt);
  // b46 M-2 (TT b45: crypto "check timed out" 4/140): the crypto time comes from the snapshot, so a slow
  // tape probe does not make the crypto row a timed-out check when a snapshot time was read.
  const cryptoTimedOut = tapeTimedOut && !snap?.at;
  const fxAt = fxTimedOut ? await lastOkFor("fx") : remember("fx", fx?.sourced ? fx.asOf : null);
  const metalsAt = metalsTimedOut ? await lastOkFor("metals") : remember("metals", metals?.live ? metals.quotedAt : null);
  const killed = cryptoFeedKilled();
  return [
    await equityRow(withLastOk(shapeStatusFeed({ label: FEED_FORCE_LABEL.equity, at: equityAt, now, ...FEED_FRESHNESS_WINDOWS.equity }), tapeTimedOut), now, tapeLate),
    withLastOk(shapeStatusFeed({
      label: FEED_FORCE_LABEL.crypto,
      at: cryptoAt,
      now,
      ...FEED_FRESHNESS_WINDOWS.crypto,
      failed: killed,
      failedText: "— switched off by the operator",
    }), cryptoTimedOut),
    (await within(cryptoAttemptRow(attemptP))) ?? localCryptoAttemptRow(),
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
    text: `${formatStatusTime(last.at)} · ${attemptLabel(last)} (this server)`,
  };
}
let lastSharedAttempt: CryptoAttempt | null = null;

async function cryptoAttemptRow(early?: Promise<Awaited<ReturnType<typeof readSharedCryptoAttempt>> | null> | null): Promise<StatusFeedRow> {
  // b51: reuse the read started with the crypto row (one store read per load, not two).
  const got = (early ? await early : null) ?? (await readSharedCryptoAttempt());
  const { last, scope } = got;
  if (!last) return { label: "Crypto list last attempt", tone: "amber", text: "— no refresh attempt recorded yet" };
  lastSharedAttempt = last;
  return {
    label: "Crypto list last attempt",
    tone: last.ok || attemptIsGuard(last.code) ? "ok" : "red",
    text: `${formatStatusTime(last.at)} · ${attemptLabel(last)}`,
  };
}
