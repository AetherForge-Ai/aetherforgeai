/**
 * Paper-book onboarding progress.
 * Headmaster is optional and is not part of the fraction, so a book that has
 * recorded buys cannot sit at 1/4 forever. Starting cash (the NZ$10k book)
 * is not a completed step.
 */

export type OnboardingStepId = "headmaster" | "buy" | "alerts" | "report";

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
}): OnboardingProgress {
  const steps: OnboardingStepState[] = [
    { id: "headmaster", done: false, optional: true },
    { id: "buy", done: input.hasHoldings, optional: false },
    { id: "alerts", done: !!input.hasAlerts, optional: false },
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
