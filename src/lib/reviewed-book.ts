/**
 * The ledger books the figures the member reviewed.
 * A later live price, and today's FX snapshot, are not substituted on save.
 */

import type { Metadata } from "next";
import {
  BASELINE_FX_TO_NZD,
  ensureNzdPerAud,
  ensureNzdPerUsd,
  formatFxInput,
  normaliseUnitPrice,
  roundFxRate,
  type CurrencyCode,
  type FxRatesToNZD,
} from "@/lib/currency";
import { pageTitle } from "@/lib/page-title";

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
 * A reviewed FX rate is booked only when it is within 5% of the trade-date rate.
 * Today's snapshot is used only when that date has no rate. NZD is not checked.
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
  const historical = Number(input.historical);
  const dated = historical > 0 && Number.isFinite(historical) ? directedFx(input.currency, historical) : 0;
  const snapshot = Number(input.snapshot);
  const reference = dated > 0 ? dated : snapshot > 0 && Number.isFinite(snapshot) ? directedFx(input.currency, snapshot) : 0;
  if (!(reference > 0) || withinBand(reviewed, reference)) return { ok: true };
  return { ok: false, message: REVIEWED_FX_REJECTED };
}

/** Shown when a non-NZD trade has no reviewed rate, no trade-date rate, and no live snapshot. */
export const FX_RATE_UNAVAILABLE =
  "Today's exchange rate did not load, and there is no rate for this trade date. Type the NZD rate, or try again.";

export type BookingFxSnapshot = {
  ratesToNZD?: FxRatesToNZD | null;
  sourced?: boolean;
} | null;

function positiveRate(value: number | null | undefined): number | null {
  const n = Number(value);
  return n > 0 && Number.isFinite(n) ? n : null;
}

/** A timeout and the unsourced baseline table are not a live rate. A different table is, even if `sourced` is omitted. */
export function bookableSnapshotRates(snapshot: BookingFxSnapshot): FxRatesToNZD | null {
  const rates = snapshot?.ratesToNZD;
  if (!rates) return null;
  if (snapshot?.sourced === true) return rates;
  const baseline =
    Number(rates.NZD) === BASELINE_FX_TO_NZD.NZD &&
    Number(rates.AUD) === BASELINE_FX_TO_NZD.AUD &&
    Number(rates.USD) === BASELINE_FX_TO_NZD.USD;
  return baseline ? null : rates;
}

function copyRates(rates: FxRatesToNZD): FxRatesToNZD {
  return { NZD: 1, AUD: Number(rates.AUD), USD: Number(rates.USD) };
}

function neutralRates(): FxRatesToNZD {
  return { NZD: 1, AUD: 1, USD: 1 };
}

/**
 * Rates for one booking. The baseline table is never copied in.
 * A non-NZD trade without a reviewed rate uses the trade-date rate, then the live snapshot.
 * A reviewed rate is checked against that trade-date rate when it exists.
 */
export function bookingFxDecision(input: {
  currency: CurrencyCode;
  reviewed: number | null | undefined;
  snapshot: BookingFxSnapshot;
  historical: number | null | undefined;
}): { ok: true; ratesToNZD: FxRatesToNZD } | { ok: false; message: string } {
  const live = bookableSnapshotRates(input.snapshot);
  if (input.currency === "NZD") {
    return { ok: true, ratesToNZD: live ? copyRates(live) : neutralRates() };
  }
  const historical = positiveRate(input.historical);
  const liveRate = live ? positiveRate(live[input.currency]) : null;
  const check = reviewedFxAllowed({
    currency: input.currency,
    reviewed: input.reviewed,
    snapshot: liveRate ?? 0,
    historical,
  });
  if (check.ok === false) return check;
  const reviewed = Number(input.reviewed);
  const hasReviewed = reviewed > 0 && Number.isFinite(reviewed);
  const chosen = historical ?? liveRate;
  if (!hasReviewed && chosen == null) return { ok: false, message: FX_RATE_UNAVAILABLE };
  const rates = live ? copyRates(live) : neutralRates();
  if (!hasReviewed && chosen != null) rates[input.currency] = chosen;
  return { ok: true, ratesToNZD: rates };
}

/** Spot printed as live= in the audit note. A missing snapshot stays null. The fill price is not a substitute. */
export function auditLivePrice(liveSpot: number | null | undefined): number | null {
  return liveSpot != null && liveSpot > 0 ? liveSpot : null;
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
  const title = pageTitle(input.title);
  return {
    title,
    description: input.description,
    alternates: { canonical },
    openGraph: {
      title,
      description: input.description,
      url: canonical,
      type: "website",
      images: [{ url: "/brand/og-1200x630.png", width: 1200, height: 630, alt: "AetherForge AI" }],
    },
  };
}
