/**
 * One rating per asset for Stox and Koins reports.
 *
 * Cards, momentum counts, direct recommendations, and the executive summary
 * all read this module. A seeded "Strong Buy" cannot sit next to a live HOLD,
 * and a Neutral / low-conviction tape cannot be told to deploy the full cash
 * balance into speculative movers.
 */

import type { ConvictionLevel, SecurityIntel } from "@/lib/market-intel";

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

export function deploymentGuard(
  bot: "stock" | "crypto",
  tape: TapeRead,
  cashNZD = 0
): DeploymentGuard {
  const cap = bot === "crypto" ? 12 : 8;
  const cash = Math.max(0, Math.round(cashNZD));
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
        (cash > 0 ? `Leave the NZ$${cash.toLocaleString("en-NZ")} cash in reserve — ` : "Leave cash in reserve — ") +
        `this tape does not support new risk.`,
    };
  }
  if (neutral) {
    const fraction = 0.25;
    const starter = Math.round(cash * fraction);
    return {
      mode: "starter",
      maxNewNames: 2,
      maxDeployFraction: fraction,
      projectionCapPct: cap,
      headline:
        `${tape.bias} tape at ${tape.score}/100 with ${tape.level} conviction. ` +
        `Do not deploy the full cash balance` +
        (cash > 0
          ? ` (NZ$${cash.toLocaleString("en-NZ")} available; a starter tranche is about NZ$${starter.toLocaleString("en-NZ")}, with at least 75% kept in reserve)`
          : "") +
        `. New buys are limited to names inside a ${cap}% 7-day suitability cap and without speculative conviction.`,
    };
  }
  const fraction = 0.6;
  return {
    mode: "full",
    maxNewNames: 4,
    maxDeployFraction: fraction,
    projectionCapPct: bot === "crypto" ? 20 : 12,
    headline:
      `Constructive tape at ${tape.score}/100 with ${tape.level} conviction. ` +
      `Scale in and keep a cash buffer — do not commit the entire balance in one fill.`,
  };
}

