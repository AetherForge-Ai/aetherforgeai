/**
 * Keeps Stox/Koins report copy aligned with the account's live book.
 * Pure — safe in the report generator, the reports API, and unit tests.
 */

export interface LiveBookPosition {
  ticker: string;
  shares?: number;
  name?: string;
}

const EMPTY_BOOK =
  /empty holdings|empty book|holdings:\s*none|cash-ready\s*\/\s*empty|no monitored (coins|tickers|assets|holdings)|book has \*\*no|your book has \*\*no|portfolio is empty|no holdings yet|zero holdings|cash-only book|cash only book|no (assets|holdings|coins|tickers) are currently monitored/i;

/** True when copy tells the member the book is empty / unmonitored. */
export function claimsEmptyBook(text: string): boolean {
  return EMPTY_BOOK.test(text || "");
}

export function liveBookRoster(holdings: LiveBookPosition[]): string {
  return holdings
    .filter((h) => h.ticker)
    .map((h) => (typeof h.shares === "number" ? `${h.ticker} × ${h.shares}` : h.ticker))
    .join(", ");
}

function mentionsHeldTicker(text: string, holdings: LiveBookPosition[]): boolean {
  const upper = text.toUpperCase();
  return holdings.some((h) => h.ticker && upper.includes(h.ticker.toUpperCase()));
}

/**
 * Rewrite stored or model narrative that denies a book the account actually holds.
 * Text that already names a live ticker and does not claim an empty book is unchanged.
 */
export function reconcileNarrativeWithLiveBook(text: string, holdings: LiveBookPosition[]): string {
  if (!holdings.length || !text) return text;
  if (!claimsEmptyBook(text) && mentionsHeldTicker(text, holdings)) return text;
  const lead = `Live book: ${holdings.length} position${holdings.length === 1 ? "" : "s"} — ${liveBookRoster(holdings)}.`;
  if (claimsEmptyBook(text)) {
    return `${lead} Refresh this report for a full read on these holdings. Earlier wording did not match this account.`;
  }
  return `${lead}\n\n${text}`;
}

export interface GroundNarrativeResult {
  /** Empty when the model claimed an empty book and the caller should keep its deterministic summary. */
  text: string;
  discardedEmptyClaim: boolean;
}

/**
 * Generation-time guard. A narrative that calls a funded book empty is discarded.
 * A narrative that never names a held ticker is prefixed with the live roster.
 */
export function groundReportNarrative(
  narrative: string,
  holdings: LiveBookPosition[]
): GroundNarrativeResult {
  if (!holdings.length) return { text: narrative, discardedEmptyClaim: false };
  if (claimsEmptyBook(narrative)) return { text: "", discardedEmptyClaim: true };
  if (mentionsHeldTicker(narrative, holdings)) return { text: narrative, discardedEmptyClaim: false };
  const lead = `Live holdings: ${liveBookRoster(holdings)}.`;
  return { text: `${lead}\n\n${narrative}`.trim(), discardedEmptyClaim: false };
}

interface StoredReportShape {
  executiveSummary?: string;
  keyObservations?: string[];
  pathwayPlan?: { recommendationNote?: string; [key: string]: unknown };
  [key: string]: unknown;
}

/** Patch a persisted Apex report so history cannot keep describing an empty book. */
export function reconcileStoredReport<T extends StoredReportShape>(report: T, holdings: LiveBookPosition[]): T {
  if (!holdings.length) return report;
  const next: T = { ...report };
  if (typeof next.executiveSummary === "string") {
    next.executiveSummary = reconcileNarrativeWithLiveBook(next.executiveSummary, holdings);
  }
  if (Array.isArray(next.keyObservations)) {
    let observations = next.keyObservations.map((line) =>
      claimsEmptyBook(line) ? `Live book: ${liveBookRoster(holdings)}.` : line
    );
    if (!observations.some((line) => mentionsHeldTicker(line, holdings))) {
      observations = [`Live book (${holdings.length}): ${liveBookRoster(holdings)}.`, ...observations];
    }
    next.keyObservations = observations;
  }
  const note = next.pathwayPlan?.recommendationNote;
  if (next.pathwayPlan && typeof note === "string" && (claimsEmptyBook(note) || !mentionsHeldTicker(note, holdings))) {
    const cleaned = note.replace(/cash-ready\s*\/\s*empty holdings\s*—\s*/i, "");
    next.pathwayPlan = {
      ...next.pathwayPlan,
      recommendationNote: `Live book holds ${liveBookRoster(holdings)}. ${cleaned}`.trim(),
    };
  }
  return next;
}
