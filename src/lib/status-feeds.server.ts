import "server-only";

import { getFxSnapshot } from "@/lib/fx";
import { getMetalsSpot } from "@/lib/metals";
import { loadPublicTickerBounded } from "@/lib/public-ticker";
import { cryptoFeedKilled, readSharedCryptoAttempt } from "@/lib/crypto-attempts";
import { FEED_FORCE_LABEL, FEED_FRESHNESS_WINDOWS } from "@/lib/feed-freshness-hook";
// b28 G-05: registers the durable attempt store this page reads.
import "@/lib/crypto-snapshot";
import { formatDisplayDateTime } from "@/lib/currency";
import { latestIso, shapeStatusFeed, type StatusFeedRow } from "@/lib/status-feeds";

async function within<T>(work: Promise<T>, ms = 4000): Promise<T | null> {
  return Promise.race([
    work.then((value) => value).catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

/** Provider timestamps only. A failed or baseline feed is unavailable. */
export async function loadStatusFeeds(now = Date.now()): Promise<StatusFeedRow[]> {
  const [fx, metals, tape] = await Promise.all([
    within(getFxSnapshot()),
    within(getMetalsSpot()),
    within(loadPublicTickerBounded(3500)),
  ]);
  const equityAt = latestIso([
    ...(tape?.rows.nzx ?? []).map((row) => row.quotedAt),
    ...(tape?.rows.asx ?? []).map((row) => row.quotedAt),
  ]);
  const cryptoAt = latestIso((tape?.rows.crypto ?? []).map((row) => row.quotedAt));
  const killed = cryptoFeedKilled();
  return [
    shapeStatusFeed({ label: FEED_FORCE_LABEL.equity, at: equityAt, now, ...FEED_FRESHNESS_WINDOWS.equity }),
    shapeStatusFeed({
      label: FEED_FORCE_LABEL.crypto,
      at: cryptoAt,
      now,
      ...FEED_FRESHNESS_WINDOWS.crypto,
      failed: killed,
      failedText: "— switched off by the operator",
    }),
    await cryptoAttemptRow(),
    shapeStatusFeed({
      label: FEED_FORCE_LABEL.fx,
      at: fx?.sourced ? fx.asOf : null,
      now,
      ...FEED_FRESHNESS_WINDOWS.fx,
    }),
    shapeStatusFeed({
      label: FEED_FORCE_LABEL.metals,
      at: metals?.live ? metals.quotedAt : null,
      now,
      ...FEED_FRESHNESS_WINDOWS.metals,
    }),
  ];
}

/** Goal b14: the last CoinGecko attempt this server made, so a silent fallback shows. */
async function cryptoAttemptRow(): Promise<StatusFeedRow> {
  const { last, scope } = await readSharedCryptoAttempt();
  if (!last) return { label: "Crypto list last attempt", tone: "amber", text: "— no refresh attempt recorded yet" };
  return {
    label: "Crypto list last attempt",
    tone: last.ok ? "ok" : "red",
    text: `${formatDisplayDateTime(last.at)} · ${last.ok ? "succeeded" : `failed (${last.code})`}`,
  };
}
