/**
 * One rating per asset for Stox and Koins reports.
 *
 * Cards, momentum counts, direct recommendations, and the executive summary
 * all read this module. A seeded "Strong Buy" cannot sit next to a live HOLD,
 * and a Neutral / low-conviction tape cannot be told to deploy the full cash
 * balance into speculative movers.
 */

import type { ConvictionLevel, SecurityIntel } from "@/lib/market-intel";
import { bookCashReserve, sharedReserveSentence } from "@/lib/headmaster-trust";
import { indefiniteArticle } from "@/lib/report-copy";

export type CanonicalAction = "SELL" | "TRIM" | "HOLD" | "BUY" | "ACCUMULATE";

export type CardSignal = "Strong Buy" | "Buy" | "Accumulate" | "Hold" | "Watch" | "Reduce" | "Sell";

export interface RatingInput {
  signal: SecurityIntel["signal"];
  macdSignal: SecurityIntel["macdSignal"];
  regime: string;
}

export interface TapeRead {
  bias: "Constructive" | "Defensive" | "Neutral";
  level: ConvictionLevel;
  score: number;
  averageConfidence: number;
}

export type GuardMode = "full" | "starter" | "defensive";

export interface DeploymentGuard {
  mode: GuardMode;
  maxNewNames: number;
  /** Fraction of cash copy may suggest putting to work (0–1). */
  maxDeployFraction: number;
  /** Absolute 7-day model move above which a new name is watch-only. */
  projectionCapPct: number;
  headline: string;
}

export interface CanonicalRating {
  action: CanonicalAction;
  cardSignal: CardSignal;
  positiveMomentum: boolean;
}

/** Aggregate tape used by the briefing and by cash-deployment guardrails. */
export function readTape(
  technicals: Array<Pick<SecurityIntel, "signal" | "score" | "confidence" | "conviction" | "regime">>
): TapeRead {
  const n = technicals.length;
  const avgEdge = n ? technicals.reduce((s, t) => s + (t.score - 50), 0) / n : 0;
  const averageConfidence = n ? Math.round(technicals.reduce((s, t) => s + t.confidence, 0) / n) : 0;
  const score = Math.round(Math.max(0, Math.min(100, 50 + avgEdge)));
  const highConv = technicals.filter((t) => t.conviction === "High");
  const speculative = technicals.filter((t) => t.conviction === "Speculative");
  const bias: TapeRead["bias"] = avgEdge > 5 ? "Constructive" : avgEdge < -5 ? "Defensive" : "Neutral";

  let level: ConvictionLevel;
  if (n && speculative.length / n >= 0.5) level = "Speculative";
  else if (n && highConv.length / n >= 0.34 && Math.abs(avgEdge) > 6) level = "High";
  else if (Math.abs(avgEdge) > 4 || (n && highConv.length >= 1)) level = "Moderate";
  else level = "Low";

  return { bias, level, score, averageConfidence };
}

/**
 * The only action a report may show for this asset.
 * A bearish MACD, or a downtrend that is also MACD-bearish, cannot be a buy.
 */
export function canonicalAction(input: RatingInput): CanonicalAction {
  const downAndBearish = input.regime === "Trending Down" && input.macdSignal === "Bearish";
  if (downAndBearish && input.signal !== "Sell" && input.signal !== "Reduce") return "HOLD";
  if ((input.signal === "Strong Buy" || input.signal === "Buy") && input.macdSignal === "Bearish") return "HOLD";
  switch (input.signal) {
    case "Sell":
      return "SELL";
    case "Reduce":
      return "TRIM";
    case "Strong Buy":
      return "ACCUMULATE";
    case "Buy":
      return "BUY";
    default:
      return "HOLD";
  }
}

export function cardSignalFor(action: CanonicalAction): CardSignal {
  switch (action) {
    case "ACCUMULATE":
      return "Strong Buy";
    case "BUY":
      return "Buy";
    case "TRIM":
      return "Reduce";
    case "SELL":
      return "Sell";
    default:
      return "Hold";
  }
}

