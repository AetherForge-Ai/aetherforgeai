import { describe, expect, it } from "vitest";
import { searchMarketUniverse } from "./market-intel";

describe("searchMarketUniverse", () => {
  it("resolves BAP to Bapcor on ASX without a network round-trip", () => {
    const matches = searchMarketUniverse("BAP");
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0]).toMatchObject({
      symbol: "BAP.AX",
      name: "Bapcor",
      exchangeLabel: "ASX",
    });
  });

  it("matches a company-name fragment", () => {
    const matches = searchMarketUniverse("bapcor");
    expect(matches.some((m) => m.symbol === "BAP.AX")).toBe(true);
  });
});
