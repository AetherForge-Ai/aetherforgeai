import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
const r = (f: string) => readFileSync(f, "utf8");
describe("TT fresh LOW", () => {
  it("home CTA lowercase portfolio", () => expect(r("src/app/page.tsx")).toContain("your portfolio?"));
  it("Koins separates symbol and name and signs gains", () => {
    const s = r("src/components/public/KoinsSnapshotPrices.tsx");
    expect(s).toContain('{" "}<span className="ml-1');
    expect(s).toContain('coin.change24h > 0 ? "+" : ""');
  });
  it("cookies Privacy Policy line is a sentence", () => expect(r("src/app/cookies/page.tsx")).toContain("For how we use the data these cookies collect"));
  it("trade review uses Ounces for metals and clears the price problem", () => {
    const s = r("src/components/dashboard/RecordTransactionPanel.tsx");
    expect(s).toContain('<ReviewRow label={asset?.assetType === "metal" ? "Ounces" : "Quantity"}');
    expect(s).toContain("Clear a stale \"Enter a price\" problem");
  });
  it("cash label uses NZ$", () => expect(r("src/lib/totalum-engine.ts")).not.toContain('"Cash (NZD)"'));
});
describe("TT fresh version pin", () => {
  it("build version and pull-check marker (fresh2 keeps the fresh marker)", () => {
    expect(r("public/build-version.txt").trim()).toBe("v3-goal-b47-2026-10-19");
    expect(r("qa/PULL-CHECK-2026-10-12.md")).toContain("pull-check:v3-tt-fresh-2026-10-15");
  });
});
