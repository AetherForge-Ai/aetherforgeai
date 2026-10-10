/**
 * Paper-book onboarding progress.
 * The fraction counts every step on the card, including the optional Headmaster
 * visit. A cash deposit ticks the first-buy step. The card hides only when the
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
  finished: boolean;
};

export function onboardingProgress(input: {
  hasHoldings: boolean;
  hasCash?: boolean;
  hasAlerts?: boolean;
  hasReport?: boolean;
  /** Omit to keep the optional Headmaster step (existing desks). */
  plan?: string | null;
}): OnboardingProgress {
  const recorded = input.hasHoldings || !!input.hasCash;
  const replaceHeadmaster =
    input.plan != null && input.plan !== "" && (isFreeReportPlan(input.plan) || isStarterPlan(input.plan));
  const steps: OnboardingStepState[] = [
    replaceHeadmaster
      ? { id: "holding", done: recorded, optional: true }
      : { id: "headmaster", done: false, optional: true },
    { id: "buy", done: recorded, optional: false },
    ...(replaceHeadmaster ? [] : [{ id: "alerts" as const, done: !!input.hasAlerts, optional: false }]),
    { id: "report", done: !!input.hasReport, optional: false },
  ];
  const required = steps.filter((step) => !step.optional);
  const requiredDone = required.filter((step) => step.done).length;
  return {
    steps,
    completed: steps.filter((step) => step.done).length,
    total: steps.length,
    finished: required.length > 0 && requiredDone === required.length,
  };
}
