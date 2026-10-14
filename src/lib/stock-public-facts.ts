import { formatUnitPrice } from "@/lib/currency";

export const RANGE_MISSING = "— The feed did not send a 52-week range.";
export const CHART_MISSING = "— The feed did not send a six-month series.";
export const NEWS_MISSING = "— No stored headline mentions this name.";
export const SECTOR_MISSING = "— The listing does not name a sector.";

const MONEY = new Set(["NZD", "AUD", "USD"]);

export const RANGE_IMPLAUSIBLE = "— The 52-week range from the data provider does not match the current price, so it is not shown.";

export function fiftyTwoWeekLine(
  low: number | null | undefined,
  high: number | null | undefined,
  currency: string | null | undefined,
  price?: number | null
): string {
  if (!(typeof low === "number" && low > 0 && typeof high === "number" && high > 0)) return RANGE_MISSING;
  if (high < low) return RANGE_MISSING;
  // A bad vendor print (e.g. MPG.NZ low NZ$0.038 with the price at NZ$0.87) is not shown.
  if (typeof price === "number" && price > 0 && (low < price * 0.2 || high > price * 5)) return RANGE_IMPLAUSIBLE;
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

/** Corporate suffixes dropped from the end of a company name before matching. */
const NAME_SUFFIX = new Set([
  "LTD",
  "LIMITED",
  "GROUP",
  "HOLDINGS",
  "HOLDING",
  "INC",
  "CORP",
  "CORPORATION",
  "COMPANY",
  "PLC",
  "CO",
  "NL",
  "NZ",
  "THE",
  "AND",
  "OF",
]);

/** Generic or place words. A name made only of these never matches on its own. */
const GENERIC_WORDS = new Set([
  "NEW",
  "ZEALAND",
  "AUSTRALIA",
  "AUSTRALIAN",
  "BANK",
  "ENERGY",
  "MINING",
  "GROUP",
  "RESOURCES",
  "INTERNATIONAL",
  "GLOBAL",
  "CAPITAL",
  "PROPERTY",
  "PROPERTIES",
  "INVESTMENTS",
  "FUND",
  "TRUST",
  "GOLD",
  "OIL",
  "GAS",
  "POWER",
  "AIR",
  "THE",
  "AND",
  "OF",
]);

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** "Air New Zealand Limited" -> "AIR NEW ZEALAND". Null when only one generic word is left. */
export function distinctiveCompanyName(companyName: string | null | undefined): string | null {
  const words = String(companyName || "")
    .toUpperCase()
    .replace(/&/g, " AND ")
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
  while (words.length && NAME_SUFFIX.has(words[words.length - 1])) words.pop();
  while (words.length && words[0] === "THE") words.shift();
  if (!words.length) return null;
  if (words.length === 1 && (GENERIC_WORDS.has(words[0]) || words[0].length < 4)) return null;
  const phrase = words.join(" ");
  return phrase.length >= 4 ? phrase : null;
}

/**
 * Headlines that name this listing. A match is the full distinctive company name,
 * or the ticker written as a ticker (AIR.NZ, NZX:AIR, (AIR)). Single generic or
 * place words never match. No match means the caller shows NEWS_MISSING.
 */
export function headlinesForSymbol(
  items: ReadonlyArray<{ headline: string; summary?: string }>,
  symbol: string,
  companyName?: string
): string[] {
  const raw = symbol.trim().toUpperCase();
  const key = raw.replace(/\.(NZ|AX|L)$/i, "");
  if (key.length < 2) return [];
  const k = escapeRe(key);
  const tickerForms = [
    `(?:^|[^A-Z0-9])${k}\\.(?:NZ|AX|L)(?![A-Z0-9])`,
    `(?:NZX|ASX|NYSE|NASDAQ|LSE)\\s*:\\s*${k}(?![A-Z0-9])`,
    `\\(\\s*${k}(?:\\.(?:NZ|AX|L))?\\s*\\)`,
  ];
  const ticker = new RegExp(tickerForms.join("|"));
  const name = distinctiveCompanyName(companyName);
  const named = name
    ? new RegExp(`(?:^|[^A-Z0-9])${name.split(" ").map(escapeRe).join("[\\s-]+")}(?:[^A-Z0-9]|$)`)
    : null;
  const hits: string[] = [];
  for (const item of items) {
    const blob = item.headline.toUpperCase();
    if (!ticker.test(blob) && !(named && named.test(blob))) continue;
    hits.push(item.headline);
    if (hits.length === 3) break;
  }
  return hits;
}
