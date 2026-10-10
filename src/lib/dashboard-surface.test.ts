import { describe, expect, it } from "vitest";
import { reportRunStatus, surfaceWhileLoading } from "@/lib/dashboard-surface";

describe("dashboard surface", () => {
  it("stays on loading until the fetch finishes", () => {
    expect(surfaceWhileLoading(false, true)).toBe("loading");
    expect(surfaceWhileLoading(true, true)).toBe("empty");
    expect(surfaceWhileLoading(true, false)).toBe("ready");
    expect(reportRunStatus(false, "Ready to run")).toBe("Loading…");
    expect(reportRunStatus(true, "Ready to run")).toBe("Ready to run");
  });
});
