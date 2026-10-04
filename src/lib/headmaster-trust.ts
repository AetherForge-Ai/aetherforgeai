/**
 * Headmaster Wave A trust helpers.
 *
 * One allocation plan drives retained cash, illustrative class amounts, the
 * strategy narrative, and the intelligence-report brief. Language stays
 * scenario-based. Non-held names stay off the default plan.
 */

import { stripReportModelLanguage } from "@/lib/report-language";

export type PlanAssetClass = "equities" | "crypto" | "metals" | "cash";

export type IllustrativeAction = "increase" | "reduce" | "unchanged";

export interface PlanClassInput {
  assetClass: PlanAssetClass;
  label: string;
  color: string;
  valueNZD: number;
}

export interface AllocationMove {
  assetClass: PlanAssetClass;
  label: string;
  color: string;
  currentValueNZD: number;
  targetValueNZD: number;
  currentWeight: number;
  targetWeight: number;
  driftPct: number;
  /** Target minus current, in whole dollars. Class deltas sum to 0. */
  deltaNZD: number;
  action: IllustrativeAction;
  amountNZD: number;
}

export interface AllocationPlan {
  modelName: string;
  riskLabel: string;
  totalValueNZD: number;
  /** Whole-dollar cash on the book used by this plan. */
  cashOnBookNZD: number;
  targetCashPct: number;
  /** Cash kept at the skeleton's cash weight. */
  retainedCashNZD: number;
  /**
   * Cash above the retained target. This is the only reallocation figure.
   * It is 0 when cash is already at or below the target.
   */
  cashToReallocateNZD: number;
  projectedReturnPct: number;
  projectedVolPct: number;
  moves: AllocationMove[];
  illustrativeIncreaseNZD: number;
  illustrativeReduceNZD: number;
  reconciled: boolean;
  /** Auditable identity: retained cash, reallocation, and netted class moves. */
  formula: string;
  narrative: string;
}

export interface AllocationPlanInput {
  totalValueNZD: number;
  cashBalanceNZD: number;
  classes: PlanClassInput[];
  targets: Record<PlanAssetClass, number>;
  modelName: string;
  riskLabel: string;
  projectedReturnPct: number;
  projectedVolPct: number;
}

const CLASSES: PlanAssetClass[] = ["equities", "crypto", "metals", "cash"];

export const ASSISTANT_TURN_TIMEOUT_MS = 20_000;

export function nzdWhole(value: number): string {
  const n = Math.round(Number.isFinite(value) ? value : 0);
  return `NZ$${n.toLocaleString("en-NZ")}`;
}

/**
 * One cash-reserve rule for Headmaster, Stox, and Koins.
 * Matches the Balanced Growth skeleton (10% retained). A NZ$100,000 book
 * keeps NZ$10,000 and illustrates NZ$90,000 — the same dollars on every desk.
 */
export const BOOK_CASH_RESERVE_PCT = 10;

export function bookCashReserve(bookNZD: number): {
  reservePct: number;
  retainedNZD: number;
  deployableNZD: number;
} {
  const book = Math.max(0, Math.round(Number.isFinite(bookNZD) ? bookNZD : 0));
  const retainedNZD = book > 0 ? Math.round((book * BOOK_CASH_RESERVE_PCT) / 100) : 0;
  return {
    reservePct: BOOK_CASH_RESERVE_PCT,
    retainedNZD,
    deployableNZD: Math.max(0, book - retainedNZD),
  };
}

function whole(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value);
}

function weight1(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((value / total) * 1000) / 10;
}

function actionFor(delta: number): IllustrativeAction {
  if (delta > 0) return "increase";
  if (delta < 0) return "reduce";
  return "unchanged";
}

/**
 * Dollar gaps to the target weights.
 * Retained cash is round(total × cash target). The cash row is cash on book
 * minus that retained amount. Other sleeves absorb the same net dollars, with
 * any whole-dollar remainder assigned to the largest sleeve so the moves sum
 * to zero. Rounded percentage drift is not used — that path produced a
 * different "trim" from the full cash balance.
 */
