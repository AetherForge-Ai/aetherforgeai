/**
 * A holding edit is a ledger correction. The numbers are not overwritten in silence.
 */

export interface CorrectionPlan {
  changed: boolean;
  type: "correction";
  quantity: number;
  price: number;
  total: 0;
  notes: string;
}

function qty(n: number): string {
  return String(Math.round((Number(n) || 0) * 1e6) / 1e6);
}

function px(n: number): string {
  return (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);
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
    notes: extra ? `${detail} ${extra}` : detail,
  };
}
