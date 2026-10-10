import { describe, expect, it } from "vitest";
import { onboardingProgress } from "@/lib/onboarding-steps";

describe("onboardingProgress", () => {
  it("counts every visible step, so a first buy is 1/4", () => {
    const progress = onboardingProgress({ hasHoldings: true, hasAlerts: false, hasReport: false });
    expect(progress.total).toBe(4);
    expect(progress.completed).toBe(1);
    expect(progress.finished).toBe(false);
    expect(progress.steps.find((step) => step.id === "headmaster")?.optional).toBe(true);
    expect(progress.steps.find((step) => step.id === "headmaster")?.done).toBe(false);
  });

  it("ticks the first buy when cash is on the book and no holding is held", () => {
    const progress = onboardingProgress({ hasHoldings: false, hasCash: true, hasAlerts: false, hasReport: false });
    expect(progress.steps.find((step) => step.id === "buy")?.done).toBe(true);
    expect(`${progress.completed}/${progress.total}`).toBe("1/4");
    expect(progress.finished).toBe(false);
  });

  it("stays visible for a cash book that has not finished alerts and reports", () => {
    const progress = onboardingProgress({ hasHoldings: true });
    expect(progress.finished).toBe(false);
    expect(`${progress.completed}/${progress.total}`).toBe("1/4");
  });

  it("starts at 0/4 before the first buy or cash", () => {
    const progress = onboardingProgress({ hasHoldings: false, hasCash: false, hasAlerts: false, hasReport: false });
    expect(progress.completed).toBe(0);
    expect(progress.total).toBe(4);
    expect(progress.finished).toBe(false);
  });

  it("finishes when buys, alerts, and a report are done, even if Headmaster is still open", () => {
    const progress = onboardingProgress({ hasHoldings: true, hasAlerts: true, hasReport: true });
    expect(progress.completed).toBe(3);
    expect(progress.total).toBe(4);
    expect(progress.finished).toBe(true);
  });

  it("replaces Headmaster for Free and Starter with a holding step they can finish", () => {
    const free = onboardingProgress({ hasHoldings: true, hasAlerts: false, hasReport: false, plan: "free" });
    expect(free.steps.some((step) => step.id === "headmaster")).toBe(false);
    expect(free.steps.find((step) => step.id === "holding")).toMatchObject({ done: true, optional: true });
    expect(free.steps.some((step) => step.id === "alerts")).toBe(false);
    const starter = onboardingProgress({ hasHoldings: false, plan: "starter_monthly" });
    expect(starter.steps.find((step) => step.id === "holding")?.done).toBe(false);
    const pro = onboardingProgress({ hasHoldings: false, plan: "pro_monthly" });
    expect(pro.steps.find((step) => step.id === "headmaster")?.optional).toBe(true);
  });
});