export function buildAllocationPlan(input: AllocationPlanInput): AllocationPlan {
  const total = whole(Math.max(0, input.totalValueNZD));
  const byClass = new Map(input.classes.map((c) => [c.assetClass, c]));
  const current: Record<PlanAssetClass, number> = {
    equities: 0,
    crypto: 0,
    metals: 0,
    cash: 0,
  };
  for (const key of CLASSES) {
    current[key] = whole(byClass.get(key)?.valueNZD ?? 0);
  }
  const summed = CLASSES.reduce((s, k) => s + current[k], 0);
  const bookGap = total - summed;
  if (bookGap !== 0) current.cash += bookGap;

  const cashOnBookNZD = current.cash;
  const targetCashPct = input.targets.cash;
  const retainedCashNZD = total > 0 ? whole((total * targetCashPct) / 100) : 0;
  const cashDelta = retainedCashNZD - cashOnBookNZD;

  const deltas: Record<PlanAssetClass, number> = {
    equities: 0,
    crypto: 0,
    metals: 0,
    cash: cashDelta,
  };
  const nonCash: PlanAssetClass[] = ["equities", "crypto", "metals"];
  for (const key of nonCash) {
    const targetValue = total > 0 ? whole((total * input.targets[key]) / 100) : 0;
    deltas[key] = targetValue - current[key];
  }
  const nonCashSum = nonCash.reduce((s, k) => s + deltas[k], 0);
  const gap = -cashDelta - nonCashSum;
  if (gap !== 0) {
    let idx: PlanAssetClass = "equities";
    for (const key of nonCash) {
      if (Math.abs(deltas[key]) > Math.abs(deltas[idx])) idx = key;
    }
    deltas[idx] += gap;
  }

  const moves: AllocationMove[] = CLASSES.map((key) => {
    const meta = byClass.get(key);
    const delta = deltas[key];
    const currentValueNZD = current[key];
    const targetValueNZD = currentValueNZD + delta;
    const currentWeight = weight1(currentValueNZD, total);
    const targetWeight = input.targets[key];
    return {
      assetClass: key,
      label: meta?.label ?? key,
      color: meta?.color ?? "#64748b",
      currentValueNZD,
      targetValueNZD,
      currentWeight,
      targetWeight,
      driftPct: Math.round((currentWeight - targetWeight) * 10) / 10,
      deltaNZD: delta,
      action: actionFor(delta),
      amountNZD: Math.abs(delta),
    };
  });

  const illustrativeIncreaseNZD = moves.reduce((s, m) => s + (m.deltaNZD > 0 ? m.deltaNZD : 0), 0);
  const illustrativeReduceNZD = moves.reduce((s, m) => s + (m.deltaNZD < 0 ? -m.deltaNZD : 0), 0);
  const cashToReallocateNZD = cashDelta < 0 ? -cashDelta : 0;

  const plan: AllocationPlan = {
    modelName: input.modelName,
    riskLabel: input.riskLabel,
    totalValueNZD: total,
    cashOnBookNZD,
    targetCashPct,
    retainedCashNZD,
    cashToReallocateNZD,
    projectedReturnPct: input.projectedReturnPct,
    projectedVolPct: input.projectedVolPct,
    moves,
    illustrativeIncreaseNZD,
    illustrativeReduceNZD,
    reconciled: illustrativeIncreaseNZD === illustrativeReduceNZD,
    formula: "",
    narrative: "",
  };
  plan.formula = allocationFormula(plan);
  plan.narrative = executiveBriefFromPlan(plan);
  return plan;
}

