import "server-only";

import { getFxSnapshot } from "@/lib/fx";
import { getMetalsSpot } from "@/lib/metals";
import { loadPublicTickerBounded } from "@/lib/public-ticker";
import { latestIso, presentStatusFeed, type StatusFeedRow } from "@/lib/status-feeds";

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
  return [
    presentStatusFeed("Equity quotes", equityAt, now),
    presentStatusFeed("Crypto quotes", cryptoAt, now),
    presentStatusFeed("Exchange rates", fx?.sourced ? fx.asOf : null, now),
    presentStatusFeed("Metals spot", metals?.live ? metals.quotedAt : null, now),
  ];
}