export function rateAsset(input: RatingInput): CanonicalRating {
  const action = canonicalAction(input);
  return {
    action,
    cardSignal: cardSignalFor(action),
    positiveMomentum: action === "BUY" || action === "ACCUMULATE",
  };
}

export function isConstructiveCard(signal: string): boolean {
  return signal === "Strong Buy" || signal === "Buy" || signal === "Accumulate";
}

function sp(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return `${rounded >= 0 ? "+" : ""}${rounded}%`;
}

export interface AlignedProjection {
  /** Midpoint of the base case — the only point figure the report may quote. */
  pct: number;
  /** Base-case range, e.g. "-2.83% to +2.87%". */
  range: string;
  probability: number;
}

/** Point forecast and the range it sits in, taken from the same outlook. */
export function alignedProjection(intel: Pick<SecurityIntel, "projected7dPct" | "outlook" | "confidence">): AlignedProjection {
  const base = intel.outlook?.base;
  const expected = intel.outlook?.expectedPct;
  const pct =
    typeof expected === "number" && isFinite(expected)
      ? Math.round(expected * 100) / 100
      : intel.projected7dPct;
  const range = base ? `${sp(base.lowPct)} to ${sp(base.highPct)}` : sp(pct);
  return {
    pct,
    range,
    probability: base?.probability ?? intel.confidence,
  };
}

export interface LiveCashFigures {
  cashNZD: number;
  bookNZD: number;
}

/**
 * One cash rule for Stox, Koins, and Headmaster.
 * Shows the live ledger cash. Retained cash is about 10% of the live book.
 */
export function liveCashRuleSentence(cashNZD: number, bookNZD?: number): string {
  return sharedReserveSentence(cashNZD, bookNZD);
}

function cashRuleClause(cash: number, book?: number): string {
  if (!(cash > 0)) return "";
  return ` ${liveCashRuleSentence(cash, book)}`;
}

/** Stored Stox/Koins prose that still illustrates a NZ$100,000 book, a 75% reserve, or a NZ$25,000 starter. */
const LEGACY_CASH_ILLUSTRATION =
  /(?:nz\$|\$)\s*100[,.]?000(?:\s+is)?\s+available|keep at least\s+75\s*%|75\s*%\s+in reserve|start with(?: about)?\s+(?:nz\$|\$)\s*25[,.]?000|(?:about|around)\s+(?:nz\$|\$)\s*25[,.]?000/i;

export function rewriteLegacyCashIllustration(text: string, figures?: LiveCashFigures): string {
  if (!text || !LEGACY_CASH_ILLUSTRATION.test(text)) return text;
  const replacement =
    figures && figures.cashNZD > 0
      ? liveCashRuleSentence(figures.cashNZD, figures.bookNZD)
      : "Use the live cash balance and the shared cash-reserve cap — the same cash rule as the Headmaster skeleton.";
  const collapsed: string[] = [];
  for (const sentence of splitSentences(text)) {
    const next = LEGACY_CASH_ILLUSTRATION.test(sentence) ? replacement : sentence;
    if (next === replacement && collapsed[collapsed.length - 1] === replacement) continue;
    collapsed.push(next);
  }
  return collapsed.join(" ").replace(/[ \t]{2,}/g, " ").trim();
}

