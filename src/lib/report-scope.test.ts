import { describe, expect, it } from "vitest";
import { buildLiveReport } from "@/lib/apex";
import { claimsEmptyBook } from "@/lib/report-book";
import {
  marketFeedUnavailableLine,
  portfolioCoverageLines,
  portfolioIsLoaded,
  readPortfolioBook,
} from "@/lib/report-scope";

describe("portfolio load", () => {
  it("treats a book with no stocks, crypto, metals, or cash as empty", () => {
    const book = readPortfolioBook([], [], 0);
    expect(portfolioIsLoaded(book)).toBe(false);
    expect(portfolioCoverageLines({ book })).toEqual([]);
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
  });

  it("states metal ounces without a spot when that feed is down", () => {
    const book = readPortfolioBook([{ ticker: "SILVER", asset_type: "metal", shares: 8 }], [], 100);
    const lines = portfolioCoverageLines({ book, metalsFeedLive: false });
    expect(lines.join(" ")).toMatch(/8 oz silver/);
    expect(lines.join(" ")).toMatch(/precious-metals feed is unavailable/);
    expect(lines.join(" ")).toMatch(/Ledger cash: NZ\$100/);
    expect(lines.join(" ")).not.toMatch(/silver \(\$/i);
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
    ], {
      portfolioLines: ["Precious metals on the book: 1 oz gold.", "Ledger cash: NZ$400."],
    });
    const blob = [report.executiveSummary, ...report.keyObservations].join("\n");
    expect(blob).toMatch(/FPH\.NZ/);
    expect(blob).toMatch(/1 oz gold/);
    expect(blob).toMatch(/NZ\$400/);
    expect(blob.toLowerCase()).toMatch(/market|sweep/);
    expect(claimsEmptyBook(blob)).toBe(false);
  });

  it("does not invent market quotes when the feed is unavailable", () => {
    const report = buildLiveReport("crypto", [], { marketFeedUnavailable: true });
    const blob = [report.executiveSummary, ...report.keyObservations].join("\n");
    expect(blob).toContain(marketFeedUnavailableLine("crypto"));
    expect(report.projectionLeaders).toHaveLength(0);
    expect(report.marketMovers.every((group) => group.windows.every((window) => window.movers.length === 0))).toBe(true);
    expect(report.directRecommendations).toHaveLength(0);
    expect(JSON.stringify(report.marketMovers)).not.toContain("96850");
    expect(report.executiveSummary.toLowerCase()).toMatch(/market/);
  });
});
