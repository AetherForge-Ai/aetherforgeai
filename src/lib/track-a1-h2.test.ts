import { describe, expect, it } from "vitest";
import { buildLiveReport } from "@/lib/apex";
import type { SecurityIntel } from "@/lib/market-intel";
import { printsUnderReviewLine } from "@/lib/report-copy";

function intel(partial: Partial<SecurityIntel> & Pick<SecurityIntel, "ticker">): SecurityIntel {
  const projected = partial.projected7dPct ?? 2;
  return {
    ticker: partial.ticker,
    name: partial.name ?? partial.ticker,
    sector: "Test",
    market: partial.market ?? "US",
    assetClass: partial.assetClass ?? "stock",
    currency: partial.currency ?? "USD",
    price: partial.price ?? 100,
    change1d: partial.change1d ?? 1,
    change7d: partial.change7d ?? 1,
    change30d: partial.change30d ?? 1,
    history: [{ label: "Now", price: partial.price ?? 100 }],
    projection: [],
    projected7dPct: projected,
    confidence: 60,
    rsi: 50,
    macd: 0,
    macdSignalLine: 0,
    macdHistogram: 0,
    macdSignal: "Neutral",
    bbPosition: 50,
    sma20: 100,
    vsSma20: 0,
    sma50: 100,
    vsSma50: 0,
    atrPct: 1,
    realizedVolPct: 20,
    dailyVolPct: 1,
    regime: "Range-Bound",
    support: 90,
    resistance: 110,
    pivot: 100,
    outlook: {
      horizonDays: 7,
      expectedPct: projected,
      sigma7Pct: 1,
      regime: "Range-Bound",
      base: { label: "Base", lowPct: projected - 1, highPct: projected + 1, lowPrice: 1, highPrice: 2, probability: 50 },
      bull: { label: "Bull", lowPct: 2, highPct: 4, lowPrice: 2, highPrice: 3, probability: 25 },
      bear: { label: "Bear", lowPct: -3, highPct: -1, lowPrice: 0.5, highPrice: 0.8, probability: 25 },
    },
    signal: "Hold",
    score: 50,
    conviction: "Low",
    convictionReason: "test",
    reasoning: "test",
  };
}

describe("implausible moves stay out of rankings and projections", () => {
  it("drops the retest examples instead of ranking them", () => {
    const calm = intel({ ticker: "AAPL", change1d: 1.2, change7d: 2, projected7dPct: 1.5, score: 80, signal: "Buy", macdSignal: "Bullish" });
    const rows = [
      intel({ ticker: "LRCX", change1d: 43.68, projected7dPct: 43.68 }),
      intel({ ticker: "AMGN", change1d: 42.23, projected7dPct: 42.23 }),
      intel({ ticker: "MDLZ", change7d: 50.64, projected7dPct: 4 }),
      intel({ ticker: "JPM", change1d: 30.34, change7d: 31.01, projected7dPct: 3 }),
      intel({ ticker: "META", change1d: 28.9, change7d: 32.46, projected7dPct: 2 }),
      intel({ ticker: "WETH", market: "CRYPTO", assetClass: "crypto", change1d: 77.98, projected7dPct: 5 }),
      intel({ ticker: "USDG", market: "CRYPTO", assetClass: "crypto", change1d: 27.66, projected7dPct: 1 }),
      intel({ ticker: "CRVUSD", market: "CRYPTO", assetClass: "crypto", change1d: 29.82, projected7dPct: 1 }),
      calm,
    ];
    const stock = buildLiveReport("stock", [], { universeIntel: rows.filter((row) => row.assetClass === "stock") });
    const windowNames = (label: string) =>
      stock.marketMovers.flatMap((group) => group.windows.find((window) => window.window === label)?.movers ?? []).map((row) => row.ticker);
    expect(windowNames("Last 24 hours")).not.toEqual(expect.arrayContaining(["LRCX", "AMGN"]));
    expect(windowNames("Last 7 days")).not.toEqual(expect.arrayContaining(["MDLZ", "JPM", "META"]));
    for (const ticker of ["LRCX", "AMGN", "MDLZ", "JPM", "META"]) {
      expect(stock.projectionLeaders.map((row) => row.ticker)).not.toContain(ticker);
    }
    expect(windowNames("Last 24 hours")).toContain("AAPL");
    const us = stock.marketMovers.find((group) => group.market === "US");
    const day = us?.windows.find((window) => window.window === "Last 24 hours");
    const week = us?.windows.find((window) => window.window === "Last 7 days");
    expect(day?.withheldCount).toBe(4);
    expect(day?.reviewNote).toBe("4 prints under review");
    expect(printsUnderReviewLine(day?.withheldCount ?? 0)).toBe(day?.reviewNote ?? null);
    expect(week?.withheldCount).toBeGreaterThan(0);
    expect(week?.reviewNote).toMatch(/prints under review/);
    for (const ticker of ["JPM", "META", "MDLZ", "LRCX", "AMGN"]) {
      expect(week?.movers.map((row) => row.ticker)).not.toContain(ticker);
    }
    const crypto = buildLiveReport("crypto", [], { universeIntel: rows.filter((row) => row.assetClass === "crypto") });
    const cryptoDay = crypto.marketMovers.flatMap(
      (group) => group.windows.find((window) => window.window === "Last 24 hours")?.movers ?? []
    );
    for (const ticker of ["WETH", "USDG", "CRVUSD"]) {
      expect(cryptoDay.find((row) => row.ticker === ticker)).toBeUndefined();
      expect(crypto.projectionLeaders.map((row) => row.ticker)).not.toContain(ticker);
    }
  });

  it("keeps a legitimate 25% 30-day move on a large cap", () => {
    const report = buildLiveReport("stock", [], {
      universeIntel: [intel({ ticker: "JPM", change1d: 2, change7d: 4, change30d: 25, projected7dPct: 1.1 })],
    });
    const month = report.marketMovers
      .flatMap((group) => group.windows.find((window) => window.window === "Last month")?.movers ?? [])
      .find((row) => row.ticker === "JPM");
    expect(month?.withheld).toBe(false);
    expect(month?.changePct).toBe(25);
    const note = report.marketMovers
      .flatMap((group) => group.windows)
      .find((window) => window.window === "Last month")?.reviewNote;
    expect(note).toBeNull();
  });
});
