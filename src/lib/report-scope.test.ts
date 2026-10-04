import { describe, expect, it } from "vitest";
import { buildDemoReport, buildLiveReport } from "@/lib/apex";
import { claimsEmptyBook } from "@/lib/report-book";
import { stripReportModelLanguage } from "@/lib/report-language";
import {
  marketFeedUnavailableLine,
  portfolioIsLoaded,
  readPortfolioBook,
} from "@/lib/report-scope";

describe("portfolio load", () => {
  it("treats a book with no stocks, crypto, metals, or cash as empty", () => {
    const book = readPortfolioBook([], [], 0);
    expect(portfolioIsLoaded(book)).toBe(false);
  });

  it("treats cash, gold, silver, stocks, or crypto as a loaded book", () => {
    expect(portfolioIsLoaded(readPortfolioBook([], [], 25))).toBe(true);
    expect(
      portfolioIsLoaded(
        readPortfolioBook([{ ticker: "GOLD", asset_type: "metal", shares: 2 }], [], 0)
      )
    ).toBe(true);
    expect(
      portfolioIsLoaded(readPortfolioBook([], [{ metal: "silver", ounces: 10 }], 0))
    ).toBe(true);
    expect(
      portfolioIsLoaded(readPortfolioBook([{ ticker: "FPH.NZ", asset_type: "stock", shares: 4 }], [], 0))
    ).toBe(true);
    expect(
      portfolioIsLoaded(readPortfolioBook([{ ticker: "BTC", asset_type: "crypto", shares: 0.2 }], [], 0))
    ).toBe(true);
    expect(
      portfolioIsLoaded(readPortfolioBook([{ ticker: "FPH.NZ", asset_type: "stock", shares: 0 }], [], 0))
    ).toBe(false);
    expect(
      portfolioIsLoaded(
        readPortfolioBook([{ ticker: "GOLD", asset_type: "metal", shares: 0, company_name: "Gold bullion" }], [], 0),
        [{ label: "Gold", sublabel: "0 oz", assetClass: "metals", valueNZD: 0 }]
      )
    ).toBe(false);
    expect(
      portfolioIsLoaded(readPortfolioBook([], [], 0), [
        { label: "FPH.NZ", assetClass: "equities", valueNZD: 320 },
      ])
    ).toBe(true);
    expect(
      portfolioIsLoaded(readPortfolioBook([], [], 0), [
        { label: "Cash (NZD)", assetClass: "cash", valueNZD: 80 },
      ])
    ).toBe(true);
  });

});

describe("Stox and Koins report scope", () => {
  it("still produces a market report when the portfolio is empty", () => {
    const report = buildLiveReport("stock", []);
    expect(report.bot).toBe("stock");
    expect(report.executiveSummary.toLowerCase()).toMatch(/market/);
    expect(claimsEmptyBook(report.executiveSummary)).toBe(true);
    expect(report.marketMovers.length).toBeGreaterThan(0);
    expect(report.projectionLeaders.length).toBeGreaterThan(0);
  });

  it("covers the loaded portfolio and the market together", () => {
    const report = buildLiveReport("stock", [
      { ticker: "FPH.NZ", name: "Fisher & Paykel Healthcare", price: 32, shares: 10, purchasePrice: 30 },
    ]);
    const blob = [report.executiveSummary, ...report.keyObservations].join("\n");
    expect(blob).toMatch(/FPH\.NZ/);
    expect(blob).not.toMatch(/Precious metals on the book|Ledger cash|Equities on the book/);
    expect(blob.toLowerCase()).toMatch(/sweep/);
    expect(claimsEmptyBook(blob)).toBe(false);
  });

  it("does not invent market quotes when the feed is unavailable", () => {
    const report = buildLiveReport("crypto", [], { marketFeedUnavailable: true });
    expect(report.executiveSummary.startsWith("**AI briefing.**")).toBe(true);
    expect(report.keyObservations.filter((line) => line === marketFeedUnavailableLine("crypto"))).toEqual([
      marketFeedUnavailableLine("crypto"),
    ]);
    expect(report.executiveSummary).not.toContain(marketFeedUnavailableLine("crypto"));
    expect([report.executiveSummary, ...report.keyObservations].join("\n")).not.toContain(
      "The full crypto-market feed is unavailable"
    );
    expect(report.projectionLeaders).toHaveLength(0);
    expect(report.marketMovers.every((group) => group.windows.every((window) => window.movers.length === 0))).toBe(true);
    expect(report.directRecommendations).toHaveLength(0);
    expect(JSON.stringify(report.marketMovers)).not.toContain("96850");
    expect(report.executiveSummary.toLowerCase()).toMatch(/market/);
    expect(report.engine).toBe("intelligent AI bot named Koins");
    expect(report.generatedLabel).toBe("Live report");
    expect(JSON.stringify(report)).not.toMatch(/\b(ZENITH|Grok|ULTRA|advanced)\b/);
  });

  it("drops model branding and keeps the company name Advanced Micro Devices", () => {
    const cleaned = stripReportModelLanguage(
      "Live ZENITH run by SuperGrok 4.6. ULTRA advanced note on Advanced Micro Devices and grok-4.6."
    );
    expect(cleaned).toBe("Live report by. note on Advanced Micro Devices and.");
    expect(cleaned.replace(/Advanced Micro Devices/g, "")).not.toMatch(/\b(ZENITH|Grok|ULTRA|advanced|grok-4\.6)\b/i);
  });

  it("keeps the sample report badge used on the page", () => {
    const demo = buildDemoReport("stock");
    expect(demo.isDemo).toBe(true);
    expect(demo.engine).toBe("AI");
    expect(demo.generatedLabel).toBe("Sample report · illustrative data");
  });
});
