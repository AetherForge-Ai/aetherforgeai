// pull-check:v3-dashclean-d-b82-2026-10-27 (b53 pins; b53a build fix in goal-b53a.test.ts)
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { slotAlreadyBuilt } from "@/lib/track-record-slot";

const read = (p: string) => readFileSync(p, "utf8");

describe("b53 ship pins (BS-01, G-20, BS-02, BS-02-VERIFY)", () => {
  it("cron-fallback runs twice an hour and can be dispatched", () => {
    const y = read(".github/workflows/cron-fallback.yml");
    expect(y).toContain('cron: "10,40,55 * * * *"');
    expect(y).toContain("workflow_dispatch:");
  });
  it("a duplicate track-record slot run is a no-op", () => {
    expect(slotAlreadyBuilt([{ at: "2026-10-21T00:23:00Z", builtBy: "schedule" }], "2026-10-21T01:07:00Z")).toBe(true);
    expect(read("src/app/api/cron/track-record/route.ts")).toContain("duplicate: true");
  });
  it("InvestNow carries the Beta label", () => {
    expect(read("src/lib/broker-import.ts")).toContain("InvestNow (Beta, layout not yet verified against a real export)");
  });
});