export function allocationFormula(plan: AllocationPlan): string {
  const cash = plan.moves.find((m) => m.assetClass === "cash");
  const cashClause =
    cash && cash.action === "reduce"
      ? `Illustrated cash reallocation ${nzdWhole(plan.cashToReallocateNZD)} = cash on book ${nzdWhole(plan.cashOnBookNZD)} − retained cash ${nzdWhole(plan.retainedCashNZD)} (${plan.targetCashPct}% of ${nzdWhole(plan.totalValueNZD)}).`
      : cash && cash.action === "increase"
        ? `Cash on book ${nzdWhole(plan.cashOnBookNZD)} is below retained cash ${nzdWhole(plan.retainedCashNZD)} (${plan.targetCashPct}% of ${nzdWhole(plan.totalValueNZD)}). The cash row illustrates an increase of ${nzdWhole(cash.amountNZD)}. There is no amount to reallocate.`
        : `Cash on book ${nzdWhole(plan.cashOnBookNZD)} already matches retained cash ${nzdWhole(plan.retainedCashNZD)} (${plan.targetCashPct}% of ${nzdWhole(plan.totalValueNZD)}).`;
  return `${cashClause} Illustrative increases ${nzdWhole(plan.illustrativeIncreaseNZD)} equal illustrative reductions ${nzdWhole(plan.illustrativeReduceNZD)}.`;
}

export function executiveBriefFromPlan(plan: AllocationPlan): string {
  const mix = plan.moves
    .map((m) => `${m.targetWeight}% ${m.label.toLowerCase()}`)
    .join(" · ");
  const cash = plan.moves.find((m) => m.assetClass === "cash");
  const cashSentence =
    cash && cash.action === "reduce"
      ? `Cash on book is ${nzdWhole(plan.cashOnBookNZD)}. This skeleton retains ${nzdWhole(plan.retainedCashNZD)} and illustrates reallocating ${nzdWhole(plan.cashToReallocateNZD)} — the same figure as the cash row, not the full cash balance.`
      : cash && cash.action === "increase"
        ? `Cash on book is ${nzdWhole(plan.cashOnBookNZD)}, below the ${nzdWhole(plan.retainedCashNZD)} retained-cash target. The skeleton illustrates raising cash by ${nzdWhole(cash.amountNZD)}.`
        : `Cash on book is ${nzdWhole(plan.cashOnBookNZD)}, in line with the retained-cash target of ${nzdWhole(plan.retainedCashNZD)}.`;
  return [
    `Illustrative ${plan.modelName} skeleton (${plan.riskLabel.toLowerCase()}): ${mix}.`,
    cashSentence,
    plan.formula || allocationFormula(plan),
    `The target mix models about ${plan.projectedReturnPct}% annual return at about ${plan.projectedVolPct}% volatility on the sleeves that would be deployed. Undeployed cash is not given a return. That is a pathway, not a forecast and not an instruction.`,
    "AetherForge does not trade for you. This is portfolio intelligence, not personalised financial advice.",
  ].join(" ");
}

export function illustrativeActionLabel(action: IllustrativeAction): string {
  if (action === "increase") return "Illustrative increase";
  if (action === "reduce") return "Illustrative reduce";
  return "Unchanged";
}

/** Replace imperative buy language in Headmaster strategy copy and report commentary. */
export function softenHeadmasterLanguage(text: string): string {
  return String(text || "")
    .replace(/\bBUY\s*\/\s*ACCUMULATE\b/gi, "an illustrative increase")
    .replace(/\bSTRONG[-\s]+BUY\b/gi, "a higher-conviction scenario")
    .replace(/\bACCUMULATE\b/gi, "an illustrative increase")
    .replace(/\bBUY\s*▲/gi, "Illustrative increase")
    .replace(/\bTRIM\s*▼/gi, "Illustrative reduce")
    .replace(/\bBUY\b/gi, "an illustrative add")
    .replace(/\bADD\s+([A-Z][A-Z0-9.]{0,14})\b/g, "an illustrative increase case for $1")
    .replace(/\bdeployable cash\b/gi, "the illustrated reallocation");
}

function illustrativeCashLine(plan?: AllocationPlan | null): string {
  if (!plan) {
    return "Illustrative reallocation uses only cash above the retained-cash target. It is not an instruction to deploy the cash balance.";
  }
  return `Illustrative reallocation is ${nzdWhole(plan.cashToReallocateNZD)}, retaining ${nzdWhole(plan.retainedCashNZD)} cash. That is the cash-row figure, not the full cash balance.`;
}

/** Keep 9,053.33 and CIP.AX from ending a sentence match early. */
function maskBreakableDots(text: string): string {
  return text
    .replace(/(\d)\.(\d)/g, "$1\u0001$2")
    .replace(/\.(AX|NZ|NZX|ASX|L|TO|HK)\b/gi, "\u0001$1");
}

