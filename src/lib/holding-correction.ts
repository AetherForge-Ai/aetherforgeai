/**
 * A holding edit is a ledger correction. The numbers are not overwritten in silence.
 * pull-check:track-a2-2026-10-10
 */

import { formatUnitPrice, type CurrencyCode } from "@/lib/currency";

export interface CorrectionPlan {
  changed: boolean;
  type: "correction";
  quantity: number;
  price: number;
  total: 0;
  notes: string;
}

/** Shown on a correction row. Cash stays put; only the cost basis changes. */
export const CORRECTION_CASH_TOOLTIP = "Correction adjusts cost basis; cash unchanged.";

export interface CorrectionSpan {
  beforeQty: string;
  beforePrice: string;
  afterQty: string;
  afterPrice: string;
}

const CORRECTION_SENTENCE =
  /^(Correction:\s*\S+\s+at\s+\S+\s*→\s*\S+\s+at\s+\S+\.?)(?:\s+Cash unchanged\.)?/;

function qty(n: number): string {
  return String(Math.round((Number(n) || 0) * 1e6) / 1e6);
}

/** A price token already carrying a currency symbol is left alone. */
export function correctionPriceToken(raw: string, currency: CurrencyCode = "NZD"): string {
  const token = raw.trim().replace(/\.$/, "");
  if (/\$/.test(token)) return token;
  const n = Number(token.replace(/,/g, ""));
  if (!Number.isFinite(n)) return token;
  return formatUnitPrice(n, currency);
}

/** One correction sentence, then a labelled user note. Never a second "Correction:" line. */
export function collapseCorrectionNote(notes: string | null | undefined): string {
  const text = (notes || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  const match = text.match(CORRECTION_SENTENCE);
  if (!match) return text;
  let sentence = match[1].endsWith(".") ? match[1] : `${match[1]}.`;
  if (!/Cash unchanged\.$/.test(sentence)) sentence = `${sentence} Cash unchanged.`;
  let rest = text.slice(match[0].length).trim().replace(/^\.\s*/, "");
  while (rest) {
    const again = rest.match(CORRECTION_SENTENCE);
    if (!again) break;
    rest = rest.slice(again[0].length).trim().replace(/^\.\s*/, "");
  }
  if (!rest) return sentence;
  const user = rest.replace(/^Note:\s*/i, "");
  return `${sentence} Note: ${user}`;
}

export function ensureCorrectionCurrency(notes: string, currency: CurrencyCode = "NZD"): string {
  return notes.replace(
    /^(Correction:\s*\S+\s+at\s+)(\d[\d,]*(?:\.\d+)?)(\s*→\s*\S+\s+at\s+)(\d[\d,]*(?:\.\d+)?)/,
    (_all, lead: string, before: string, mid: string, after: string) =>
      `${lead}${correctionPriceToken(before, currency)}${mid}${correctionPriceToken(after, currency)}`
  );
}

export function parseCorrectionNote(notes: string | null | undefined): CorrectionSpan | null {
  const text = collapseCorrectionNote(notes);
  const match = text.match(/^Correction:\s*(\S+)\s+at\s+(\S+)\s*→\s*(\S+)\s+at\s+(\S+)/);
  if (!match) return null;
  return {
    beforeQty: match[1],
    beforePrice: match[2],
    afterQty: match[3],
    afterPrice: match[4].replace(/\.$/, ""),
  };
}

/** Row text such as "9000 at NZ$2.22 → 9000 at NZ$2.21". */
export function correctionChangeLabel(
  notes: string | null | undefined,
  currency: CurrencyCode = "NZD"
): string | null {
  const span = parseCorrectionNote(notes);
  if (!span) return null;
  const before = correctionPriceToken(span.beforePrice, currency);
  const after = correctionPriceToken(span.afterPrice, currency);
  return `${span.beforeQty} at ${before} → ${span.afterQty} at ${after}`;
}

export function planHoldingCorrection(input: {
  beforeShares: number;
  afterShares: number;
  beforePrice: number;
  afterPrice: number;
  currency?: CurrencyCode;
  note?: string;
}): CorrectionPlan {
  const currency = input.currency ?? "NZD";
  const changed =
    Math.abs(input.beforeShares - input.afterShares) > 1e-8 ||
    Math.abs(input.beforePrice - input.afterPrice) > 1e-8;
  const detail = `Correction: ${qty(input.beforeShares)} at ${correctionPriceToken(String(input.beforePrice), currency)} → ${qty(input.afterShares)} at ${correctionPriceToken(String(input.afterPrice), currency)}. Cash unchanged.`;
  const extra = (input.note || "").trim();
  return {
    changed,
    type: "correction",
    quantity: input.afterShares,
    price: input.afterPrice,
    total: 0,
    notes: collapseCorrectionNote(extra ? `${detail} ${extra}` : detail),
  };
}
