import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { formatReportCooldownLine } from "@/lib/entitlements";

describe("TT fresh M6 — Report Center copy", () => {
  it("monthly allowance line is complete", () => {
    const line = formatReportCooldownLine({ lastReportAt: new Date(Date.now() - 1000).toISOString(), waitMs: 0, perLabel: "per month" });
    expect(line).not.toMatch(/per month$/);
    expect(line).toMatch(/ready to refresh$/);
  });
  it("the build message only shows on an unlocked bot and the pre-choice reason is clear", () => {
    const src = readFileSync("src/components/dashboard/ReportCenter.tsx", "utf8");
    expect(src).toContain("{busy && unlocked ? (");
    expect(src).toContain("as your free bot first");
  });
});
