// pull-check:v3-goal-b62-2026-10-23
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { readFileSync } from "node:fs";
import { isSharePickRequest, ASSISTANT_SHARE_PICK_REPLY } from "@/lib/guide-safety";
import { xaiErrorSummary } from "@/lib/grok";

const read = (p: string) => readFileSync(p, "utf8");

describe("b27 CR-2 share-pick refusal", () => {
  it.each([
    "What are the best NZX shares to buy right now?",
    "Which NZ stocks will go up next week?",
    "Give me your top 5 NZX picks",
    "Should I buy FPH?",
    "any share tips?",
    "recommend some ASX stocks",
  ])("refuses %s", (q) => expect(isSharePickRequest(q)).toBe(true));
  it.each(["How is my cash worked out?", "What does FIF mean?", "Why is AIR's price delayed?"])("answers %s", (q) =>
    expect(isSharePickRequest(q)).toBe(false)
  );
  it("refusal names no ticker and the route skips the model", () => {
    expect(ASSISTANT_SHARE_PICK_REPLY).not.toMatch(/\b[A-Z]{3,4}\.NZ\b/);
    expect(read("src/app/api/chat/route.ts")).toContain("isSharePickRequest(userMessage)");
  });
});

describe("b27 CR-2 xAI error body", () => {
  it("parses both shapes and redacts keys", () => {
    expect(xaiErrorSummary(404, '{"code":"Some resource","error":"The model grok-x does not exist or your team xai-abc123 does not have access"}')).toEqual({
      status: 404,
      code: "Some resource",
      message: "The model grok-x does not exist or your team xai-[redacted] does not have access",
    });
    expect(xaiErrorSummary(404, '{"error":{"code":"model_not_found","message":"nope"}}').code).toBe("model_not_found");
    expect(xaiErrorSummary(500, "plain").message).toBe("plain");
  });
});

describe("b27 G-10", () => {
  it("withdraw rows can be removed and the dialog names the row type", () => {
    expect(read("src/app/api/transactions/route.ts")).toContain('type === "withdraw"');
    expect(read("src/components/dashboard/TransactionsTab.tsx")).toContain("Remove this ${pending.type}?");
  });
  it("cached cash is not painted after a reload", () => {
    expect(read("src/lib/client-user-state.ts")).toContain("cacheSuppressedAfterReload");
  });
});

import { futureValue, monthlyNeeded, validateGoal } from "@/lib/goal-math";
describe("b27 H-11", () => {
  const now = new Date("2026-10-18T00:00:00Z");
  it("past date and bad contributions are refused", () => {
    const base = { targetNzd: 10000, targetDate: "2025-01-01", monthlyNzd: 100, bookNzd: 0, annualReturnPct: 5 };
    expect(validateGoal(base, now)).toBe("Choose a date in the future.");
    expect(validateGoal({ ...base, targetDate: "2028-01-01", monthlyNzd: NaN }, now)).toMatch(/as a number/);
    expect(validateGoal({ ...base, targetDate: "2028-01-01", monthlyNzd: -1 }, now)).toMatch(/above NZ\$0/); // b29: <= 0 is one inline error
  });
  it("monthly needed reaches the target", () => {
    const g = { targetNzd: 50000, targetDate: "2031-10-01", bookNzd: 5000, annualReturnPct: 5 };
    const need = monthlyNeeded(g, now);
    expect(futureValue(5000, need, 60, 5)).toBeGreaterThanOrEqual(50000);
    expect(futureValue(5000, need - 0.05, 60, 5)).toBeLessThan(50000);
    expect(monthlyNeeded({ ...g, bookNzd: 60000 }, now)).toBe(0);
  });
});

import { fifThresholdNzd } from "@/lib/fif-working-paper";
describe("b27 H-9 FIF threshold config", () => {
  it("defaults to 50k and honours FIF_THRESHOLD_NZD", () => {
    expect(fifThresholdNzd({})).toBe(50000);
    expect(fifThresholdNzd({ FIF_THRESHOLD_NZD: "75000" })).toBe(75000);
    expect(fifThresholdNzd({ FIF_THRESHOLD_NZD: "-1" })).toBe(50000);
  });
});

describe("b27 version bump", () => {
  it("pins the build everywhere", () => {
    expect(read("public/build-version.txt").trim()).toBe("v3-goal-b62-2026-10-23");
    expect(read("qa/PULL-CHECK-2026-10-12.md")).toContain("pull-check:v3-goal-b62-2026-10-23");
  });
});
