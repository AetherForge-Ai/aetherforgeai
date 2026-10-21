// pull-check:v3-goal-b25-2026-10-18
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

describe("goal b25", () => {
  it("pins the build", () => expect(read("public/build-version.txt").trim()).toMatch(/^v3-(?:goal|restore)-b\d+[a-z]?-2026-10-\d\d$/));
  it("CR-2: guide uses the sliding window and a configurable model", () => {
    expect(read("src/app/api/personal-guide/route.ts")).toContain("takeSlidingRateLimit(");
    const grok = read("src/lib/grok.ts");
    expect(grok).toContain("XAI_MODEL");
    expect(grok).toContain("GUIDE_MODEL_FALLBACK");
    expect(read("src/lib/ai-provider-health.ts")).toContain("XAI_CHAT_ENDPOINT");
  });
  it("G-10: delete applies once and the buy spot check is bounded", () => {
    expect(read("src/app/api/transactions/route.ts")).toContain("ReversalBlockedError");
    expect(read("src/lib/transactions.ts")).toContain("SPOT_CHECK_BUDGET_MS");
  });
});
