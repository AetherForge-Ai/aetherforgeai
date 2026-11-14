// pull-check:v3-b100-2026-11-15
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { checkReleaseGate } from "@/lib/release-gate";
import { BUILD_RELEASE_ID } from "@/lib/goal-test-hooks";

/** b100: release marker. READY stays refused until a preview-b100 grade exists. */
const read = (p: string) => readFileSync(p, "utf8");
const VERSION = "v3-b100-2026-11-15";

function buildNumber(id: string): number {
  const m = /^v3-b(\d+)/.exec(id);
  if (!m) throw new Error(`not a build id: ${id}`);
  return Number(m[1]);
}

describe("b100", () => {
  it("pins the build id", () => {
    expect(read("public/build-version.txt").trim()).toBe(VERSION);
    expect(BUILD_RELEASE_ID).toBe(read("public/build-version.txt").trim());
    expect(read("qa/PULL-CHECK-2026-10-12.md")).toContain(`pull-check:${VERSION}`);
    expect(read("qa/PULL-CHECK-2026-10-12.md")).toContain("HOOKS-PROD-OFF (PR683)");
    expect(read("qa/PULL-CHECK-2026-10-12.md")).toContain("H-1-TAPE-SSR-2 (PR681)");
    expect(read("qa/PULL-CHECK-2026-10-12.md")).toContain("H-10-CASH-FLOOR (PR682)");
  });

  it("b100 is a newer build number than b99", () => {
    expect(buildNumber("v3-b100-2026-11-15")).toBeGreaterThan(buildNumber("v3-b99-2026-11-15"));
    expect(["b100", "b99"].sort()).toEqual(["b100", "b99"]);
    const newest = Math.max(
      ...readdirSync("src/lib/must-fix")
        .map((f) => /^goal-b(\d+)\.test\.ts$/.exec(f)?.[1])
        .filter((n): n is string => Boolean(n))
        .map(Number),
    );
    expect(newest).toBe(100);
    expect(newest).toBeGreaterThan(99);
    const version = read("public/build-version.txt").trim();
    const m = /^v3-(?:(?:goal|h1|g24|dedupe|g10|del404|fix|m7|cr6|g18|cr6b|dashclean|dashclean-d|dashclean-e)-)?b(\d+)[a-z]?-\d{4}-\d{2}-\d{2}$/.exec(version);
    expect(Number(m?.[1])).toBe(newest);
  });

  it("has no READY marker and no preview-b100 grade", () => {
    expect(existsSync("goal-loop/READY_TO_PUBLISH")).toBe(false);
    expect(readdirSync("goal-loop").some((n) => n === "preview-b100.md" || (n.startsWith("preview-b100-") && n.endsWith(".md")))).toBe(false);
    const r = checkReleaseGate({ read: (p) => (existsSync(p) ? read(p) : null), list: (d) => readdirSync(d) });
    expect(r).toEqual({ ok: true, ready: false });
  });

  it("dry run: marking this build READY is blocked until a preview-b100 grade exists", () => {
    const r = checkReleaseGate({ read: (p) => (p === "goal-loop/READY_TO_PUBLISH" ? `${VERSION}\n` : existsSync(p) ? read(p) : null), list: (d) => readdirSync(d) });
    expect(r).toEqual({ ok: false, reason: `No TT preview grade file goal-loop/preview-b100.md or preview-b100-*.md for ${VERSION}.` });
  });
});
