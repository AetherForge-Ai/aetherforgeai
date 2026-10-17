/**
 * Report sentences that have to match the lists they sit beside (H1, L1, L2).
 */

import { formatMoney, type CurrencyCode } from "@/lib/currency";
import { formatPercent } from "@/lib/portfolio";
import { DATA_UNDER_REVIEW, projectionSitsOnClamp } from "@/lib/quote-review";

export function indefiniteArticle(n: number): "a" | "an" {
  const abs = Math.abs(Math.trunc(n));
  if (abs === 8 || abs === 11 || abs === 18) return "an";
  if (abs >= 80 && abs < 90) return "an";
  return "a";
}

/** "1 named … candidate" or "2 named … candidates". */
export function namedCandidateLine(count: number): string {
  const noun = count === 1 ? "candidate" : "candidates";
  return `Empty holdings — leading with ${count} named BUY/ACCUMULATE ${noun} from the full-market sweep.`;
}

export function stripReportMarkdown(text: string): string {
  return String(text || "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/_([^_\n]+)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
}

export interface NamedMove {
  ticker: string;
  changePct: number;
}

/**
 * The session line uses the same gainers the "Top gainers" list will show.
 * A withheld print is not called "no standout" and is not quoted as a percent.
 */
/** "4 prints under review". Null when nothing was withheld. */
export function printsUnderReviewLine(count: number): string | null {
  const n = Math.max(0, Math.trunc(Number(count) || 0));
  if (n <= 0) return null;
  return n === 1 ? "1 print under review" : `${n} prints under review`;
}

export function sessionGainerSentence(validGainers: NamedMove[], withheldCount: number): string {
  const leader = validGainers[0];
  if (leader && leader.changePct > 0) {
    return `${leader.ticker} leads the session (${formatPercent(leader.changePct)}) and tops the gainer board.`;
  }
  if (withheldCount > 0) {
    return "Standout 24-hour prints are under review, so this report does not name a session leader.";
  }
  return "No standout session gainers — the tape is consolidating.";
}

export function aggressiveMomentumStep(
  buyTickers: string[],
  leaders: { ticker: string; projected7dPct: number }[]
): string {
  if (!buyTickers.length) return "Overweight your two strongest Strong-Buy signals.";
  const top = [...leaders]
    .filter((row) => row.projected7dPct > 0)
    .sort((a, b) => b.projected7dPct - a.projected7dPct)
    .slice(0, 2)
    .map((row) => row.ticker);
  const named = buyTickers.join(" & ");
  const same = top.length > 0 && buyTickers.every((ticker) => top.includes(ticker));
  if (same) return `Overweight ${named} — the strongest momentum signals on the projected list.`;
  const lead = top.length ? ` The projected list leads with ${top.join(" & ")}.` : "";
  return `Overweight ${named} — these names fit the suitability cap. They are not the top of the projected list.${lead}`;
}

/** A pathway whose 7-day target is not positive does not tell the reader to open a position. */
export function balancedGrowthStep(targetPct: number, topBuy: string | null, bot: "stock" | "crypto"): string {
  if (!(targetPct > 0)) {
    return `This pathway's 7-day target is ${formatPercent(targetPct)}, so it does not initiate a position.`;
  }
  if (topBuy) {
    const noun = bot === "crypto" ? "digital asset" : "name";
    return `Initiate a starter position in ${topBuy} — a leading ${noun} on this week's sweep. The pathway target is ${formatPercent(targetPct)}.`;
  }
  return bot === "crypto"
    ? "Add one new sector (e.g. DeFi or Layer-2) to lift diversification."
    : "Add one new sector to lift diversification.";
}

/** Shown once above the projected-mover list. The rank order is unchanged. */
export const PROJECTION_RANK_NOTE =
  "Ranked by projected 7-day move only. A rank is not a buy rating; each name's rating is shown.";

/** Under-review mover. No rank and no percent. */
export function printUnderReviewLabel(ticker: string): string {
  return `${ticker} — print under review`;
}

/**
 * Example Stox wording for the public Stox page only. It is not a live recommendation.
 * A member report lists that member's own under-review names and does not use this sentence.
 */
export function stoxReviewCopy(): string {
  const notice = printsUnderReviewLine(1);
  const label = printUnderReviewLabel("EXAMPLE.NZ");
  // Public pages never carry a trade-signal label (BUY/HOLD/TRIM/SELL) or a real ticker.
  return `Example. Not a recommendation. ${notice}. ${label}. The note gives the reason the price was set aside, for example a price that moved too far from the previous close to be checked.`;
}

/** Names this member's report actually withheld. The public example is not included. */
export function memberUnderReviewLines(report: {
  tickers?: { ticker?: string | null; changeWithheld?: boolean }[];
  marketMovers?: { windows: { underReview?: { ticker: string }[] }[] }[];
  notSized?: { ticker: string; reason: string }[];
}): string[] {
  const reasons = new Map<string, string>();
  for (const row of report.notSized ?? []) {
    const ticker = row.ticker.trim().toUpperCase();
    const reason = row.reason.trim();
    if (!ticker || !/under review/i.test(reason)) continue;
    if (reason.toLowerCase() !== "print under review") reasons.set(ticker, reason);
  }
  const names = new Set<string>(reasons.keys());
  for (const group of report.marketMovers ?? []) {
    for (const window of group.windows) {
      for (const row of window.underReview ?? []) {
        const ticker = row.ticker.trim().toUpperCase();
        if (ticker) names.add(ticker);
      }
    }
  }
  for (const row of report.tickers ?? []) {
    if (!row.changeWithheld) continue;
    const ticker = String(row.ticker || "").trim().toUpperCase();
    if (ticker) names.add(ticker);
  }
  return [...names].sort().map((ticker) => {
    const reason = reasons.get(ticker);
    const label = printUnderReviewLabel(ticker);
    return reason ? `${label}. ${ticker} reason: ${reason}` : label;
  });
}

/** One projected row, in the order the list already has. */
export function projectionLeaderLine(
  index: number,
  row: {
    ticker: string;
    market: string;
    price: number;
    currency: string;
    projected7dPct: number;
    confidence: number;
    ratingLabel: string;
  }
): string {
  const move =
    row.market === "CRYPTO" && projectionSitsOnClamp(row.projected7dPct)
      ? DATA_UNDER_REVIEW
      : formatPercent(row.projected7dPct);
  return `${index}. ${row.ticker} · ${row.market} ${formatMoney(row.price, row.currency as CurrencyCode)} ${move} ${row.confidence}% · ${row.ratingLabel}`;
}

/** "BUY", "HOLD", or "Not a buy: <reason>". A not-sized reason wins over the card word. */
export function projectionRatingLabel(signal: string, notSizedReason?: string | null): string {
  const reason = String(notSizedReason || "").trim();
  if (reason) return `Not a buy: ${reason}`;
  if (signal === "Buy" || signal === "Strong Buy" || signal === "Accumulate") return "BUY";
  if (signal === "Hold") return "HOLD";
  if (signal === "Sell") return "Not a buy: rating SELL: signal Sell";
  if (signal === "Reduce") return "Not a buy: rating TRIM: signal Reduce";
  return "Not a buy: rating data unavailable";
}

export function notSizedLine(entries: { ticker: string; reason: string }[]): string {
  if (!entries.length) return "";
  return `Not sized this week: ${entries.map((entry) => `${entry.ticker} (${entry.reason})`).join(", ")}.`;
}

/**
 * Goal b12 H-12: saved reports generated before the 15 Oct 2026 wording change
 * still carry BUY / ACCUMULATE / SELL labels. They are re-labelled at view time
 * (stored data is untouched) as neutral model indicators, never advice.
 */
const NEUTRAL_LABELS: Record<string, string> = {
  "STRONG BUY": "Strong positive signal",
  BUY: "Positive signal",
  ACCUMULATE: "Positive signal",
  HOLD: "Neutral signal",
  TRIM: "Weakening signal",
  SELL: "Negative signal",
  "STRONG SELL": "Strong negative signal",
};

export function neutralRatingLabel(action: string | null | undefined): string {
  const key = String(action ?? "").trim().toUpperCase();
  return NEUTRAL_LABELS[key] ?? (key ? "Model indicator" : "—");
}

export function neutraliseRatingWording(text: string): string {
  return text
    .replace(/\bBuy or Accumulate rating\b/gi, "positive model signal")
    .replace(/\bStrong buy\b/gi, "strong positive signal")
    .replace(/\bStrong sell\b/gi, "strong negative signal")
    .replace(/\b(BUY|ACCUMULATE)\s*\/\s*(BUY|ACCUMULATE)\b/g, "positive-signal")
    .replace(/\b(ACCUMULATE|BUY)\b(?=\s+[A-Z0-9.\-]{1,12}\b)/g, "Positive signal:")
    .replace(/\bHOLD\b(?=\s+[A-Z0-9][A-Z0-9.\-]{0,11}\b)/g, "Neutral signal:")
    .replace(/\bTRIM\b(?=\s+[A-Z0-9][A-Z0-9.\-]{0,11}\b)/g, "Weakening signal:")
    .replace(/\b(?:do not|don't) deploy the full cash balance\b/gi, "the model's scenario kept part of the cash balance uninvested")
    .replace(/\b(?:do not|don't) (deploy|buy|sell)\b/gi, (_m, v: string) => `the model's scenario did not ${v.toLowerCase()}`)
    .replace(/\bNew buys are limited to\b/g, "The model's scenario limited new positions to")
    .replace(/\bnew buys\b/gi, "new positions")
    .replace(/\bACCUMULATE\b/g, "positive signal")
    .replace(/\bBUY\b/g, "positive signal")
    .replace(/\bSELL\b/g, "negative signal")
    .replace(/\b(?:Accumulate|Buy) rating\b/g, "positive model signal")
    .replace(/\bSell rating\b/g, "negative model signal");
}

/** Deep copy with every display string neutralised. Enum keys (action) keep their value for styling. */
export function neutraliseReportStrings<T>(value: T, key = ""): T {
  if (typeof value === "string") return (key === "action" ? value : neutraliseRatingWording(value)) as T;
  if (Array.isArray(value)) return value.map((v) => neutraliseReportStrings(v, key)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = neutraliseReportStrings(v, k);
    return out as T;
  }
  return value;
}

export const OLD_WORDING_BANNER =
  "Generated before 15 Oct 2026 under older wording. Ratings shown are historical model labels, not recommendations. General information, not financial advice.";