/**
 * Display-time pass for Headmaster prose.
 * Stored reports generated before Wave A still contain BUY/ACCUMULATE lists,
 * "deploy dry powder now", and "Trim ~NZ$… from cash". Softening at generation
 * time does not rewrite those documents; this pass does, on view.
 * Wave A skeleton copy (retained cash, illustrated reallocation) is left as-is.
 */
export function sanitizeHeadmasterDisplayText(text: string, plan?: AllocationPlan | null): string {
  const cashLine = illustrativeCashLine(plan).replace(/\.$/, "");
  let out = maskBreakableDots(softenHeadmasterLanguage(text));
  out = out.replace(
    /Trim\s+~?(?:NZ\$|\$)\s*[\d,]+(?:\u0001\d+)?\s+from\s+cash\s+and\s+rotate\s+into\s+[^.!?\n]+/gi,
    cashLine
  );
  out = out.replace(
    /Keep at least\s+\d+(?:\u0001\d+)?%\s+in cash as dry powder[^.;!\n]*/gi,
    "Keep the skeleton cash target as retained cash. That balance is not an instruction"
  );
  out = out.replace(
    /[^.!?\n]*(?:\bdry\s+powder\b|\bput\s+(?:the\s+)?cash\s+to\s+work\b|\bdeploy(?:ing)?\s+(?:the\s+)?(?:full\s+|entire\s+|whole\s+)?cash\b)[^.!?\n]*[.!?]?/gi,
    (sentence) => {
      if (/\bnot an instruction\b/i.test(sentence) && !/\bdry\s+powder\b/i.test(sentence)) return sentence;
      return /[.!?]\s*$/.test(sentence) ? `${cashLine}.` : cashLine;
    }
  );
  return stripReportModelLanguage(out.replace(/\u0001/g, ".").replace(/[ ]{2,}/g, " "));
}

/** Sanitize visible text nodes in a stored or freshly rendered Headmaster HTML report. */
export function sanitizeHeadmasterReportHtml(html: string, plan?: AllocationPlan | null): string {
  return String(html || "")
    .replace(/Ultra Advanced ZENITH State/gi, "intelligent AI bot named Headmaster")
    .replace(/ZENITH Executive Briefing/g, "Illustrative commentary")
    .replace(/>([^<]*)</g, (full, text: string) => {
      // Leave the document stylesheet alone. Report prose does not look like CSS.
      if (/[{}]/.test(text) && /font-family|color-scheme|box-sizing/.test(text)) return full;
      if (!text.trim()) return full;
      return `>${sanitizeHeadmasterDisplayText(text, plan)}<`;
    });
}

/**
 * Force commentary onto the plan's cash figures. A sentence that tells the
 * reader to deploy cash or dry powder is replaced with the retained-cash
 * identity from the same plan, including when the sentence never names the
 * cash-on-book amount.
 */
export function alignNarrativeToPlan(text: string, plan: AllocationPlan): string {
  return sanitizeHeadmasterDisplayText(text, plan).trim();
}

export interface HeadmasterIdea {
  ticker: string;
  name: string;
  market: string;
  projected7dPct?: number;
  reason?: string;
  held?: boolean;
}

export interface ScopedHeadmasterIdeas {
  held: HeadmasterIdea[];
  watchlist: HeadmasterIdea[];
  /** Prompt/context text. Names outside the book appear only in the watchlist block. */
  contextBlock: string;
}

function normTicker(value: string): string {
  return value.trim().toUpperCase();
}

export function requestsWatchlist(message: string): boolean {
  return /\b(watch\s*list|watchlist|outside (?:my|the) (?:book|holdings|portfolio)|not held|non-held|new names|other tickers|names I (?:do not|don't) hold|tickers I (?:do not|don't) hold)\b/i.test(
    message || ""
  );
}

