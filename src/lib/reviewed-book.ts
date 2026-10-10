/**
 * The ledger books the figures the member reviewed.
 * A later live price, and today's FX snapshot, are not substituted on save.
 */

import type { Metadata } from "next";
import {
  ensureNzdPerAud,
  ensureNzdPerUsd,
  formatFxInput,
  normaliseUnitPrice,
  roundFxRate,
  type CurrencyCode,
  type FxRatesToNZD,
} from "@/lib/currency";

export { dexPriceForSymbol } from "@/lib/crypto-dex";

/** The fill price that was reviewed. A newer live spot is ignored. Sub-cent prices are not rounded. */
export function priceForBooking(submitted: number, _liveSpot?: number | null): number {
  return normaliseUnitPrice(submitted) ?? 0;
}

/** A client FX rate may sit this far from the snapshot or the trade-date rate. */
export const REVIEWED_FX_BAND = 0.05;

export const REVIEWED_FX_REJECTED =
  "That exchange rate is too far from the market rate for this trade date. Use a rate within 5% of it.";

function directedFx(currency: CurrencyCode, rate: number): number {
  if (currency === "USD") return ensureNzdPerUsd(rate);
  if (currency === "AUD") return ensureNzdPerAud(rate);
  return rate;
}

/**
 * NZD per 1 unit stored on a ledger row.
 * NZD is 1. A blank or non-positive rate is omitted. The baseline table is never substituted.
 */
export function ledgerFxRate(currency: CurrencyCode, reviewed: number | null | undefined): number | undefined {
  if (currency === "NZD") return 1;
  const raw = Number(reviewed);
  if (!(raw > 0) || !Number.isFinite(raw)) return undefined;
  const directed = directedFx(currency, raw);
  if (!(directed > 0) || !Number.isFinite(directed)) return undefined;
  return directed;
}

function withinBand(reviewed: number, reference: number): boolean {
  if (!(reference > 0) || !Number.isFinite(reference)) return false;
  return Math.abs(reviewed - reference) / reference <= REVIEWED_FX_BAND;
}

/**
 * A reviewed FX rate is booked only when it is within 5% of today's snapshot
 * or the historical rate for that trade date. NZD and a blank rate are left alone.
 */
export function reviewedFxAllowed(input: {
  currency: CurrencyCode;
  reviewed: number | null | undefined;
  snapshot: number;
  historical?: number | null;
}): { ok: true } | { ok: false; message: string } {
  if (input.currency === "NZD") return { ok: true };
  const raw = Number(input.reviewed);
  if (!(raw > 0) || !Number.isFinite(raw)) return { ok: true };
  const reviewed = directedFx(input.currency, raw);
  const references = [input.snapshot, input.historical]
    .filter((rate): rate is number => typeof rate === "number" && rate > 0 && Number.isFinite(rate))
    .map((rate) => directedFx(input.currency, rate));
  if (!references.length || references.some((rate) => withinBand(reviewed, rate))) return { ok: true };
  return { ok: false, message: REVIEWED_FX_REJECTED };
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
      images: [{ url: "/brand/og-1200x630.png", width: 1200, height: 630, alt: "AetherForge AI" }],
    },
  };
}
