import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { buildLiveReport, type ApexReport, type ProjectionRow } from "@/lib/apex";
import { applyKoinsSweeps, rankGainers, type KoinsCandidate } from "@/lib/koins-quality";
import type { SecurityIntel } from "@/lib/market-intel";
import { formatPercent } from "@/lib/portfolio";
import { projectionLeaderLine, sessionGainerSentence } from "@/lib/report-copy";
import { renderReportHtml } from "@/lib/report-html";
import { printMatchesMarketsQuote, reviewSessionMove } from "@/lib/quote-review";

function intel(partial: Partial<SecurityIntel> & Pick<SecurityIntel, "ticker">): SecurityIntel {
  const projected = partial.projected7dPct ?? 1;
  return {
    ticker: partial.ticker,
    name: partial.name ?? partial.ticker,
    sector: "Test",
    market: partial.market ?? "ASX",
    assetClass: "stock",
    currency: partial.currency ?? "AUD",
    price: partial.price ?? 2,
    change1d: partial.change1d ?? 1,
    change7d: partial.change7d ?? 1,
    change30d: partial.change30d ?? 1,
    history: [{ label: "Now", price: partial.price ?? 2 }],
    projection: [],
    projected7dPct: projected,
    confidence: partial.confidence ?? 60,
    rsi: 50,
    macd: 0,
    macdSignalLine: 0,
    macdHistogram: 0,
    macdSignal: "Neutral",
    bbPosition: 50,
    sma20: 2,
    vsSma20: 0,
    sma50: 2,
    vsSma50: 0,
    atrPct: 1,
    realizedVolPct: 20,
    dailyVolPct: partial.dailyVolPct ?? 3,
    regime: "Range-Bound",
    support: 1,
    resistance: 3,
    pivot: 2,
    outlook: {
      horizonDays: 7,
      expectedPct: projected,
      sigma7Pct: 2,
      regime: "Range-Bound",
      base: { label: "Base", lowPct: projected - 1, highPct: projected + 1, lowPrice: 1, highPrice: 3, probability: 50 },
      bull: { label: "Bull", lowPct: 2, highPct: 4, lowPrice: 3, highPrice: 4, probability: 25 },
      bear: { label: "Bear", lowPct: -2, highPct: 0, lowPrice: 1, highPrice: 2, probability: 25 },
    },
    signal: "Hold",
    score: partial.score ?? 40,
    conviction: "Low",
    convictionReason: "test",
    reasoning: "test",
  };
}

function coin(symbol: string, d7: number, agree?: number): KoinsCandidate {
  return {
    symbol,
    name: symbol,
    price: 1,
    moves: { h24: 1, d7, d30: 1 },
    agree: agree == null ? null : { h24: agree, d7: agree, d30: agree },
  };
}

function projection(ticker: string, pct: number, confidence = 70): ProjectionRow {
  return {
    ticker,
    name: ticker,
    market: "CRYPTO",
    currency: "USD",
    price: 1,
    projected7dPct: pct,
    confidence,
    signal: "Hold",
    ratingLabel: "HOLD",
  };
}

