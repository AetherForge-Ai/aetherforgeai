/**
 * Paper-book onboarding progress.
 * Headmaster is optional and is not part of the fraction, so a book that has
 * recorded buys cannot sit at 1/4 forever. Starting cash is not a completed step.
 * Free and Starter replace Headmaster with a holding step they can finish.
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
  /** Required steps only — never includes the optional Headmaster visit. */
  completed: number;
  total: number;
  finished: boolean;
};

export function onboardingProgress(input: {
  hasHoldings: boolean;
  hasAlerts?: boolean;
  hasReport?: boolean;
  /** Omit to keep the optional Headmaster step (existing desks). */
  plan?: string | null;
}): OnboardingProgress {
  const replaceHeadmaster =
    input.plan != null && input.plan !== "" && (isFreeReportPlan(input.plan) || isStarterPlan(input.plan));
  const steps: OnboardingStepState[] = [
    replaceHeadmaster
      ? { id: "holding", done: input.hasHoldings, optional: true }
      : { id: "headmaster", done: false, optional: true },
    { id: "buy", done: input.hasHoldings, optional: false },
    ...(replaceHeadmaster ? [] : [{ id: "alerts" as const, done: !!input.hasAlerts, optional: false }]),
    { id: "report", done: !!input.hasReport, optional: false },
  ];
  const required = steps.filter((step) => !step.optional);
  const completed = required.filter((step) => step.done).length;
  return {
    steps,
    completed,
    total: required.length,
    finished: required.length > 0 && completed === required.length,
  };
}
