import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { slotAlreadyBuilt, trackSlotKey } from "./track-record-slot";

describe("b53 track-record slot idempotency", () => {
  it("keys by UTC date and 6-hour block", () => {
    expect(trackSlotKey("2026-10-20T00:23:00Z")).toBe("2026-10-20T00Z");
    expect(trackSlotKey("2026-10-20T05:59:59Z")).toBe("2026-10-20T00Z");
    expect(trackSlotKey("2026-10-20T06:00:00Z")).toBe("2026-10-20T06Z");
    expect(trackSlotKey("2026-10-20T23:37:00Z")).toBe("2026-10-20T18Z");
  });
  it("a duplicate run in the same slot is a no-op; the next slot or a seed entry is not", () => {
    const log = [{ at: "2026-10-20T06:23:10Z", builtBy: "schedule" }, { at: "2026-10-20T12:01:00Z", builtBy: "seed" }];
    expect(slotAlreadyBuilt(log, "2026-10-20T07:37:00Z")).toBe(true);
    expect(slotAlreadyBuilt(log, "2026-10-20T12:23:00Z")).toBe(false);
    expect(slotAlreadyBuilt(log, "2026-10-21T06:23:00Z")).toBe(false);
    expect(slotAlreadyBuilt([], "2026-10-20T07:37:00Z")).toBe(false);
  });
  it("the cron route checks the slot under a lock before building", () => {
    const s = readFileSync("src/app/api/cron/track-record/route.ts", "utf8");
    expect(s).toContain("withKeyLock(`track-record:${slot}`");
    expect(s.indexOf("slotAlreadyBuilt(")).toBeLessThan(s.indexOf("runTrackRecord()"));
    expect(s).toContain("duplicate: true");
  });
  it("cron-fallback has two hourly minutes and workflow_dispatch", () => {
    const y = readFileSync(".github/workflows/cron-fallback.yml", "utf8");
    expect(y).toContain('cron: "7,37 * * * *"');
    expect(y).toContain("workflow_dispatch:");
  });
});
