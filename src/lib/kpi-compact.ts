/**
 * DASH-CLEAN-D: short form of a real NZ$ total for a narrow KPI card, e.g. NZ$1.62M.
 * Display only. The full 2dp value stays in the title and aria-label. Null in, null out.
 */
export function compactNzd(value: number | null | undefined, signed = false): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  const abs = Math.abs(value);
  const body = new Intl.NumberFormat("en-NZ", {
    notation: "compact",
    minimumFractionDigits: abs >= 1000 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(abs);
  const sign = value < 0 ? "-" : signed && value > 0 ? "+" : "";
  return `${sign}NZ$${body}`;
}

/** One line for a KPI with no value yet, instead of a dash and two reasons. */
export const KPI_NOT_AVAILABLE = "Not available yet";
