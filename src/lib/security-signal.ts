import type { SecurityIntel } from "@/lib/market-intel";

/**
 * Score-to-rating map for member reports.
 * Public pages do not import this module. The shared market engine keeps the
 * score and does not ship these words.
 */
export function signalFromScore(score: number): SecurityIntel["signal"] {
  if (score >= 72) return "Strong Buy";
  if (score >= 58) return "Buy";
  if (score >= 42) return "Hold";
  if (score >= 28) return "Reduce";
  return "Sell";
}

export function labelIntel<T extends { score: number }>(row: T): T {
  const signal = signalFromScore(row.score);
  if ((row as { signal?: string }).signal === signal) return row;
  return { ...row, signal };
}
