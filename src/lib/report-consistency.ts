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
  if (guard.mode !== "full" && urgesFullDeployment(text)) return true;
  return false;
}

/** True when copy tells the reader to put the whole cash balance to work. Negated guardrail sentences do not count. */
export function urgesFullDeployment(text: string): boolean {
  const stripped = text
    .replace(/do not deploy the full[^.]*/gi, "")
    .replace(/don't deploy the full[^.]*/gi, "")
    .replace(/do not commit the entire[^.]*/gi, "")
    .replace(/not deploy the full[^.]*/gi, "");
  return FULL_CASH.test(stripped);
}
