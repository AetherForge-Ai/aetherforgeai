/**
 * Process guard (added after b27 shipped with the b26 version pin): the build version must name
 * the newest goal build that has a test file, and the PULL-CHECK must carry its marker. A build
 * that adds goal-bNN.test.ts without bumping public/build-version.txt fails here.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

describe("version bump guard", () => {
  it("build-version matches the newest goal-bNN test and the PULL-CHECK marker", () => {
    const version = readFileSync("public/build-version.txt", "utf8").trim();
    const m = /^v3-(?:goal|h1|g24|dedupe)-b(\d+)[a-z]?-\d{4}-\d{2}-\d{2}$/.exec(version);
    expect(m, `bad build-version: ${version}`).not.toBeNull();
    const newest = Math.max(
      ...readdirSync("src/lib/must-fix")
        .map((f) => /^goal-b(\d+)\.test\.ts$/.exec(f)?.[1])
        .filter(Boolean)
        .map(Number)
    );
    expect(Number(m![1])).toBe(newest);
    expect(readFileSync("qa/PULL-CHECK-2026-10-12.md", "utf8")).toContain(`pull-check:${version}`);
    expect(readFileSync(`src/lib/must-fix/goal-b${newest}.test.ts`, "utf8")).toContain(`pull-check:${version}`);
  });
});
