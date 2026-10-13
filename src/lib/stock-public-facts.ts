import { formatUnitPrice } from "@/lib/currency";

export const RANGE_MISSING = "— The feed did not send a 52-week range.";
export const CHART_MISSING = "— The feed did not send a six-month series.";
export const NEWS_MISSING = "— No stored headline mentions this name.";
export const SECTOR_MISSING = "— The listing does not name a sector.";

const MONEY = new Set(["NZD", "AUD", "USD"]);

export function fiftyTwoWeekLine(
  low: number | null | undefined,
  high: number | null | undefined,
  currency: string | null | undefined
): string {
  if (!(typeof low === "number" && low > 0 && typeof high === "number" && high > 0)) return RANGE_MISSING;
  const code = (currency || "").toUpperCase();
  if (!MONEY.has(code)) return RANGE_MISSING;
  return `${formatUnitPrice(low, code as "NZD" | "AUD" | "USD")} – ${formatUnitPrice(high, code as "NZD" | "AUD" | "USD")}`;
}

export function sectorLine(sector: string | null | undefined): string {
  const text = (sector || "").trim();
  if (!text || text === "Not stated") return SECTOR_MISSING;
  return text;
}

/** SVG polyline points. Null when fewer than two positive closes arrived. */
export function sparklinePoints(closes: number[], width = 280, height = 72): string | null {
  const points = closes.filter((value) => Number.isFinite(value) && value > 0);
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  return points
    .map((value, index) => {
      const x = (index / (points.length - 1)) * width;
      const y = height - ((value - min) / span) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function headlinesForSymbol(
  items: ReadonlyArray<{ headline: string; summary?: string }>,
  symbol: string
): string[] {
  const key = symbol.replace(/\.(NZ|AX|L)$/i, "").trim().toUpperCase();
  if (key.length < 2) return [];
  const hits: string[] = [];
  for (const item of items) {
    const blob = `${item.headline} ${item.summary || ""}`.toUpperCase();
    if (!blob.includes(key)) continue;
    hits.push(item.headline);
    if (hits.length === 3) break;
  }
  return hits;
}
