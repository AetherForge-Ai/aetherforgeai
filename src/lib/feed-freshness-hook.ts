/**
 * G-05: allow-listed test hook that marks one named feed stale or failed.
 *
 * The cookie is ignored unless the caller has already checked GOAL_TEST_HOOKS=1
 * and the signed-in account id. This file does not read the session.
 *
 * Stale keeps the previous print and is amber. Failed is red.
 */

export const FEED_FORCE_COOKIE = "af_test_feed_force";

export const NAMED_FEEDS = ["equity", "crypto", "fx", "metals"] as const;
export type NamedFeed = (typeof NAMED_FEEDS)[number];
export type FeedForceState = "stale" | "failed";

export interface FeedForce {
  name: NamedFeed;
  state: FeedForceState;
}

/** Status-page label for each named feed. */
export const FEED_FORCE_LABEL: Record<NamedFeed, string> = {
  equity: "Equity quotes",
  crypto: "Crypto quotes",
  fx: "Exchange rates",
  metals: "Metals spot",
};

/**
 * How old a print may be before the freshness cell leaves ok.
 * Equity uses a multi-day window so a Friday close is still the latest print
 * on Monday. Crypto, FX and metals are tighter because those feeds keep moving.
 */
export const FEED_FRESHNESS_WINDOWS: Record<NamedFeed, { amberMs: number; redMs: number }> = {
  equity: { amberMs: 4 * 24 * 60 * 60 * 1000, redMs: 7 * 24 * 60 * 60 * 1000 },
  crypto: { amberMs: 15 * 60 * 1000, redMs: 60 * 60 * 1000 },
  fx: { amberMs: 36 * 60 * 60 * 1000, redMs: 7 * 24 * 60 * 60 * 1000 },
  metals: { amberMs: 60 * 60 * 1000, redMs: 24 * 60 * 60 * 1000 },
};

export function isNamedFeed(value: string): value is NamedFeed {
  return (NAMED_FEEDS as readonly string[]).includes(value);
}

/** Cookie value `name:state`, or null when the hook is off, reset, or unreadable. */
export function readFeedForce(cookieHeader: string | null | undefined, allowed: boolean): FeedForce | null {
  if (!allowed || !cookieHeader) return null;
  const part = cookieHeader
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${FEED_FORCE_COOKIE}=`));
  if (!part) return null;
  let raw = part.slice(FEED_FORCE_COOKIE.length + 1);
  try {
    raw = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const [name, state] = raw.split(":");
  if (!name || !isNamedFeed(name)) return null;
  if (state !== "stale" && state !== "failed") return null;
  return { name, state };
}

export function feedForceCookieValue(force: FeedForce): string {
  return `${force.name}:${force.state}`;
}

/** Missed-refresh count the price badge already understands: one is amber, two is red. */
export function forcedRefreshMisses(force: FeedForce | null, feed: NamedFeed, refreshMisses: number): number {
  if (!force || force.name !== feed) return refreshMisses;
  const forced = force.state === "failed" ? 2 : 1;
  return Math.max(refreshMisses, forced);
}

export interface FreshnessCell {
  label: string;
  tone: "ok" | "amber" | "red";
  text: string;
}

/**
 * Paint one status cell for the hook. Other cells are left alone.
 * A null force (reset, or a caller who is not allow-listed) changes nothing.
 */
export function applyFeedForce<T extends FreshnessCell>(rows: T[], force: FeedForce | null): T[] {
  if (!force) return rows;
  const label = FEED_FORCE_LABEL[force.name];
  return rows.map((row) => {
    if (row.label !== label) return row;
    if (force.state === "stale") {
      return { ...row, tone: "amber", text: "— stale (test hook): previous print kept" };
    }
    return { ...row, tone: "red", text: "— failed (test hook)" };
  });
}
