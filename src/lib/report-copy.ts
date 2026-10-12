/**
 * Report sentences that have to match the lists they sit beside (H1, L1, L2).
 */

import { formatMoney, type CurrencyCode } from "@/lib/currency";
import { formatPercent } from "@/lib/portfolio";

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
    const pct = Math.round(leader.changePct * 100) / 100;
    return `${leader.ticker} leads the session (+${pct}%) and tops the gainer board.`;
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
    const pct = Math.abs(targetPct) < 0.005 ? 0 : Math.round(targetPct * 100) / 100;
    const signed = pct === 0 ? "0.00%" : `${pct}%`;
    return `This pathway's 7-day target is ${signed}, so it does not initiate a position.`;
  }
  if (topBuy) {
    const pct = Math.round(targetPct * 100) / 100;
    const signed = `${pct > 0 ? "+" : ""}${pct}%`;
    const noun = bot === "crypto" ? "digital asset" : "name";
    return `Initiate a starter position in ${topBuy} — a leading ${noun} on this week's sweep. The pathway target is ${signed}.`;
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
  return `${index}. ${row.ticker} · ${row.market} ${formatMoney(row.price, row.currency as CurrencyCode)} ${formatPercent(row.projected7dPct)} ${row.confidence}% · ${row.ratingLabel}`;
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