export function deploymentGuard(
  bot: "stock" | "crypto",
  tape: TapeRead,
  cashNZD = 0,
  bookNZD?: number
): DeploymentGuard {
  const cap = bot === "crypto" ? 12 : 8;
  const cash = Math.max(0, cashNZD);
  const book = bookNZD != null && bookNZD > 0 ? bookNZD : cash;
  const retained = bookCashReserve(book).retainedNZD;
  const deployable = Math.max(0, cash - retained);
  const deployFraction = cash > 0 ? deployable / cash : 0;
  const neutral =
    tape.bias !== "Constructive" ||
    tape.level === "Low" ||
    tape.level === "Speculative" ||
    tape.score < 58;
  const defensive = tape.bias === "Defensive" || (tape.bias === "Neutral" && tape.score < 46 && tape.level !== "High");

  if (defensive) {
    return {
      mode: "defensive",
      maxNewNames: 0,
      maxDeployFraction: 0,
      projectionCapPct: cap,
      headline:
        `${tape.bias} tape at ${tape.score}/100 with ${tape.level} conviction. ` +
        `This tape does not support new risk, so no new names are listed.` +
        cashRuleClause(cash, book),
    };
  }
  if (neutral) {
    return {
      mode: "starter",
      maxNewNames: 2,
      maxDeployFraction: deployFraction,
      projectionCapPct: cap,
      headline:
        `${tape.bias} tape at ${tape.score}/100 with ${tape.level} conviction. ` +
        `Do not deploy the full cash balance.` +
        cashRuleClause(cash, book) +
        ` New buys are limited to names inside ${indefiniteArticle(cap)} ${cap}% 7-day suitability cap and without speculative conviction.`,
    };
  }
  return {
    mode: "full",
    maxNewNames: 4,
    maxDeployFraction: deployFraction,
    projectionCapPct: bot === "crypto" ? 20 : 12,
    headline:
      `Constructive tape at ${tape.score}/100 with ${tape.level} conviction. ` +
      `Scale in on the same cash rule — do not commit the entire balance in one fill.` +
      cashRuleClause(cash, book),
  };
}

/** A new-name candidate is suitable to recommend under this guard. */
export function candidateIsSuitable(
  input: RatingInput & { conviction: ConvictionLevel; projected7dPct: number },
  guard: DeploymentGuard
): boolean {
  if (!(input.projected7dPct > 0)) return false;
  if (guard.mode === "defensive") return false;
  if (!rateAsset(input).positiveMomentum) return false;
  if (guard.mode === "starter" && input.conviction === "Speculative") return false;
  if (Math.abs(input.projected7dPct) > guard.projectionCapPct) return false;
  return true;
}

export interface UnsuitableInput extends RatingInput {
  conviction: ConvictionLevel;
  projected7dPct: number;
  price?: number;
  realizedVolPct?: number;
  hasLivePrice?: boolean;
}

/**
 * Why a buy-signal name is left off the sized list.
 * Null means the name is suitable. Every other return is a visible reason.
 */
