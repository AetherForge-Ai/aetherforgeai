/**
 * Alert-card chips. The trim chip is the take-profit band (how much to sell
 * once the position is up). The sell/stop chip is only the loss versus purchase.
 */

export interface AlertChipInput {
  trimPct?: number | null;
  trimTriggerDipPct?: number | null;
  takeProfitMinPct?: number | null;
  takeProfitMaxPct?: number | null;
}

function num(v: number | null | undefined): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return v;
}

function pctText(v: number): string {
  const rounded = Math.round(v * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

/** Take-profit band, e.g. "+8–12%". Null when neither bound is set. */
export function formatTakeProfitBand(
  minPct?: number | null,
  maxPct?: number | null
): string | null {
  const a = num(minPct);
  const b = num(maxPct);
  if (a == null && b == null) return null;
  const lo = Math.min(a ?? b!, b ?? a!);
  const hi = Math.max(a ?? b!, b ?? a!);
  if (lo === hi) return `+${pctText(lo)}%`;
  return `+${pctText(lo)}–${pctText(hi)}%`;
}

/**
 * Trim chip. Uses the configured trim size and the take-profit band —
 * never the stop/loss percent. Example: "Trim 25% @ +8–12%".
 */
export function formatTrimChip(alert: AlertChipInput): string {
  const size = num(alert.trimPct);
  const band = formatTakeProfitBand(alert.takeProfitMinPct, alert.takeProfitMaxPct);
  const sizeText = size == null ? null : `${pctText(size)}%`;
  if (sizeText && band) return `Trim ${sizeText} @ ${band}`;
  if (sizeText) return `Trim ${sizeText}`;
  if (band) return `Trim @ ${band}`;
  return "Trim —";
}

/**
 * Sell/stop chip. The loss versus purchase only (the −3% default lives here,
 * not on the trim chip).
 */
export function formatSellStopChip(alert: AlertChipInput): string {
  const dip = num(alert.trimTriggerDipPct);
  if (dip == null) return "—";
  return `−${pctText(Math.abs(dip))}%`;
}
