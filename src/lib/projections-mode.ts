/**
 * CR-3 / BL-1: member share projections.
 *
 * PROJECTIONS_EQUITIES_MODE
 *   "reworded" (default, approved 16 Oct 2026): members see a 7-day range per
 *     share, labelled "illustrative scenario, not a forecast", sorted A–Z.
 *     No point percent, no model-confidence column and no confidence ranking.
 *   "paused": the member page shows no share figures at all.
 * Env override: PROJECTIONS_EQUITIES_MODE=paused.
 * Crypto projections stay paused either way (projection-pause.ts).
 */

export type ProjectionsEquitiesMode = "reworded" | "paused";

export function projectionsEquitiesMode(env: Record<string, string | undefined> = process.env): ProjectionsEquitiesMode {
  return env.PROJECTIONS_EQUITIES_MODE === "paused" ? "paused" : "reworded";
}

export const PROJECTIONS_EQUITIES_MODE: ProjectionsEquitiesMode = projectionsEquitiesMode();

/** Label shown next to every projected figure. */
export const ILLUSTRATIVE_LABEL = "Illustrative scenario, not a forecast";

/** One disclaimer in view of every figure on the member page, the email and the explainer. */
export const PROJECTIONS_FMC_DISCLAIMER =
  "Illustrative scenarios calculated from past prices only. They are not forecasts, not a ranking and not financial advice. Prices can move outside any range.";

/**
 * One description used word-for-word on /pricing, /help and /privacy-policy (CR-3).
 */
export const PROJECTIONS_DESCRIPTION =
  "Share projections are for signed-in members: illustrative 7-day ranges for NZX, ASX and US shares, calculated from past prices and listed A–Z. They are scenarios, not forecasts, and general information, not advice. Crypto projections stay paused.";

export const PROJECTIONS_PAUSED_MESSAGE =
  "Share projections are paused. No share figures are shown while they are reviewed. Live prices stay on Markets.";

/** A–Z by ticker. Replaces the old "projected % × model confidence" order. */
export function sortProjectionsNeutral<T extends { ticker: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.ticker.localeCompare(b.ticker, "en", { sensitivity: "base" }));
}

export type IllustrativeRange = { lowPct: number; highPct: number };

/** The base-case 7-day range from the engine's outlook. Null when the outlook has none. */
export function illustrativeRange(outlook: unknown): IllustrativeRange | null {
  const base = (outlook as { base?: { lowPct?: unknown; highPct?: unknown } } | null | undefined)?.base;
  const low = base?.lowPct;
  const high = base?.highPct;
  if (typeof low !== "number" || typeof high !== "number" || !Number.isFinite(low) || !Number.isFinite(high)) return null;
  return low <= high ? { lowPct: low, highPct: high } : { lowPct: high, highPct: low };
}

function signed(n: number): string {
  const abs = Math.abs(n).toFixed(1);
  if (n > 0) return `+${abs}%`;
  if (n < 0) return `−${abs}%`;
  return "0.0%";
}

export function formatIllustrativeRange(range: IllustrativeRange | null): string {
  if (!range) return "No range";
  return `${signed(range.lowPct)} to ${signed(range.highPct)}`;
}

/** Fields a member row may carry in reworded mode. Point move and confidence are removed. */
export const PROJECTION_ROW_DROPPED_KEYS = ["projected7dPct", "confidence", "projection", "history"] as const;
