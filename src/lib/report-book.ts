/**
 * Keeps Stox/Koins report copy aligned with the account's live book.
 * Pure — safe in the report generator, the reports API, and unit tests.
 */

import { sanitizeGuardedCashText, sanitizeGuardedReport, type LiveCashFigures } from "@/lib/report-consistency";
import { applyPaperQuotes } from "@/lib/paper-quote-lock";

export interface LiveBookPosition {
  ticker: string;
  shares?: number;
  name?: string;
}

const EMPTY_BOOK =
  /empty holdings|empty book|book is empty|holdings:\s*none|cash-ready\s*\/\s*empty|no monitored (coins|tickers|assets|holdings)|book has \*\*no|your book has \*\*no|portfolio is empty|no holdings yet|zero holdings|cash-only book|cash only book|no (assets|holdings|coins|tickers) are currently monitored|no positions|zero positions|nothing held|not holding any|do not hold any|don't hold any|holds nothing|holding nothing|no live (positions|holdings)|unmonitored book/i;

/**
 * Starter paper-book cash line. Only an empty-book claim when the text does
 * not already name a position this account holds — a funded book can still
 * mention a cash balance.
 */
const STARTER_CASH =
  /NZ\$\s*10[,.]?000|\$\s*10[,.]?000(?:\s*cash)?|starter\s+(cash|book|portfolio)|starting\s+(cash|balance)|paper\s+book\s+of\s+NZ\$\s*10/i;

/** True when copy tells the member the book is empty / unmonitored. */
export function claimsEmptyBook(text: string): boolean {
  return EMPTY_BOOK.test(text || "");
}

export function claimsStarterCash(text: string): boolean {
  return STARTER_CASH.test(text || "");
}

