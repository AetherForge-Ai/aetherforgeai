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
 * Trim marker. Uses the configured size and the take-profit band —
 * never the stop/loss percent. Example: "Trim marker 25% at +8–12%".
 * The chip records a level. It is not an instruction to trim.
 */
export function formatTrimChip(alert: AlertChipInput): string {
  const size = num(alert.trimPct);
  const band = formatTakeProfitBand(alert.takeProfitMinPct, alert.takeProfitMaxPct);
  const sizeText = size == null ? null : `${pctText(size)}%`;
  if (sizeText && band) return `Trim marker ${sizeText} at ${band}`;
  if (sizeText) return `Trim marker ${sizeText}`;
  if (band) return `Trim marker at ${band}`;
  return "Trim marker —";
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

/** Sentence built from the saved percents. It describes the levels on file. */
export function formatAlertRuleLine(alert: AlertChipInput): string {
  const size = num(alert.trimPct);
  const dip = num(alert.trimTriggerDipPct);
  const band = formatTakeProfitBand(alert.takeProfitMinPct, alert.takeProfitMaxPct);
  const parts: string[] = [];
  if (size != null && dip != null) {
    parts.push(
      `A trim marker of ${pctText(size)}% is noted if the price is ${pctText(Math.abs(dip))}% under the price paid`
    );
  } else if (size != null) parts.push(`A trim marker of ${pctText(size)}% is noted`);
  else if (dip != null) parts.push(`A level ${pctText(Math.abs(dip))}% under the price paid is noted`);
  if (band) parts.push(`a band of ${band} is noted`);
  return parts.length ? `${parts.join(", ")}. This is information, not an instruction to trade.` : "";
}
