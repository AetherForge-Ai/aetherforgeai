/**
 * Quote waits for the portfolio snapshot.
 * The stocks route abandons a live overlay after 1.2s. The snapshot uses the
 * same cap so one slow feed cannot hold the dashboard. A miss falls back to
 * the stored holding price.
 */

export const SNAPSHOT_QUOTE_WAIT_MS = 1_200;

export const STORED_HOLDING_PRICE = "Stored holding price";

export interface RacedQuote<T> {
  value: T;
  /** True only when the wait elapsed. A rejection is a miss, not a timeout. */
  timedOut: boolean;
}

/**
 * Resolve `work` or the fallback, whichever comes first.
 * A late resolution or rejection is ignored so it cannot reject the request.
 */
export function raceQuoteFetch<T>(
  work: Promise<T>,
  fallback: T,
  waitMs = SNAPSHOT_QUOTE_WAIT_MS
): Promise<RacedQuote<T>> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: T, timedOut: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ value, timedOut });
    };
    const timer = setTimeout(() => finish(fallback, true), waitMs);
    work.then(
      (value) => finish(value, false),
      () => finish(fallback, false)
    );
  });
}

/**
 * Live print when the feed returned one. Otherwise the stored price, labelled
 * as stored. A contaminated equity print is left blank rather than replaced
 * with the purchase price.
 */
export function priceFromQuoteOrStored(input: {
  livePrice: number | null | undefined;
  stored: number;
  purchase?: number;
  contaminated?: (stored: number, purchase: number) => boolean;
  liveSource: string;
  missingReason: string;
}): { price: number | null; reason: string | null; source: string; usedLive: boolean } {
  const live = Number(input.livePrice);
  if (Number.isFinite(live) && live > 0) {
    return { price: live, reason: null, source: input.liveSource, usedLive: true };
  }
  const stored = Number(input.stored);
  const purchase = Number(input.purchase) || 0;
  if (Number.isFinite(stored) && stored > 0 && !input.contaminated?.(stored, purchase)) {
    return { price: stored, reason: null, source: STORED_HOLDING_PRICE, usedLive: false };
  }
  return { price: null, reason: input.missingReason, source: STORED_HOLDING_PRICE, usedLive: false };
}