describe("Testing Technician r4", () => {
  it("keeps ZIP.AX when the print matches /markets and flags a real outlier", () => {
    expect(printMatchesMarketsQuote(-13.9, -13.9)).toBe(true);
    const zip = reviewSessionMove({
      ticker: "ZIP.AX",
      assetClass: "stock",
      market: "ASX",
      currency: "AUD",
      price: 5.7,
      previousClose: 2.85,
      reportedChangePct: 60,
      window: "1d",
      marketsChangePct: 60,
      dailyVolPct: 2.95,
    });
    expect(zip.withheld).toBe(false);
    expect(zip.reason).toBeNull();

    const week = reviewSessionMove({
      ticker: "ZIP.AX",
      assetClass: "stock",
      market: "ASX",
      currency: "AUD",
      price: 2.85,
      reportedChangePct: -18.15,
      window: "7d",
      dailyVolPct: 2.95,
    });
    expect(week.withheld).toBe(false);

    const bad = reviewSessionMove({
      ticker: "ZIP.AX",
      assetClass: "stock",
      market: "ASX",
      currency: "AUD",
      price: 2.85,
      reportedChangePct: 80,
      window: "7d",
      dailyVolPct: 2.95,
      secondSourceChangePct: 1,
    });
    expect(bad.withheld).toBe(true);
  });

  it("fills ASX and US 24-hour lists to 10 and keeps MAH.AX on the projected list", () => {
    const calm = (ticker: string, market: "ASX" | "US", change1d: number) =>
      intel({
        ticker,
        market,
        currency: market === "ASX" ? "AUD" : "USD",
        change1d,
        change7d: 1,
        change30d: 1,
        dailyVolPct: 3,
        projected7dPct: 1,
      });
    const outlier = (ticker: string, market: "ASX" | "US") =>
      intel({
        ticker,
        market,
        currency: market === "ASX" ? "AUD" : "USD",
        change1d: 40,
        change7d: 90,
        change30d: 1,
        dailyVolPct: 2,
        projected7dPct: 20,
      });
    const rows = [
      intel({
        ticker: "ZIP.AX",
        change1d: -13.9,
        change7d: -18.15,
        change30d: -16.65,
        dailyVolPct: 2.95,
        projected7dPct: 0.8,
        price: 2.85,
      }),
      intel({
        ticker: "MAH.AX",
        change1d: -5,
        change7d: -27.24,
        change30d: -14.86,
        dailyVolPct: 7.06,
        projected7dPct: 5.56,
        price: 0.32,
        confidence: 80,
      }),
      ...Array.from({ length: 12 }, (_, index) => calm(`G${index}.AX`, "ASX", index + 1)),
      ...Array.from({ length: 8 }, (_, index) => outlier(`B${index}.AX`, "ASX")),
      ...Array.from({ length: 12 }, (_, index) => calm(`U${index}`, "US", index + 1)),
      ...Array.from({ length: 8 }, (_, index) => outlier(`X${index}`, "US")),
    ];
    const report = buildLiveReport("stock", [], {
      universeIntel: rows,
      marketsCrossCheck: { changePct: { "ZIP.AX": -13.9 } },
    });
    const asxDay = report.marketMovers.find((group) => group.market === "ASX")?.windows.find((window) => window.window === "Last 24 hours");
    const usDay = report.marketMovers.find((group) => group.market === "US")?.windows.find((window) => window.window === "Last 24 hours");
    expect(asxDay?.movers).toHaveLength(10);
    expect(usDay?.movers).toHaveLength(10);
    const asxNames = report.marketMovers
      .find((group) => group.market === "ASX")
      ?.windows.flatMap((window) => window.underReview.map((row) => row.ticker));
    expect(asxNames ?? []).not.toContain("ZIP.AX");
    expect(asxDay?.movers.map((row) => row.ticker).some((ticker) => ticker.startsWith("B"))).toBe(false);
    expect(report.projectionLeaders.map((row) => row.ticker)).toContain("MAH.AX");
  });

  it("replaces a clamped Koins projection and does not rank unreviewed 7-day outliers", () => {
    const fresh = "2026-10-12T03:05:00.000Z";
    const now = Date.parse(fresh) + 60_000;
    const clamps = ["FLR", "FUN", "PEPE", "PUMP", "SHIB"].map((ticker) => projection(ticker, 12, 40));
    const valid = Array.from({ length: 10 }, (_, index) => projection(`V${index}`, 1.25 + index * 0.37, 80));
    const candidates = [
      coin("QRL", 48.31),
      coin("W", 46.67),
      coin("RLC", 40),
      coin("Q", 9.3400002),
      ...Array.from({ length: 12 }, (_, index) => coin(`C${index}`, 0.4 + index * 0.05)),
    ];
    const report = {
      bot: "crypto",
      marketMovers: [{ market: "CRYPTO", label: "Crypto", windows: [] }],
      projectionLeaders: [],
      topGainers: [],
      keyObservations: [],
    } as unknown as ApexReport;
    const swept = applyKoinsSweeps(
      report,
      { at: fresh, candidates, projections: [...clamps, ...valid] },
      now
    );
    expect(swept.projectionLeaders).toEqual([]);
    expect(swept.koinsUnavailableNote).toMatch(/does not publish a 7-day figure/);
    expect(JSON.stringify(swept.projectionLeaders)).not.toContain("12");
    const held = projectionLeaderLine(1, projection("FLR", 12, 40));
    expect(held).toContain("data under review");
    expect(held).not.toContain("+12.00%");
    expect(held).not.toContain("12.00%");

    const week = swept.marketMovers[0].windows.find((row) => row.window === "Last 7 days");
    expect(week?.movers.map((row) => row.ticker)).not.toEqual(expect.arrayContaining(["QRL", "W", "RLC"]));
    expect(week?.movers.find((row) => row.ticker === "Q")?.changePct).toBe(9.34);

    const agreed = rankGainers(
      [coin("QRL", 48.31, 48.4), ...Array.from({ length: 10 }, (_, index) => coin(`E${index}`, 0.2))],
      "7d"
    );
    expect(agreed.movers.map((row) => row.ticker)).toContain("QRL");

    const onlyClamps = applyKoinsSweeps(
      { ...report, projectionLeaders: [] },
      { at: fresh, candidates, projections: clamps },
      now
    );
    expect(onlyClamps.projectionLeaders).toEqual([]);
    expect(onlyClamps.koinsUnavailableNote || "").toMatch(/does not publish a 7-day figure/);
    expect(JSON.stringify(onlyClamps.projectionLeaders)).not.toContain("+12.00%");
  });

  it("prints Q at two decimal places in the report", () => {
    expect(formatPercent(9.3400002)).toBe("+9.34%");
    expect(sessionGainerSentence([{ ticker: "Q", changePct: 9.3400002 }], 0)).toBe(
      "Q leads the session (+9.34%) and tops the gainer board."
    );
    expect(projectionLeaderLine(1, projection("Q", 9.3400002))).toContain("+9.34%");
    const html = renderReportHtml(
      {
        bot: "crypto",
        title: "Koins",
        marketLabel: "Digital assets",
        generatedLabel: "Live report",
        isDemo: false,
        engine: "intelligent AI bot named Koins",
        executiveSummary: "Q is on the tape.",
        topGainers: [{ ticker: "Q", name: "Q", changePct: 9.3400002 }],
        sessionTapeNote: sessionGainerSentence([{ ticker: "Q", changePct: 9.3400002 }], 0),
        keyObservations: [],
        newsSynthesis: [],
        tickers: [],
        marketMovers: [],
        projectionLeaders: [projection("Q", 9.3400002)],
        directRecommendations: [],
        pathwayPlan: { pathways: [], recommendedName: "", recommendationNote: "" },
      },
      { generatedAtLabel: "12 Oct 2026" }
    );
    expect(html).toContain("+9.34%");
    expect(html).not.toContain("9.3400002");
    expect(html).not.toMatch(/\b(Grok|ULTRA|ZENITH)\b/);
    expect(readFileSync("src/components/bots/ApexReport.tsx", "utf8")).toContain("formatPercent(g.changePct)");
    expect(readFileSync("src/lib/projection-pause.ts", "utf8")).toContain("CRYPTO_PROJECTIONS_PAUSED = true");
  });
});
