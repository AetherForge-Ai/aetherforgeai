// pull-check:v3-cr6-b78-2026-10-27
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

describe("b54 REG-1: signed-out /markets first byte", () => {
  it("a cold build is bounded and falls back to the saved listings", () => {
    const src = read("src/lib/public-market-index.ts");
    expect(src).toMatch(/export const COLD_BUDGET_MS = 1_000;/);
    expect(src).toMatch(/within<PublicMarketIndex \| null>\(build, null, COLD_BUDGET_MS\)/);
    expect(src).toMatch(/return coldSavedIndex\(\)/);
  });
  it("the page bounds the crypto snapshot fill", () => {
    expect(read("src/app/markets/page.tsx")).toMatch(/withDeadline\(ensureCryptoTab\(built\), 400, built\)/);
  });
  it("build string", () => {
    expect(read("public/build-version.txt").trim()).toBe("v3-cr6-b78-2026-10-27");
  });
});
