// pull-check:v3-b98-2026-11-10
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { checkReleaseGate } from "@/lib/release-gate";

/** b97: DEX-1 shown count, G-24 on-device PDF/screenshot reader, TT b97 grade committed, build id bumped (TT P3). */
const read = (p: string) => readFileSync(p, "utf8");
describe("b97", () => {
  it("pins the build id TT asked for", () => {
    expect(read("public/build-version.txt").trim()).toBe("v3-b98-2026-11-10");
    expect(read("qa/PULL-CHECK-2026-10-12.md")).toContain("pull-check:v3-b98-2026-11-10");
  });
  it("carries TT's b97 grade with 0 P0 and 0 P1, and no READY marker", () => {
    const g = read("goal-loop/preview-b97-tt.md");
    expect(g).toMatch(/P0:\s*0/);
    expect(g).toMatch(/P1:\s*0/);
    expect(existsSync("goal-loop/preview-b97")).toBe(true);
    expect(existsSync("goal-loop/READY_TO_PUBLISH")).toBe(false);
    const r = checkReleaseGate({ read: (p) => (existsSync(p) ? read(p) : null), list: (d) => readdirSync(d) });
    expect(r).toEqual({ ok: true, ready: false });
  });
  it("dry run: marking this build READY is blocked until a preview-b98 grade exists", () => {
    const r = checkReleaseGate({ read: (p) => (p === "goal-loop/READY_TO_PUBLISH" ? "v3-b98-2026-11-10\n" : existsSync(p) ? read(p) : null), list: (d) => readdirSync(d) });
    expect(r).toEqual({ ok: false, reason: "No TT preview grade file goal-loop/preview-b98.md or preview-b98-*.md for v3-b98-2026-11-10." });
  });
});
