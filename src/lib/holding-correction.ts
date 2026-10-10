/**
 * A holding edit is a ledger correction. The numbers are not overwritten in silence.
 */

import { formatPriceInput } from "@/lib/currency";

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
  /^(Correction:\s*\S+\s+at\s+\S+\s*→\s*\S+\s+at\s+\S+)\.?/;

/** One copy of the correction sentence, then any extra note that is not that sentence. */
export function collapseCorrectionNote(notes: string | null | undefined): string {
  const text = (notes || "").trim();
  if (!text) return "";
  const match = text.match(CORRECTION_SENTENCE);
  if (!match) return text;
  const detail = match[1].endsWith(".") ? match[1] : `${match[1]}.`;
  let rest = text;
  while (rest.startsWith(detail) || rest.startsWith(match[1])) {
    rest = rest.startsWith(detail) ? rest.slice(detail.length) : rest.slice(match[1].length);
    rest = rest.trim().replace(/^\.\s*/, "");
  }
  return rest ? `${detail} ${rest}` : detail;
}

export function parseCorrectionNote(notes: string | null | undefined): CorrectionSpan | null {
  const text = collapseCorrectionNote(notes);
  const match = text.match(/^Correction:\s*(\S+)\s+at\s+(\S+)\s*→\s*(\S+)\s+at\s+(\S+)\.?/);
  if (!match) return null;
  return {
    beforeQty: match[1],
    beforePrice: match[2],
    afterQty: match[3],
    afterPrice: match[4].replace(/\.$/, ""),
  };
}

/** Row text such as "9000 at 2.22 → 9000 at 2.21". */
export function correctionChangeLabel(notes: string | null | undefined): string | null {
  const span = parseCorrectionNote(notes);
  if (!span) return null;
  return `${span.beforeQty} at ${span.beforePrice} → ${span.afterQty} at ${span.afterPrice}`;
}

function qty(n: number): string {
  return String(Math.round((Number(n) || 0) * 1e6) / 1e6);
}

function px(n: number): string {
  const value = Number(n) || 0;
  if (Math.abs(value) > 0 && Math.abs(value) < 1) return formatPriceInput(value);
  return (Math.round(value * 100) / 100).toFixed(2);
}

export function planHoldingCorrection(input: {
  beforeShares: number;
  afterShares: number;
  beforePrice: number;
  afterPrice: number;
  note?: string;
}): CorrectionPlan {
  const changed =
    Math.abs(input.beforeShares - input.afterShares) > 1e-8 ||
    Math.abs(input.beforePrice - input.afterPrice) > 1e-8;
  const detail = `Correction: ${qty(input.beforeShares)} at ${px(input.beforePrice)} → ${qty(input.afterShares)} at ${px(input.afterPrice)}.`;
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
