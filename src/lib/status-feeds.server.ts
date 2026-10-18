import { attemptLabel, attemptIsGuard } from "@/lib/crypto-attempts";
import "server-only";

import { getFxSnapshot } from "@/lib/fx";
import { getMetalsSpot } from "@/lib/metals";
import { loadPublicTickerBounded } from "@/lib/public-ticker";
import { cryptoFeedKilled, readSharedCryptoAttempt } from "@/lib/crypto-attempts";
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

async function within<T>(work: Promise<T>, ms = STATUS_PROBE_TIMEOUT_MS): Promise<T | null> {
  return Promise.race([
    work.then((value) => value).catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

/** b34 M-2: never "unavailable" for equities while a saved snapshot time exists. */
async function equityRow(row: StatusFeedRow, now: number): Promise<StatusFeedRow> {
  if (!/^unavailable/.test(row.text)) return row;
  const { latestSavedEquityAt } = await import("@/lib/stock-board.server");
  const at = latestSavedEquityAt();
  return at ? { ...row, tone: "amber", text: savedSnapshotLabel(at, now) } : row;
}

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
  const equityAt = tapeTimedOut
    ? lastOk.equity ?? null
    : remember("equity", latestIso([
        ...(tape?.rows.nzx ?? []).map((row) => row.quotedAt),
        ...(tape?.rows.asx ?? []).map((row) => row.quotedAt),
      ]));
  let cryptoAt = tapeTimedOut ? lastOk.crypto ?? null : remember("crypto", latestIso((tape?.rows.crypto ?? []).map((row) => row.quotedAt)));
  if (!cryptoAt) {
    // The shared snapshot in memory is the crypto feed's last OK time.
    const { readCryptoSnapshot } = await import("@/lib/crypto-snapshot");
    const snap = await within(readCryptoSnapshot());
    cryptoAt = remember("crypto", snap?.at ?? null);
  }
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
    }), tapeTimedOut),
    (await within(cryptoAttemptRow())) ?? { label: "Crypto list last attempt", tone: "amber", text: "— check timed out" },
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
async function cryptoAttemptRow(): Promise<StatusFeedRow> {
  const { last, scope } = await readSharedCryptoAttempt();
  if (!last) return { label: "Crypto list last attempt", tone: "amber", text: "— no refresh attempt recorded yet" };
  return {
    label: "Crypto list last attempt",
    tone: last.ok || attemptIsGuard(last.code) ? "ok" : "red",
    text: `${formatDisplayDateTime(last.at)} · ${attemptLabel(last)}`,
  };
}