export function scopeHeadmasterIdeas(
  ideas: HeadmasterIdea[],
  heldTickers: string[],
  includeWatchlist: boolean
): ScopedHeadmasterIdeas {
  const heldSet = new Set(
    heldTickers
      .map(normTicker)
      .filter((t) => t && t !== "CASH" && t !== "CASH (NZD)")
  );
  const isHeld = (idea: HeadmasterIdea) =>
    idea.held === true || heldSet.has(normTicker(idea.ticker));
  const held = ideas.filter(isHeld);
  const unheld = ideas.filter((idea) => !isHeld(idea));
  const watchlist = includeWatchlist ? unheld : [];

  const lines = [
    "Headmaster scope: current holdings only.",
    held.length
      ? `Held names in view: ${held.map((h) => h.ticker).join(", ")}.`
      : "No held-ticker notes were attached.",
    "Discuss these as scenario context. Do not instruct a buy, sale, or accumulation.",
  ];
  if (watchlist.length) {
    lines.push(
      "",
      "WATCHLIST IDEAS (not held — research only, not instructions):",
      ...watchlist.map((w) => {
        const note = softenHeadmasterLanguage(w.reason || "").replace(/\s+/g, " ").trim();
        return `- ${w.ticker} (${w.name}, ${w.market})${note ? ` — ${note}` : ""}. Not an instruction.`;
      })
    );
  } else if (unheld.length) {
    lines.push(
      `${unheld.length} non-held names were withheld. They are shown only when watchlist ideas are explicitly requested, in a section labelled as not held and not instructions.`
    );
  }
  return { held, watchlist, contextBlock: lines.join("\n") };
}

export function intelligenceBriefInstructions(args: {
  plan: AllocationPlan;
  heldTickers: string[];
  findingsContext: string;
  includeWatchlist: boolean;
}): string {
  const held = args.heldTickers.filter((t) => !/^cash\b/i.test(t));
  return [
    "You are The Headmaster writing additional commentary on an allocation skeleton.",
    "This is portfolio intelligence, not personalised financial advice, and you do not place trades.",
    `Cash figures you may use, and only these: cash on book ${nzdWhole(args.plan.cashOnBookNZD)}; retained cash ${nzdWhole(args.plan.retainedCashNZD)} (${args.plan.targetCashPct}%); illustrated reallocation ${nzdWhole(args.plan.cashToReallocateNZD)}.`,
    "Do not tell the reader to deploy the full cash balance or to deploy dry powder equal to cash on book.",
    "Write scenario alternatives. Do not use BUY, ACCUMULATE, or Strong Buy.",
    `Current holdings only: ${held.join(", ") || "(none)"}.`,
    args.includeWatchlist
      ? "Watchlist ideas may already be listed separately. If you mention them, label them as not held and not instructions."
      : "Do not name any ticker that is not in the current holdings.",
    args.findingsContext,
    "Write 4-6 sentences of commentary. Keep the cash figures above if you mention cash.",
  ].join("\n");
}

export interface TurnController {
  signal: AbortSignal;
  readonly timedOut: boolean;
  cancel: () => void;
  finish: () => void;
}

export function createTurnController(timeoutMs = ASSISTANT_TURN_TIMEOUT_MS): TurnController {
  const controller = new AbortController();
  let timedOut = false;
  let settled = false;
  const timer = setTimeout(() => {
    if (settled || controller.signal.aborted) return;
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  return {
    signal: controller.signal,
    get timedOut() {
      return timedOut;
    },
    cancel() {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (!controller.signal.aborted) controller.abort();
    },
    finish() {
      settled = true;
      clearTimeout(timer);
    },
  };
}

export function turnProgressLabel(elapsedSec: number): string {
  const s = Math.max(0, Math.floor(elapsedSec));
  return `Working… ${s}s. You can cancel. Your question stays in the box.`;
}

export function describeTurnFailure(
  kind: "timeout" | "cancelled" | "error",
  detail?: string
): string {
  if (kind === "timeout") {
    return "The request timed out before an answer arrived. Your question is still in the box — use Retry, or edit it and send again.";
  }
  if (kind === "cancelled") {
    return "Cancelled. Your question is still in the box.";
  }
  const extra = detail && detail !== "aborted" ? ` ${detail}` : "";
  return `The request failed.${extra} Your question is still in the box — use Retry, or edit it and send again.`;
}
