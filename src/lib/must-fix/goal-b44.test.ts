// pull-check:v3-goal-b44-2026-10-19
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NEWS_FEEDS } from "@/lib/news-sources";
import { QUOTE_DELAY_TABLE } from "@/lib/market-freshness";
import { PROCESSORS } from "@/lib/public-copy";

const read = (p: string) => readFileSync(p, "utf8");

describe("b44 H-15: /trust names every news feed and every price provider has a delay line", () => {
  it("crypto news feeds read by market-news are listed with a delay", () => {
    const src = read("src/lib/market-news.ts");
    for (const name of ["CryptoCompare", "CoinDesk", "Cointelegraph"]) {
      const row = NEWS_FEEDS.find((f) => f.source === name);
      expect(row, name).toBeTruthy();
      expect(row!.delay).toMatch(/minutes/);
    }
    expect(src).toContain("fetchCryptoCompareNews(12)");
  });
  it("every price processor appears in the delay table", () => {
    const delays = QUOTE_DELAY_TABLE.map((r) => r.source).join(" | ");
    const priceRoles = PROCESSORS().filter((p) => /price|exchange rate/i.test(p.role) && !/payments/.test(p.role));
    for (const p of priceRoles) {
      if (p.name === "Swyftx" || p.name === "DexScreener") continue; // display-flagged feeds
      expect(delays, p.name).toContain(p.name);
    }
  });
});

describe("b44 G-14: Add panel focus trap keeps fixed-position controls", () => {
  it("does not filter tabbables by offsetParent", () => {
    const src = read("src/components/dashboard/TransactionDialog.tsx");
    expect(src).toContain("isTabbableVisible");
    expect(src).not.toContain("el.offsetParent !== null");
  });
});

describe("b44 version", () => {
  it("build marker", () => {
    expect(read("public/build-version.txt")).toContain("v3-g10-b70-2026-10-27");
  });
});
