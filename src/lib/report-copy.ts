/**
 * Report sentences that have to match the lists they sit beside (H1, L1, L2).
 */

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

/** A 0.00% pathway does not tell the reader to open a position. */
export function balancedGrowthStep(targetPct: number, topBuy: string | null, bot: "stock" | "crypto"): string {
  if (Math.abs(targetPct) < 0.005) {
    return "This pathway's 7-day target is 0.00%, so it does not initiate a position.";
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

export function notSizedLine(entries: { ticker: string; reason: string }[]): string {
  if (!entries.length) return "";
  return `Not sized this week: ${entries.map((entry) => `${entry.ticker} (${entry.reason})`).join(", ")}.`;
}
