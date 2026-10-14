/**
 * Paper-book onboarding progress.
 * The fraction counts every step on the card, including the optional Headmaster
 * visit. A buy tick needs a buy on the ledger. A deposit is not a buy.
 * The report tick needs a Stox or Koins run. The card hides only when the
 * required steps are done.
 */

import { isFreeReportPlan, isStarterPlan } from "@/lib/entitlements";

export type OnboardingStepId = "headmaster" | "holding" | "buy" | "alerts" | "report";

export type OnboardingStepState = {
  id: OnboardingStepId;
  done: boolean;
  optional: boolean;
};

export type OnboardingProgress = {
  steps: OnboardingStepState[];
  /** Steps on the card that are ticked, including optional ones. */
  completed: number;
  total: number;
  /** Required steps only, for the header count (optional steps never block it). */
  requiredDone: number;
  requiredTotal: number;
  finished: boolean;
};

export function onboardingProgress(input: {
  hasHoldings: boolean;
  hasCash?: boolean;
  /** A buy transaction on the ledger. A deposit does not set this. */
  hasBuy?: boolean;
  hasAlerts?: boolean;
  /** A Stox or Koins run with a report body. */
  hasReport?: boolean;
  /** Omit to keep the optional Headmaster step (existing desks). */
  plan?: string | null;
}): OnboardingProgress {
  const recorded = input.hasHoldings || !!input.hasCash;
  const bought = input.hasBuy === true;
  const replaceHeadmaster =
    input.plan != null && input.plan !== "" && (isFreeReportPlan(input.plan) || isStarterPlan(input.plan));
  const steps: OnboardingStepState[] = [
    replaceHeadmaster
      ? { id: "holding", done: recorded, optional: true }
      : { id: "headmaster", done: false, optional: true },
    { id: "buy", done: bought, optional: false },
    ...(replaceHeadmaster ? [] : [{ id: "alerts" as const, done: !!input.hasAlerts, optional: false }]),
    { id: "report", done: !!input.hasReport, optional: false },
  ];
  const required = steps.filter((step) => !step.optional);
  const requiredDone = required.filter((step) => step.done).length;
  return {
    steps,
    completed: steps.filter((step) => step.done).length,
    total: steps.length,
    requiredDone,
    requiredTotal: required.length,
    finished: required.length > 0 && requiredDone === required.length,
  };
}
