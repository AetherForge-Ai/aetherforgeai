/**
 * The ledger books the figures the member reviewed.
 * A later live price, and today's FX snapshot, are not substituted on save.
 */

import type { Metadata } from "next";
import {
  ensureNzdPerAud,
  ensureNzdPerUsd,
  formatFxInput,
  roundFxRate,
  type CurrencyCode,
  type FxRatesToNZD,
} from "@/lib/currency";

/** The fill price that was reviewed. A newer live spot is ignored. */
export function priceForBooking(submitted: number, _liveSpot?: number | null): number {
  return Number(submitted) || 0;
}

/**
 * FX table for the cash movement. The reviewed NZD-per-unit rate replaces
 * the snapshot for that currency, so a back-dated trade keeps the rate on screen.
 */
export function ratesForBooking(
  currency: CurrencyCode,
  reviewedFx: number | null | undefined,
  snapshot: FxRatesToNZD
): FxRatesToNZD {
  const rates: FxRatesToNZD = { ...snapshot };
  const fx = Number(reviewedFx);
  if (currency !== "NZD" && fx > 0) {
    const directed = currency === "USD" ? ensureNzdPerUsd(fx) : currency === "AUD" ? ensureNzdPerAud(fx) : fx;
    rates[currency] = roundFxRate(directed);
  }
  return rates;
}

/**
 * FX to show when a Buy or Sell opens, including from a holding row.
 * The hardcoded baseline (AUD 1.09) is not painted as today's rate.
 * Null means the field stays blank until the live snapshot arrives.
 */
export function openingFx(input: {
  currency: CurrencyCode;
  live: boolean;
  liveRate?: number | null;
}): string | null {
  if (input.currency === "NZD") return "1.0000";
  if (!input.live || !(Number(input.liveRate) > 0)) return null;
  return formatFxInput(Number(input.liveRate));
}

/** Canonical and Open Graph URL for one public page. Both point at that page. */
export function publicPageMetadata(path: string, input: { title: string; description: string }): Metadata {
  const canonical = path.startsWith("/") ? path : `/${path}`;
  return {
    title: input.title,
    description: input.description,
    alternates: { canonical },
    openGraph: {
      title: input.title,
      description: input.description,
      url: canonical,
      type: "website",
    },
  };
}
