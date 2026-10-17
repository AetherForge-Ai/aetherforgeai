import "server-only";

import { getFxSnapshot } from "@/lib/fx";
import { getMetalsSpot } from "@/lib/metals";
import { loadPublicTickerBounded } from "@/lib/public-ticker";
import { cryptoAgeBand, cryptoFeedKilled, readCryptoAttempt } from "@/lib/crypto-attempts";
import { formatDisplayDateTime } from "@/lib/currency";
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
    cryptoQuotesRow(cryptoAt, now),
    cryptoAttemptRow(),
    presentStatusFeed("Exchange rates", fx?.sourced ? fx.asOf : null, now),
    presentStatusFeed("Metals spot", metals?.live ? metals.quotedAt : null, now),
  ];
}

/** G-05: crypto quotes with amber (>15 min) and red (>60 min) bands. */
function cryptoQuotesRow(at: string | null, now: number): StatusFeedRow {
  if (cryptoFeedKilled()) return { label: "Crypto quotes", tone: "amber", text: "— switched off by the operator" };
  const base = presentStatusFeed("Crypto quotes", at, now);
  const band = cryptoAgeBand(at, now);
  if (base.tone === "ok" && band === "amber") return { ...base, tone: "amber", text: `${base.text} · amber: older than 15 minutes` };
  if (base.tone === "ok" && band === "red") return { ...base, tone: "amber", text: `${base.text} · red: older than 60 minutes` };
  return base;
}

/** Goal b14: the last CoinGecko attempt this server made, so a silent fallback shows. */
function cryptoAttemptRow(): StatusFeedRow {
  const { last } = readCryptoAttempt();
  if (!last) return { label: "Crypto list last attempt", tone: "amber", text: "— no attempt recorded on this server yet" };
  return {
    label: "Crypto list last attempt",
    tone: last.ok ? "ok" : "amber",
    text: `${formatDisplayDateTime(last.at)} · ${last.ok ? "succeeded" : `failed (${last.code})`}`,
  };
}
