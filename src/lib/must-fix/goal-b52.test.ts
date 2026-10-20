// pull-check:v3-goal-b52-2026-10-20
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

describe("b52 Batch 2 ship pins", () => {
  it("G-31: IR3 helper maps 2026 to Box 17B/17A, cites IR461 and keeps the indicative label", () => {
    const s = read("src/lib/ir3/ir3-helper.ts");
    expect(s).toContain('"17B"');
    expect(s).toContain('"17A"');
    expect(s).toContain("IR461");
    expect(s).toContain("Indicative, not tax advice");
  });
  it("G-31: the quick-sale adjustment is a visible line in the FIF paper", () => {
    expect(read("src/lib/tax-pack.ts")).toContain("quick-sale adjustment (IR461, in FDR)");
  });
  it("BS-02: InvestNow import is labelled real-layout unverified", () => {
    expect(read("src/lib/broker-import.ts")).toContain("Beta, layout not yet verified against a real export");
  });
  it("BS-01: cron fallback workflow restored", () => {
    expect(existsSync(".github/workflows/cron-fallback.yml")).toBe(true);
  });
});