/** A new-name candidate is suitable to recommend under this guard. */
export function candidateIsSuitable(
  input: RatingInput & { conviction: ConvictionLevel; projected7dPct: number },
  guard: DeploymentGuard
): boolean {
  if (guard.mode === "defensive") return false;
  if (!rateAsset(input).positiveMomentum) return false;
  if (guard.mode === "starter" && input.conviction === "Speculative") return false;
  if (Math.abs(input.projected7dPct) > guard.projectionCapPct) return false;
  return true;
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

/** NZ$12,696 and NZ$12696, with or without a thousands comma. */
const CASH_AMT = String.raw`(?:nz\$|us\$|aud\$|\$)\s*\d[\d,]{2,}(?:\.\d+)?`;

/**
 * Live failures the first guard missed:
 * "**ACCUMULATE the NZ$12,696 cash into…**",
 * "**deploy NZ$12,696 cash to BUY/ACCUMULATE**",
 * "Deploy dry powder (cash NZ$12696 available) with a measured starter size."
 */
const CASH_DEPLOY = new RegExp(
  [
    String.raw`\b(?:accumulate|accumulating|buy|buying|deploy(?:ing)?|commit(?:ting)?|allocate|allocating)\b[^.]{0,180}?${CASH_AMT}\s*cash\b`,
    String.raw`\b(?:accumulate|accumulating|buy|buying|deploy(?:ing)?|commit(?:ting)?|allocate|allocating)\b[^.]{0,140}?\bcash\s*${CASH_AMT}`,
    String.raw`${CASH_AMT}\s*cash\b[^.]{0,80}?\b(?:into|to|buy|accumulate)\b`,
    String.raw`\bdeploy\s+dry\s+powder\b`,
    String.raw`\bdry\s+powder\s*\(\s*cash\b`,
    String.raw`\b(?:accumulate|deploy(?:ing)?|buy|buying)\b[^.]{0,180}?\bmeasured\s+cash\s+slice\b`,
    String.raw`\bsecondary\s+buy\s+names\b`,
  ].join("|"),
  "i"
);

/** Buy/accumulate language tied to speculative conviction in the same sentence. */
const SPECULATIVE_BUY =
  /\b(?:accumulate|buy|add)\b[^.]{0,400}\bspeculative\b|\bspeculative\b[^.]{0,160}\b(?:accumulate|buy|add)\b/i;

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

function unmaskTickerDots(text: string): string {
  return text.replace(/§(AX|NZ|NZX|ASX|L|TO|HK)\b/gi, ".$1");
}

/** Bold/italic markers must not hide ACCUMULATE or NZ$. */
function normalizeCopy(text: string): string {
  return maskTickerDots(text)
    .replace(/[*_`]/g, "")
    .replace(/[\u00a0\u202f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripGuardNegations(text: string): string {
  return text
    .replace(/do not deploy the full[^.]*/gi, "")
    .replace(/don't deploy the full[^.]*/gi, "")
    .replace(/do not commit the entire[^.]*/gi, "")
    .replace(/not deploy the full[^.]*/gi, "")
    .replace(/do not (?:buy|accumulate|add|recommend|deploy)[^.]*/gi, "")
    .replace(/without speculative conviction[^.]*/gi, "");
}

/** True when copy tells the reader to put the cash balance to work. Negated guardrail sentences do not count. */
export function urgesFullDeployment(text: string): boolean {
  const stripped = normalizeCopy(stripGuardNegations(text));
  if (!stripped) return false;
  if (FULL_CASH.test(stripped)) return true;
  return CASH_DEPLOY.test(stripped);
}

/**
 * True when a sentence tells a reader to buy or accumulate on speculative
 * conviction. The regime word alone ("Speculative 54/100") does not count.
 */
export function urgesSpeculativeBuy(text: string): boolean {
  return SPECULATIVE_BUY.test(normalizeCopy(stripGuardNegations(text)));
}

/** Cash-guard violations a Neutral / low / Speculative tape must not ship. */
export function violatesCashGuard(text: string): boolean {
  return urgesFullDeployment(text) || urgesSpeculativeBuy(text);
}

/** Largest cash balance named next to the word "cash", e.g. NZ$12,696 cash. */
export function cashBalanceMentioned(text: string): number {
  const patterns = [
    /(?:nz\$|us\$|aud\$|\$)\s*([\d,]+(?:\.\d+)?)\s*cash/gi,
    /cash\s*(?:balance\s*)?(?:of\s*)?(?:nz\$|us\$|aud\$|\$)\s*([\d,]+(?:\.\d+)?)/gi,
  ];
  let best = 0;
  for (const re of patterns) {
    let match: RegExpExecArray | null;
    while ((match = re.exec(text))) {
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
    normalized.match(/(?:speculative|neutral|low conviction|net)\D{0,30}(\d{1,3})\s*\/\s*100/i) ||
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

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=\*{0,2}[A-Z])/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Cut a cash-deploy clause. Keep a HOLD that shares the sentence. Drop the rest. */
function stripViolatingClauses(sentence: string): string {
  if (!violatesCashGuard(sentence)) return sentence;
  const masked = maskTickerDots(sentence);
  let next = masked.replace(
    /\b(?:accumulate|accumulating|buy|buying|deploy(?:ing)?|commit(?:ting)?|allocate|allocating)\b[^.]{0,240}?(?:dry powder|measured cash slice|(?:nz\$|us\$|aud\$|\$)\s*\d[\d,]{2,}(?:\.\d+)?\s*cash|cash\s*(?:nz\$|us\$|aud\$|\$)\s*\d[\d,]{2,}(?:\.\d+)?)[^.]*/gi,
    ""
  );
  next = next.replace(/\bsecondary\s+buy\s+names\b[^.]*/gi, "");
  next = next
    .replace(/[*_`]/g, "")
    .replace(/\s+(?:and|into|to|is to)\s*$/i, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,;:–—-]+|[\s,;:–—-]+$/g, "")
    .trim();
  const restored = unmaskTickerDots(next);
  if (/\bHOLD\b/.test(restored) && !violatesCashGuard(restored)) return restored;
  if (!restored || restored.length < 24 || violatesCashGuard(restored)) return "";
  return restored;
}

/**
 * Drop sentences that deploy the cash pile or buy on speculative conviction,
 * and append the starter/defensive headline so the cap stays visible.
 */
