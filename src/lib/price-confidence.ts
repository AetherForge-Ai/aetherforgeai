/**
 * Per-price freshness. A failed refresh keeps the last print as amber.
 * The next failed refresh, or a missing print, is red.
 * Wording stays delayed and public. No licence claim.
 *
 * pull-check:batch2-2026-10-11 B2-6
 */

export const PRICE_FRESH_MS = 20 * 60 * 1000;
export const PRICE_AMBER_MS = 24 * 60 * 60 * 1000;

export type PriceTone = "green" | "amber" | "red";

export interface PriceBadge {
  source: string;
  delay: string;
  updated: string;
  tone: PriceTone;
  why: string;
}

export function priceBadge(input: {
  source: string;
  delay: string;
  quotedAt: Date | null;
  now?: Date;
  /** False when this refresh did not return a quote. */
  refreshOk: boolean;
  /** How many refreshes in a row failed. One is amber. Two is red. */
  failedRefreshes?: number;
  freshMs?: number;
  amberMs?: number;
}): PriceBadge {
  const now = input.now ?? new Date();
  const freshMs = input.freshMs ?? PRICE_FRESH_MS;
  const amberMs = input.amberMs ?? PRICE_AMBER_MS;
  const failed = input.failedRefreshes ?? (input.refreshOk ? 0 : 1);
  const quotedAt = input.quotedAt && !Number.isNaN(input.quotedAt.getTime()) ? input.quotedAt : null;
  const age = quotedAt ? now.getTime() - quotedAt.getTime() : null;
  const updated = quotedAt ? quotedAt.toISOString() : "unavailable";

  let tone: PriceTone = "green";
  let why = "";
  if (!quotedAt || age == null || age < 0) {
    tone = "red";
    why = "No quote on this refresh.";
  } else if (failed >= 2 || age > amberMs) {
    tone = "red";
    why = failed >= 2 ? "The feed missed two refreshes." : "The last print is too old to treat as current.";
  } else if (failed === 1 || age > freshMs) {
    tone = "amber";
    why = failed === 1 ? "The last refresh did not return a quote. The previous print is still on screen." : "This print is older than the usual delay.";
  }

  return {
    source: input.source,
    delay: input.delay,
    updated,
    tone,
    why,
  };
}