export function liveBookRoster(holdings: LiveBookPosition[]): string {
  return holdings
    .filter((h) => h.ticker)
    .map((h) => (typeof h.shares === "number" ? `${h.ticker} × ${h.shares}` : h.ticker))
    .join(", ");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** "WOR.AX" and "WOR" both count as naming the same holding. */
function tickerKeys(ticker: string): string[] {
  const upper = ticker.trim().toUpperCase();
  if (!upper) return [];
  const bare = upper.replace(/\.(AX|NZ|NZX|ASX|L|TO|HK|NASDAQ|NYSE)$/i, "");
  return bare === upper ? [upper] : [upper, bare];
}

function mentionsHeldTicker(text: string, holdings: LiveBookPosition[]): boolean {
  const upper = (text || "").toUpperCase();
  return holdings.some((h) =>
    tickerKeys(h.ticker).some((key) => key.length >= 2 && new RegExp(`\\b${escapeRegExp(key)}\\b`).test(upper))
  );
}

function deniesLiveBook(text: string, holdings: LiveBookPosition[]): boolean {
  if (claimsEmptyBook(text)) return true;
  return claimsStarterCash(text) && !mentionsHeldTicker(text, holdings);
}

/** Owner id from a stock row. Accepts a string or a populated `{ _id }` relation. */
export function ownerIdOf(row: { user?: unknown; userId?: unknown } | null | undefined): string | null {
  if (!row) return null;
  const raw = row.user ?? row.userId;
  if (raw == null || raw === "") return null;
  if (typeof raw === "string" || typeof raw === "number") return String(raw);
  if (typeof raw === "object") {
    const record = raw as { _id?: unknown; id?: unknown };
    const id = record._id ?? record.id;
    if (typeof id === "string" || typeof id === "number") return String(id);
  }
  return null;
}

export interface AccountHoldingRow {
  user?: unknown;
  userId?: unknown;
  ticker?: string | null;
  shares?: number | null;
  name?: string | null;
  company_name?: string | null;
  asset_type?: string | null;
}

/**
 * Positions for one account and one bot. Rows owned by any other account are
 * dropped, including when `user` is a populated object. Untagged rows are kept
 * only when the page has no owner ids at all (legacy single-account query).
 */
export function liveBookForAccount(
  rows: AccountHoldingRow[],
  accountId: string,
  bot: "stock" | "crypto"
): LiveBookPosition[] {
  if (!accountId) return [];
  const tagged = rows.map((row) => ({ row, owner: ownerIdOf(row) }));
  const anyOwned = tagged.some((entry) => entry.owner);
  return tagged
    .filter((entry) => (entry.owner ? entry.owner === accountId : !anyOwned))
    .filter((entry) => {
      const asset = entry.row.asset_type || "stock";
      if (asset === "metal") return false;
      return asset === bot && !!entry.row.ticker;
    })
    .map((entry) => ({
      ticker: String(entry.row.ticker),
      shares: Number(entry.row.shares) || 0,
      name: entry.row.company_name || entry.row.name || String(entry.row.ticker),
    }));
}

/** Rewrite one narrative using only `accountId`'s positions for `bot`. */
export function reconcileNarrativeForAccount(
  accountId: string,
  text: string,
  rows: AccountHoldingRow[],
  bot: "stock" | "crypto"
): string {
  return reconcileNarrativeWithLiveBook(text, liveBookForAccount(rows, accountId, bot), bot);
}

/**
 * Rewrite stored or model narrative that denies a book the account actually holds.
 * Text that already names a live ticker and does not claim an empty book is unchanged,
 * then any Neutral / low / Speculative full-cash deploy line is removed.
 */
export function reconcileNarrativeWithLiveBook(
  text: string,
  holdings: LiveBookPosition[],
  bot: "stock" | "crypto" = "stock"
): string {
  return sanitizeGuardedCashText(alignNarrativeToBook(text, holdings), bot);
}

/** Marker the UI uses so an empty-book run is not shown as the current report. */
export const NOT_CURRENT_REPORT_MARK = "This report is not current.";

export function reportReadsAsNotCurrent(text: string): boolean {
  return (text || "").includes(NOT_CURRENT_REPORT_MARK);
}

function positionCount(holdings: LiveBookPosition[]): number {
  const named = holdings.filter((holding) => holding.ticker).length;
  return named || holdings.length;
}

/** Reports name the book. They do not name a model. */
function stripModelNames(text: string): string {
  return text
    .replace(/\bSuper\s*Grok(?:\s*\d+(?:\.\d+)?)?\b/gi, "")
    .replace(/\bgrok-\d+(?:\.\d+)?\b/gi, "")
    .replace(/\bGrok\b/g, "")
    .replace(/\bAI models?\b/gi, "the report")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}

function rewriteZeroOfZero(text: string, count: number): string {
  return text.replace(/\b(\d+)\s+of\s+0\b/gi, `$1 of ${count}`);
}

function sentencesOf(text: string): string[] {
  return text
    .split(/\n+|(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function dropEmptyBookSentences(text: string): string {
  return sentencesOf(text)
    .filter((sentence) => !claimsEmptyBook(sentence))
    .join(" ")
    .trim();
}

function dedupeSentences(text: string): string {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const sentence of sentencesOf(text)) {
    const key = sentence.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(sentence);
  }
  return kept.join(" ");
}

function alignNarrativeToBook(text: string, holdings: LiveBookPosition[]): string {
  if (!holdings.length || !text) return text;
  const count = positionCount(holdings);
  const named = mentionsHeldTicker(text, holdings);
  const denies = deniesLiveBook(text, holdings);
  const lead = `Live book: ${count} position${count === 1 ? "" : "s"} — ${liveBookRoster(holdings)}.`;
  if (!denies && named) return stripModelNames(text);
  if (denies && !named) {
    return stripModelNames(
      `${NOT_CURRENT_REPORT_MARK} It was prepared before these positions were on the account. ${lead}`
    );
  }
  let body = rewriteZeroOfZero(stripModelNames(text), count);
  if (denies) body = dropEmptyBookSentences(body);
  body = dedupeSentences(body);
  if (!body) return lead;
  if (/live book:/i.test(body)) return dedupeSentences(body);
  if (denies || !named) return dedupeSentences(`${lead}\n\n${body}`.trim());
  return body;
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
  if (deniesLiveBook(narrative, holdings)) return { text: "", discardedEmptyClaim: true };
  if (mentionsHeldTicker(narrative, holdings)) return { text: narrative, discardedEmptyClaim: false };
  const lead = `Live holdings: ${liveBookRoster(holdings)}.`;
  return { text: `${lead}\n\n${narrative}`.trim(), discardedEmptyClaim: false };
}

interface StoredReportShape {
  bot?: string;
  executiveSummary?: string;
  keyObservations?: string[];
  pathwayPlan?: { recommendationNote?: string } | null;
  briefing?: {
    executiveSummary?: string;
    keyObservations?: string[];
    overall?: { bias?: string; level?: string; score?: number };
  } | null;
  directRecommendations?: Array<{ detail?: string }>;
}

/** Patch a persisted Apex report so history cannot keep describing an empty book, a seed price, or a full-cash deploy. */
export function reconcileStoredReport<T extends StoredReportShape>(
  report: T,
  holdings: LiveBookPosition[],
  figures?: LiveCashFigures
): T {
  const bot = report.bot === "crypto" ? "crypto" : "stock";
  if (!holdings.length) return applyPaperQuotes(sanitizeGuardedReport(report, figures));
  const next: T = { ...report };
  const count = positionCount(holdings);
  if (typeof next.executiveSummary === "string") {
    next.executiveSummary = reconcileNarrativeWithLiveBook(next.executiveSummary, holdings, bot);
  }
  if (Array.isArray(next.keyObservations)) {
    const summarySentences = new Set(sentencesOf(next.executiveSummary || "").map((sentence) => sentence.toLowerCase()));
    const seen = new Set<string>();
    const observations: string[] = [];
    for (const line of next.keyObservations) {
      const rewritten = deniesLiveBook(line, holdings)
        ? alignNarrativeToBook(line, holdings)
        : rewriteZeroOfZero(stripModelNames(line), count);
      const key = rewritten.trim().toLowerCase();
      if (!key || seen.has(key) || summarySentences.has(key)) continue;
      seen.add(key);
      observations.push(rewritten);
    }
    if (!observations.some((line) => mentionsHeldTicker(line, holdings)) && !mentionsHeldTicker(next.executiveSummary || "", holdings)) {
      observations.unshift(`Live book (${count}): ${liveBookRoster(holdings)}.`);
    }
    next.keyObservations = observations;
  }
  const note = next.pathwayPlan?.recommendationNote;
  if (next.pathwayPlan && typeof note === "string" && (deniesLiveBook(note, holdings) || !mentionsHeldTicker(note, holdings))) {
    const cleaned = dropEmptyBookSentences(
      rewriteZeroOfZero(stripModelNames(note.replace(/cash-ready\s*\/\s*empty holdings\s*—\s*/i, "")), count)
    );
    const lead = `Live book holds ${liveBookRoster(holdings)}.`;
    const body = dedupeSentences(cleaned);
    next.pathwayPlan = {
      ...next.pathwayPlan,
      recommendationNote: dedupeSentences(body.toLowerCase().includes(lead.toLowerCase()) ? body : `${lead} ${body}`).trim(),
    };
  }
  return applyPaperQuotes(sanitizeGuardedReport(next, figures));
}