export function sanitizeGuardedCashLanguage(text: string, guard: DeploymentGuard): string {
  if (!text || guard.mode === "full" || !violatesCashGuard(text)) return text;
  const kept = splitSentences(text).map(stripViolatingClauses).filter(Boolean);
  let body = kept.join(" ").replace(/[ \t]+\n/g, "\n").replace(/[ \t]{2,}/g, " ").trim();
  const headline = guard.headline.trim();
  const alreadyGuarded = /do not deploy the full cash balance|this tape does not support new risk|leave the nz\$/i.test(body);
  if (headline && !alreadyGuarded) body = body ? `${body} ${headline}` : headline;
  return body;
}

export function sanitizeGuardedCashText(text: string, bot: "stock" | "crypto" = "stock"): string {
  if (!text || !violatesCashGuard(text)) return text;
  const tape = textImpliesGuardedTape(text);
  if (!tape) return text;
  const guard = deploymentGuard(bot, tape, cashBalanceMentioned(text));
  if (guard.mode === "full") return text;
  return sanitizeGuardedCashLanguage(text, guard);
}

export interface GuardedReportFields {
  bot?: string;
  executiveSummary?: string;
  keyObservations?: string[];
  pathwayPlan?: { recommendationNote?: string } | null;
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

/**
 * Display-time pass for a stored Apex report. Structured tape wins; otherwise
 * the summary's own Neutral / low / Speculative wording is used. Constructive
 * full-mode tapes are left unchanged.
 */
export function sanitizeGuardedReport<T extends GuardedReportFields>(report: T): T {
  const blob = [report.executiveSummary, report.briefing?.executiveSummary, report.pathwayPlan?.recommendationNote]
    .filter((part): part is string => typeof part === "string")
    .join("\n");
  const tape = stricterTape(tapeFromOverall(report.briefing?.overall), textImpliesGuardedTape(blob));
  if (!tape) return report;
  const bot = report.bot === "crypto" ? "crypto" : "stock";
  const guard = deploymentGuard(bot, tape, cashBalanceMentioned(blob));
  if (guard.mode === "full") return report;
  const clean = (value: string | undefined) => (typeof value === "string" ? sanitizeGuardedCashLanguage(value, guard) : value);
  const next: T = { ...report };
  if (typeof next.executiveSummary === "string") next.executiveSummary = clean(next.executiveSummary);
  if (Array.isArray(next.keyObservations)) next.keyObservations = next.keyObservations.map((line) => sanitizeGuardedCashLanguage(line, guard));
  if (next.pathwayPlan && typeof next.pathwayPlan.recommendationNote === "string") {
    next.pathwayPlan = { ...next.pathwayPlan, recommendationNote: sanitizeGuardedCashLanguage(next.pathwayPlan.recommendationNote, guard) };
  }
  if (next.briefing) {
    const overall = next.briefing.overall;
    next.briefing = {
      ...next.briefing,
      executiveSummary: clean(next.briefing.executiveSummary) ?? next.briefing.executiveSummary,
      keyObservations: Array.isArray(next.briefing.keyObservations)
        ? next.briefing.keyObservations.map((line) => sanitizeGuardedCashLanguage(line, guard))
        : next.briefing.keyObservations,
      highlights: Array.isArray(next.briefing.highlights)
        ? next.briefing.highlights.map((line) => sanitizeGuardedCashLanguage(line, guard))
        : next.briefing.highlights,
      risks: Array.isArray(next.briefing.risks)
        ? next.briefing.risks.map((line) => sanitizeGuardedCashLanguage(line, guard))
        : next.briefing.risks,
      overall:
        overall && typeof overall.reason === "string"
          ? { ...overall, reason: sanitizeGuardedCashLanguage(overall.reason, guard) }
          : overall,
    };
  }
  if (Array.isArray(next.directRecommendations)) {
    const cleaned = next.directRecommendations.map((rec) =>
      typeof rec.detail === "string" ? { ...rec, detail: sanitizeGuardedCashLanguage(rec.detail, guard) } : rec
    );
    let freshBuys = 0;
    next.directRecommendations = cleaned.filter((rec) => {
      const unheldBuy = rec.held === false && (rec.action === "BUY" || rec.action === "ACCUMULATE");
      if (!unheldBuy) return true;
      if (freshBuys >= guard.maxNewNames) return false;
      freshBuys += 1;
      return true;
    });
  }
  if (Array.isArray(next.tickers)) {
    next.tickers = next.tickers.map((ticker) =>
      typeof ticker.note === "string" ? { ...ticker, note: sanitizeGuardedCashLanguage(ticker.note, guard) } : ticker
    );
  }
  return next;
}