export function unsuitableReason(input: UnsuitableInput, guard: DeploymentGuard): string | null {
  if (candidateIsSuitable(input, guard)) return null;
  const pct = Math.round(input.projected7dPct * 100) / 100;
  const signed = `${pct >= 0 ? "+" : ""}${pct}%`;
  if (input.hasLivePrice === false) return "no live price";
  if (guard.mode === "defensive") return "defensive tape";
  if (!(input.projected7dPct > 0)) return `7-day projection ${signed} is not positive`;
  if (guard.mode === "starter" && input.conviction === "Speculative") return "speculative conviction";
  if (Math.abs(input.projected7dPct) > guard.projectionCapPct) {
    return `7-day move ${signed} exceeds the ${guard.projectionCapPct}% suitability cap`;
  }
  if (typeof input.realizedVolPct === "number" && input.realizedVolPct >= 120) {
    return `volatility ${Math.round(input.realizedVolPct)}%`;
  }
  if (typeof input.price === "number" && input.price > 0 && input.price < 0.001) return "price under the minimum";
  if (!rateAsset(input).positiveMomentum) return "the rating is not a buy";
  return "outside this tape's buy list";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tickerKeys(ticker: string): string[] {
  const upper = ticker.trim().toUpperCase();
  if (!upper) return [];
  const bare = upper.replace(/\.(AX|NZ|NZX|ASX|L|TO|HK)$/i, "");
  return bare === upper ? [upper] : [upper, bare];
}

type Stance = "constructive" | "defensive" | "hold";

function stanceOf(action: CanonicalAction): Stance {
  if (action === "BUY" || action === "ACCUMULATE") return "constructive";
  if (action === "SELL" || action === "TRIM") return "defensive";
  return "hold";
}

function claimedStance(window: string): Stance | null {
  if (/\b(STRONG BUY|ACCUMULATE|ACCUMULATION)\b/.test(window) || /\bADD\b/.test(window)) return "constructive";
  if (/\bBUY\b/.test(window)) return "constructive";
  if (/\b(SELL|EXIT)\b/.test(window)) return "defensive";
  if (/\b(TRIM|REDUCE)\b/.test(window)) return "defensive";
  if (/\bHOLD\b/.test(window)) return "hold";
  return null;
}

function windowsFor(text: string, ticker: string): string[] {
  const upper = text.toUpperCase();
  const out: string[] = [];
  for (const key of tickerKeys(ticker)) {
    if (key.length < 2) continue;
    const re = new RegExp(`\\b${escapeRegExp(key)}\\b`, "g");
    let match: RegExpExecArray | null;
    while ((match = re.exec(upper))) {
      out.push(upper.slice(Math.max(0, match.index - 40), match.index + key.length + 48));
    }
  }
  return out;
}

const FULL_CASH =
  /deploy(?:ing)? the full|full cash|entire cash|whole (?:cash )?balance|all (?:of )?(?:the |your )?(?:available )?cash|100% of (?:the )?cash/i;

/**
 * Named-cash lines the live View still showed after the bundle regex shipped.
 * These are regex literals (not String.raw) and they do not stop at decimal
 * points, so "**ACCUMULATE** the **NZ$12,696 cash**" and "cash NZ$12696" match
 * even when the same sentence contains +2.52% or CIP.AX.
 */
const AMOUNT_THEN_CASH = /(?:nz\$|us\$|aud\$|\$)\s*\d[\d,]{2,}(?:\.\d+)?\s*cash\b/i;
const CASH_THEN_AMOUNT = /\bcash\s*(?:nz\$|us\$|aud\$|\$)\s*\d[\d,]{2,}(?:\.\d+)?/i;
const DRY_POWDER = /\bdeploy\s+dry\s+powder\b|\bdry\s+powder\s*\(\s*cash\b/i;
const CASH_SLICE = /\bmeasured\s+cash\s+slice\b/i;
const SLICE_VERB = /\b(?:accumulate|accumulating|buy|buying|deploy(?:ing)?|add|adding)\b/i;
const SECONDARY_BUYS = /\bsecondary\s+buy\s+names\b/i;

/** Buy/accumulate language tied to speculative conviction. Decimals are allowed between the words. */
const SPECULATIVE_BUY =
  /\b(?:accumulate|buy|add)\b[\s\S]{0,400}?\bspeculative\b|\bspeculative\b[\s\S]{0,200}?\b(?:accumulate|buy|add)\b/i;

/**
 * True when a model narrative disagrees with the canonical ratings or tells a
 * guarded tape to deploy the whole cash balance.
 */
export function narrativeContradictsCanonical(
  text: string,
  assets: Array<{ ticker: string; action: CanonicalAction }>,
  guard: DeploymentGuard,
  positiveCount?: { positive: number; total: number }
): boolean {
  if (!text) return false;
  for (const asset of assets) {
    const expected = stanceOf(asset.action);
    for (const window of windowsFor(text, asset.ticker)) {
      const claimed = claimedStance(window);
      if (claimed && claimed !== expected) return true;
    }
  }
  if (positiveCount) {
    const match = text.match(/(\d+)\s+of\s+(\d+)[^.]{0,80}positive momentum/i);
    if (match) {
      const positive = Number(match[1]);
      const total = Number(match[2]);
      if (positive !== positiveCount.positive || total !== positiveCount.total) return true;
    }
  }
  if (guard.mode !== "full" && violatesCashGuard(text)) return true;
  return false;
}

function maskTickerDots(text: string): string {
  return text.replace(/\.(AX|NZ|NZX|ASX|L|TO|HK)\b/gi, "§$1");
}

/** Bold/italic markers must not hide ACCUMULATE or NZ$. */
function normalizeCopy(text: string): string {
  return maskTickerDots(text)
    .replace(/[*_`]/g, "")
    .replace(/[\u00a0\u202f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Drop only the guardrail clause itself. A broad "do not add …" removal used
 * to eat every later character until a period, which hid "deploy NZ$12,696 cash"
 * from the matcher and left the original sentence on screen.
 */
function withoutGuardrailClauses(text: string): string {
  return text
    .replace(/\b(?:do not|don't|never)\s+deploy the full\b[^.?!]*/gi, "")
    .replace(/\b(?:do not|don't|never)\s+commit the entire\b[^.?!]*/gi, "")
    .replace(/\bwithout speculative conviction\b/gi, "");
}

/**
 * True for the exact stored lines View kept showing:
 * "ACCUMULATE the NZ$12,696 cash", "deploy NZ$12,696 cash",
 * "Deploy dry powder (cash NZ$12696 available)", "measured cash slice".
 * Matched on markdown-stripped text, including when a "do not add" clause
 * shares the sentence. The reserve headline does not match.
 */
export function urgesNamedCashDeploy(text: string): boolean {
  const plain = normalizeCopy(text);
  if (!plain) return false;
  if (DRY_POWDER.test(plain)) return true;
  if (AMOUNT_THEN_CASH.test(plain)) return true;
  if (CASH_THEN_AMOUNT.test(plain)) return true;
  if (CASH_SLICE.test(plain) && SLICE_VERB.test(plain)) return true;
  return false;
}

/** True when copy tells the reader to put the cash balance to work. Negated guardrail sentences do not count. */
export function urgesFullDeployment(text: string): boolean {
  if (urgesNamedCashDeploy(text)) return true;
  const stripped = withoutGuardrailClauses(normalizeCopy(text));
  if (!stripped) return false;
  if (FULL_CASH.test(stripped)) return true;
  return SECONDARY_BUYS.test(stripped);
}

/**
 * True when a sentence tells a reader to buy or accumulate on speculative
 * conviction. The regime word alone ("Speculative 54/100") does not count.
 */
export function urgesSpeculativeBuy(text: string): boolean {
  return SPECULATIVE_BUY.test(withoutGuardrailClauses(normalizeCopy(text)));
}

/** Cash-guard violations a Neutral / low / Speculative tape must not ship. */
export function violatesCashGuard(text: string): boolean {
  return urgesFullDeployment(text) || urgesSpeculativeBuy(text);
}

/** Largest cash balance named next to the word "cash", e.g. NZ$12,696 cash. */
export function cashBalanceMentioned(text: string): number {
  const plain = text.replace(/[*_`]/g, "");
  const patterns = [
    /(?:nz\$|us\$|aud\$|\$)\s*([\d,]+(?:\.\d+)?)\s*cash/gi,
    /cash\s*(?:balance\s*)?(?:of\s*)?(?:nz\$|us\$|aud\$|\$)\s*([\d,]+(?:\.\d+)?)/gi,
  ];
  let best = 0;
  for (const re of patterns) {
    let match: RegExpExecArray | null;
    while ((match = re.exec(plain))) {
      const amount = Number(match[1].replace(/,/g, ""));
      if (amount > best) best = amount;
    }
  }
  return best;
}

/** Tape implied by prose when a stored report has no structured overall read. */
export function textImpliesGuardedTape(text: string): TapeRead | null {
  const normalized = normalizeCopy(text);
  if (!normalized) return null;
  const scoreMatch =
    normalized.match(/\b(?:speculative|neutral|low conviction|net)\b\D{0,40}(\d{1,3})\s*\/\s*100/i) ||
    normalized.match(/(\d{1,3})\s*\/\s*100/);
  const score = scoreMatch ? Number(scoreMatch[1]) : 50;
  const speculative = /(?<!without )(?<!not )(?<!non-)\bspeculative\b/i.test(normalized);
  const low = /low conviction/i.test(normalized);
  const neutral = /\bneutral\b/i.test(normalized);
  const defensive = /\bdefensive\b/i.test(normalized) && !/\bnot defensive\b/i.test(normalized);
  if (!speculative && !low && !(neutral && score < 58) && !defensive) return null;
  const bias: TapeRead["bias"] = defensive && !neutral ? "Defensive" : neutral || speculative || low ? "Neutral" : "Defensive";
  const level: TapeRead["level"] = speculative ? "Speculative" : low ? "Low" : defensive ? "Moderate" : "Low";
  return { bias, level, score, averageConfidence: 0 };
}

function stricterTape(structured: TapeRead | null, implied: TapeRead | null): TapeRead | null {
  if (!structured) return implied;
  if (!implied) return structured;
  const rank = { defensive: 0, starter: 1, full: 2 } as const;
  const structuredMode = deploymentGuard("stock", structured, 0).mode;
  const impliedMode = deploymentGuard("stock", implied, 0).mode;
  return rank[impliedMode] < rank[structuredMode] ? implied : structured;
}

function tapeFromOverall(overall?: { bias?: string; level?: string; score?: number } | null): TapeRead | null {
  if (!overall) return null;
  const bias = overall.bias === "Constructive" || overall.bias === "Defensive" || overall.bias === "Neutral" ? overall.bias : null;
  const level =
    overall.level === "High" || overall.level === "Moderate" || overall.level === "Low" || overall.level === "Speculative"
      ? overall.level
      : null;
  if (!bias || !level || typeof overall.score !== "number" || !isFinite(overall.score)) return null;
  return { bias, level, score: overall.score, averageConfidence: 0 };
}

/** Split prose on sentence ends without breaking 2.52%, $2,730.56, or CIP.AX. */
function splitSentences(text: string): string[] {
  const protectedText = text
    .replace(/\d+\.\d+/g, (match) => match.replace(/\./g, "\u0001"))
    .replace(/\.(AX|NZ|NZX|ASX|L|TO|HK)\b/gi, "\u0001$1");
  return protectedText
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.replace(/\u0001/g, ".").trim())
    .filter(Boolean);
}

/** When a cash instruction shares a sentence with HOLD, keep the HOLD lead. */
function holdLead(sentence: string, violates: (value: string) => boolean): string {
  const parts = sentence.split(/\s+\band\b\s+/i);
  if (parts.length < 2) return "";
  const head = parts[0].trim().replace(/[\s,;:–—-]+$/g, "");
  if (/\bHOLD\b/.test(head) && head.length >= 12 && !violates(head)) return head;
  return "";
}

/** Drop whole sentences that deploy a named cash pile. Never leave a ".52%" stub. */
function stripNamedCashCopy(text: string): string {
  if (!text || !urgesNamedCashDeploy(text)) return text;
  return splitSentences(text)
    .map((sentence) => {
      if (!urgesNamedCashDeploy(sentence)) return sentence;
      return holdLead(sentence, urgesNamedCashDeploy);
    })
    .filter(Boolean)
    .join(" ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function stripGuardedSentence(sentence: string): string {
  if (!violatesCashGuard(sentence)) return sentence;
  const lead = holdLead(sentence, violatesCashGuard);
  return lead;
}

/**
 * Drop sentences that deploy the cash pile or buy on speculative conviction,
 * and append the starter/defensive headline so the cap stays visible.
 */
export function sanitizeGuardedCashLanguage(text: string, guard: DeploymentGuard): string {
  if (!text) return text;
  if (guard.mode === "full") return stripNamedCashCopy(text);
  if (!violatesCashGuard(text)) return text;
  const kept = splitSentences(text).map(stripGuardedSentence).filter(Boolean);
  let body = kept.join(" ").replace(/[ \t]+\n/g, "\n").replace(/[ \t]{2,}/g, " ").trim();
  const headline = guard.headline.trim();
  const alreadyGuarded = /do not deploy the full cash balance|this tape does not support new risk|leave the nz\$/i.test(body);
  if (headline && !alreadyGuarded) body = body ? `${body} ${headline}` : headline;
  return body;
}

export function sanitizeGuardedCashText(text: string, bot: "stock" | "crypto" = "stock"): string {
  if (!text) return text;
  const named = urgesNamedCashDeploy(text);
  if (!named && !violatesCashGuard(text)) return text;
  const tape = textImpliesGuardedTape(text);
  if (!tape) return named ? stripNamedCashCopy(text) : text;
  const guard = deploymentGuard(bot, tape, cashBalanceMentioned(text));
  if (guard.mode === "full") return named ? stripNamedCashCopy(text) : text;
  return sanitizeGuardedCashLanguage(text, guard);
}

export interface GuardedReportFields {
  bot?: string;
  executiveSummary?: string;
  keyObservations?: string[];
  pathwayPlan?: {
    recommendationNote?: string;
    pathways?: Array<{ summary?: string; steps?: string[] }>;
  } | null;
  briefing?: {
    executiveSummary?: string;
    keyObservations?: string[];
    highlights?: string[];
    risks?: string[];
    overall?: { bias?: string; level?: string; score?: number; reason?: string };
  } | null;
  directRecommendations?: Array<{ detail?: string; held?: boolean; action?: string }>;
  tickers?: Array<{ note?: string }>;
}

function reportProse(report: GuardedReportFields): string {
  const bits: string[] = [];
  const push = (value: unknown) => {
    if (typeof value === "string" && value) bits.push(value);
  };
  push(report.executiveSummary);
  for (const line of report.keyObservations ?? []) push(line);
  push(report.pathwayPlan?.recommendationNote);
  for (const pathway of report.pathwayPlan?.pathways ?? []) {
    push(pathway.summary);
    for (const step of pathway.steps ?? []) push(step);
  }
  push(report.briefing?.executiveSummary);
  push(report.briefing?.overall?.reason);
  for (const line of report.briefing?.highlights ?? []) push(line);
  for (const line of report.briefing?.keyObservations ?? []) push(line);
  for (const line of report.briefing?.risks ?? []) push(line);
  for (const rec of report.directRecommendations ?? []) push(rec.detail);
  for (const ticker of report.tickers ?? []) push(ticker.note);
  return bits.join("\n");
}

/**
 * Display-time pass for a stored Apex report.
 *
 * Named-cash and dry-powder sentences are removed even when the structured
 * tape is missing or Constructive — that gate is what left the live View
 * showing "NZ$12,696 cash" and "Deploy dry powder" after the regex shipped.
 * Neutral / low / Speculative tapes also drop speculative-buy sentences and
 * keep the reserve headline.
 */
function mapReportProse<T extends GuardedReportFields>(report: T, clean: (value: string) => string): T {
  const next: T = { ...report };
  if (typeof next.executiveSummary === "string") next.executiveSummary = clean(next.executiveSummary);
  if (Array.isArray(next.keyObservations)) next.keyObservations = next.keyObservations.map((line) => clean(line));
  if (next.pathwayPlan) {
    const plan = next.pathwayPlan;
    next.pathwayPlan = {
      ...plan,
      recommendationNote: typeof plan.recommendationNote === "string" ? clean(plan.recommendationNote) : plan.recommendationNote,
      pathways: Array.isArray(plan.pathways)
        ? plan.pathways.map((pathway) => ({
            ...pathway,
            summary: typeof pathway.summary === "string" ? clean(pathway.summary) : pathway.summary,
            steps: Array.isArray(pathway.steps) ? pathway.steps.map((step) => clean(step)) : pathway.steps,
          }))
        : plan.pathways,
    };
  }
  if (next.briefing) {
    const overall = next.briefing.overall;
    next.briefing = {
      ...next.briefing,
      executiveSummary:
        typeof next.briefing.executiveSummary === "string" ? clean(next.briefing.executiveSummary) : next.briefing.executiveSummary,
      keyObservations: Array.isArray(next.briefing.keyObservations)
        ? next.briefing.keyObservations.map((line) => clean(line))
        : next.briefing.keyObservations,
      highlights: Array.isArray(next.briefing.highlights)
        ? next.briefing.highlights.map((line) => clean(line))
        : next.briefing.highlights,
      risks: Array.isArray(next.briefing.risks) ? next.briefing.risks.map((line) => clean(line)) : next.briefing.risks,
      overall:
        overall && typeof overall.reason === "string" ? { ...overall, reason: clean(overall.reason) } : overall,
    };
  }
  if (Array.isArray(next.directRecommendations)) {
    next.directRecommendations = next.directRecommendations.map((rec) =>
      typeof rec.detail === "string" ? { ...rec, detail: clean(rec.detail) } : rec
    );
  }
  if (Array.isArray(next.tickers)) {
    next.tickers = next.tickers.map((ticker) =>
      typeof ticker.note === "string" ? { ...ticker, note: clean(ticker.note) } : ticker
    );
  }
  return next;
}

export function sanitizeGuardedReport<T extends GuardedReportFields>(report: T, figures?: LiveCashFigures): T {
  const priced = mapReportProse(report, (value) => rewriteLegacyCashIllustration(value, figures));
  const blob = reportProse(priced);
  const tape = stricterTape(tapeFromOverall(priced.briefing?.overall), textImpliesGuardedTape(blob));
  const named = urgesNamedCashDeploy(blob);
  if (!tape && !named) return priced;
  const bot = priced.bot === "crypto" ? "crypto" : "stock";
  const cash = figures && figures.cashNZD > 0 ? figures.cashNZD : cashBalanceMentioned(blob);
  const book = figures && figures.bookNZD > 0 ? figures.bookNZD : undefined;
  const guard = tape ? deploymentGuard(bot, tape, cash, book) : null;
  if (guard?.mode === "full" && !named) return priced;
  const clean = (value: string | undefined) => {
    if (typeof value !== "string") return value;
    if (guard && guard.mode !== "full") return sanitizeGuardedCashLanguage(value, guard);
    return stripNamedCashCopy(value);
  };
  const next: T = { ...priced };
  if (typeof next.executiveSummary === "string") next.executiveSummary = clean(next.executiveSummary);
  if (Array.isArray(next.keyObservations)) next.keyObservations = next.keyObservations.map((line) => clean(line) ?? line);
  if (next.pathwayPlan) {
    const plan = next.pathwayPlan;
    next.pathwayPlan = {
      ...plan,
      recommendationNote: typeof plan.recommendationNote === "string" ? clean(plan.recommendationNote) : plan.recommendationNote,
      pathways: Array.isArray(plan.pathways)
        ? plan.pathways.map((pathway) => ({
            ...pathway,
            summary: typeof pathway.summary === "string" ? clean(pathway.summary) : pathway.summary,
            steps: Array.isArray(pathway.steps) ? pathway.steps.map((step) => clean(step) ?? step) : pathway.steps,
          }))
        : plan.pathways,
    };
  }
  if (next.briefing) {
    const overall = next.briefing.overall;
    next.briefing = {
      ...next.briefing,
      executiveSummary: clean(next.briefing.executiveSummary) ?? next.briefing.executiveSummary,
      keyObservations: Array.isArray(next.briefing.keyObservations)
        ? next.briefing.keyObservations.map((line) => clean(line) ?? line)
        : next.briefing.keyObservations,
      highlights: Array.isArray(next.briefing.highlights)
        ? next.briefing.highlights.map((line) => clean(line) ?? line)
        : next.briefing.highlights,
      risks: Array.isArray(next.briefing.risks) ? next.briefing.risks.map((line) => clean(line) ?? line) : next.briefing.risks,
      overall:
        overall && typeof overall.reason === "string" ? { ...overall, reason: clean(overall.reason) ?? overall.reason } : overall,
    };
  }
  if (Array.isArray(next.directRecommendations)) {
    const cleaned = next.directRecommendations.map((rec) =>
      typeof rec.detail === "string" ? { ...rec, detail: clean(rec.detail) ?? rec.detail } : rec
    );
    if (guard && guard.mode !== "full") {
      let freshBuys = 0;
      next.directRecommendations = cleaned.filter((rec) => {
        const unheldBuy = rec.held === false && (rec.action === "BUY" || rec.action === "ACCUMULATE");
        if (!unheldBuy) return true;
        if (freshBuys >= guard.maxNewNames) return false;
        freshBuys += 1;
        return true;
      });
    } else {
      next.directRecommendations = cleaned;
    }
  }
  if (Array.isArray(next.tickers)) {
    next.tickers = next.tickers.map((ticker) =>
      typeof ticker.note === "string" ? { ...ticker, note: clean(ticker.note) ?? ticker.note } : ticker
    );
  }
  return next;
}
