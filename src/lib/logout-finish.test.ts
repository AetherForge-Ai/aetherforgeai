import { describe, expect, it } from "vitest";
import { classifySessionProbe, logoutFinish } from "@/lib/logout-finish";

describe("logout finish", () => {
  it("treats a missing session as signed out and a live user as still present", () => {
    expect(classifySessionProbe(200, "user-1")).toBe("present");
    expect(classifySessionProbe(200, null)).toBe("absent");
    expect(classifySessionProbe(401, null)).toBe("absent");
    expect(classifySessionProbe(403, "user-1")).toBe("absent");
    expect(classifySessionProbe(500, null)).toBe("unknown");
  });

  it("finishes after a successful POST even when the probe hangs", () => {
    expect(logoutFinish(true, "unknown", false)).toBe("done");
    expect(logoutFinish(true, "absent", false)).toBe("done");
    expect(logoutFinish(true, "present", false)).toBe("retry");
    expect(logoutFinish(true, "present", true)).toBe("error");
    expect(logoutFinish(false, "unknown", false)).toBe("error");
  });
});
