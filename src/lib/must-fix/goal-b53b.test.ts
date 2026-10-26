// pull-check:v3-g10-b70-2026-10-27
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("b53b BS-01/G-20 slot-aware watchdog", () => {
  it("cron-fallback runs the slot-aware script at :10, :40 and :55", () => {
    const wf = readFileSync(".github/workflows/cron-fallback.yml", "utf8");
    expect(wf).toContain('cron: "10,40,55 * * * *"');
    expect(wf).toContain("node scripts/cron-watchdog.mjs");
    expect(readFileSync("scripts/cron-watchdog.mjs", "utf8")).toContain("export const GRACE_MIN = 45;");
  });
});
