// pull-check:v3-goal-b53a-2026-10-21
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

describe("b53a build memory", () => {
  it("the production build skips the in-build type check; CI's tsc job still runs on every PR", () => {
    expect(read("next.config.ts")).toMatch(/typescript:\s*\{\s*ignoreBuildErrors: true,/);
    expect(read(".github/workflows/tests.yml")).toMatch(/tsc/);
  });
  it("fonts stay local (no Google fetch at build time)", () => {
    const l = read("src/app/layout.tsx");
    expect(l).toContain('from "next/font/local"');
    expect(l).not.toContain("next/font/google");
  });
});
