import { describe, expect, it } from "vitest";
import { onboardingProgress } from "@/lib/onboarding-steps";

describe("onboardingProgress", () => {
  it("does not count the optional Headmaster step, so a first buy is 1/3", () => {
    const progress = onboardingProgress({ hasHoldings: true, hasAlerts: false, hasReport: false });
    expect(progress.total).toBe(3);
    expect(progress.completed).toBe(1);
    expect(progress.finished).toBe(false);
    expect(progress.steps.find((step) => step.id === "headmaster")?.optional).toBe(true);
  });

  it("stays visible for a cash book that has not finished alerts and reports", () => {
    const progress = onboardingProgress({ hasHoldings: true });
    expect(progress.finished).toBe(false);
    expect(`${progress.completed}/${progress.total}`).not.toBe("1/4");
  });

  it("starts at 0/3 before the first buy", () => {
    const progress = onboardingProgress({ hasHoldings: false, hasAlerts: false, hasReport: false });
    expect(progress.completed).toBe(0);
    expect(progress.total).toBe(3);
    expect(progress.finished).toBe(false);
  });

  it("finishes only when buys, alerts, and a report are done", () => {
    const progress = onboardingProgress({ hasHoldings: true, hasAlerts: true, hasReport: true });
    expect(progress.completed).toBe(3);
    expect(progress.finished).toBe(true);
  });
});
