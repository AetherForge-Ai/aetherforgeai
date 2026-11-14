// pull-check:v3-b99-2026-11-15
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { checkReleaseGate } from "@/lib/release-gate";

/** b99: release marker. READY stays refused until a preview-b99 grade exists. */
const read = (p: string) => readFileSync(p, "utf8");

describe("b99", () => {
  it("pins the build id", () => {
    expect(read("public/build-version.txt").trim()).toBe("v3-b99-2026-11-15");
    expect(read("qa/PULL-CHECK-2026-10-12.md")).toContain("pull-check:v3-b99-2026-11-15");
  });

  it("has no READY marker and no preview-b99 grade", () => {
    expect(existsSync("goal-loop/READY_TO_PUBLISH")).toBe(false);
    expect(readdirSync("goal-loop").some((n) => n === "preview-b99.md" || (n.startsWith("preview-b99-") && n.endsWith(".md")))).toBe(false);
    const r = checkReleaseGate({ read: (p) => (existsSync(p) ? read(p) : null), list: (d) => readdirSync(d) });
    expect(r).toEqual({ ok: true, ready: false });
  });

  it("dry run: marking this build READY is blocked until a preview-b99 grade exists", () => {
    const r = checkReleaseGate({ read: (p) => (p === "goal-loop/READY_TO_PUBLISH" ? "v3-b99-2026-11-15\n" : existsSync(p) ? read(p) : null), list: (d) => readdirSync(d) });
    expect(r).toEqual({ ok: false, reason: "No TT preview grade file goal-loop/preview-b99.md or preview-b99-*.md for v3-b99-2026-11-15." });
  });
});
