import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fiftyTwoWeekLine, RANGE_IMPLAUSIBLE } from "@/lib/stock-public-facts";
import { isJunkCoin } from "@/lib/coin-junk";

describe("TT fresh H5 — stock pages", () => {
  it("drops a 52-week low far below the price (MPG.NZ NZ$0.038 vs NZ$0.87)", () => {
    expect(fiftyTwoWeekLine(0.038, 1.6, "NZD", 0.87)).toBe(RANGE_IMPLAUSIBLE);
    expect(fiftyTwoWeekLine(0.7, 1.1, "NZD", 0.87)).toContain("NZ$");
  });
  it("no garbled 'as of not stated by the vendor'", () => {
    for (const f of ["src/lib/public-market-index.ts", "src/lib/stock-board.server.ts", "src/lib/crypto-price-chain.ts", "src/lib/crypto-public-meta.ts"]) {
      expect(readFileSync(f, "utf8")).not.toContain("as of not stated");
    }
  });
  it("detail card hides empty stats and uses the listing name", () => {
    const src = readFileSync("src/components/dashboard/StockDetailView.tsx", "utf8");
    expect(src).toContain("statRows(q, currency)");
    expect(src).toContain("target?.name || data?.name");
  });
});

describe("TT fresh H6 — coin pages", () => {
  it("flags junk tokens and keeps real ones", () => {
    expect(isJunkCoin("boner-coin")).toBe(true);
    for (const id of ["bitcoin", "cosmos", "arbitrum", "near", "cardano", "matic-network", "assemble-protocol", "bitcoin-cash"]) {
      expect(isJunkCoin(id)).toBe(false);
    }
  });
  it("the coin page prints a server h1 when no detail is ready", () => {
    const page = readFileSync("src/app/markets/crypto/[id]/page.tsx", "utf8");
    expect(page).toMatch(/<h1 className="font-display text-2xl/);
    expect(page).toContain("isJunkCoin");
  });
});
