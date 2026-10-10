import { describe, expect, it } from "vitest";
import { buildLiveReport } from "@/lib/apex";
import { buildSynthesis, buildStrategy } from "@/lib/totalum-engine";
import type { SecurityIntel } from "@/lib/market-intel";
import { candidateIsSuitable, deploymentGuard, unsuitableReason } from "@/lib/report-consistency";
import { sessionGainerSentence } from "@/lib/report-copy";

function outlook(pct: number): SecurityIntel["outlook"] {
  return {
    horizonDays: 7,
    expectedPct: pct,
    sigma7Pct: 1,
    regime: "Range-Bound",
    base: { label: "Base", lowPct: pct - 1, highPct: pct + 1, lowPrice: 1, highPrice: 2, probability: 55 },
    bull: { label: "Bull", lowPct: pct + 1, highPct: pct + 3, lowPrice: 2, highPrice: 3, probability: 25 },
    bear: { label: "Bear", lowPct: -3, highPct: -1, lowPrice: 0.5, highPrice: 0.8, probability: 20 },
  };
}

function intel(partial: Partial<SecurityIntel> & Pick<SecurityIntel, "ticker">): SecurityIntel {
  const projected = partial.projected7dPct ?? 2;
  return {
    ticker: partial.ticker,
    name: partial.name ?? partial.ticker,
    sector: "Test",
    market: partial.market ?? "ASX",
    assetClass: partial.assetClass ?? "stock",
    currency: partial.currency ?? "AUD",
    price: partial.price ?? 11.4,
    change1d: partial.change1d ?? 0.4,
    change7d: partial.change7d ?? 1,
    change30d: partial.change30d ?? 2,
    history: partial.history ?? [{ label: "Now", price: partial.price ?? 11.4 }],
    projection: [],
    projected7dPct: projected,
    confidence: partial.confidence ?? 70,
    rsi: 55,
    macd: 0.2,
    macdSignalLine: 0,
    macdHistogram: 0.2,
    macdSignal: partial.macdSignal ?? "Bullish",
    bbPosition: 50,
    sma20: 10,
    vsSma20: 0,
    sma50: 10,
    vsSma50: 0,
    atrPct: 1,
    realizedVolPct: partial.realizedVolPct ?? 20,
    dailyVolPct: 1,
    regime: partial.regime ?? "Range-Bound",
    support: 9,
    resistance: 12,
    pivot: 10,
    outlook: partial.outlook ?? outlook(projected),
    signal: partial.signal ?? "Buy",
    score: partial.score ?? 65,
    conviction: partial.conviction ?? "Moderate",
    convictionReason: "test",
    reasoning: "test",
  };
}

const tape = { bias: "Neutral" as const, level: "Low" as const, score: 54, averageConfidence: 50 };

describe("H1 report logic", () => {
  const ada = intel({
    ticker: "ADA",
    name: "Cardano",
    market: "CRYPTO",
    assetClass: "crypto",
    currency: "USD",
    price: 0.42,
    score: 80,
    projected7dPct: -0.54,
    outlook: outlook(-0.54),
    confidence: 80,
  });
  const aaa = intel({ ticker: "AAA.AX", score: 70, confidence: 80, projected7dPct: 2, change1d: 1.1 });
  const bbb = intel({ ticker: "BBB.AX", score: 69, confidence: 80, projected7dPct: 2.2, change1d: 1.4 });
  const leader = intel({ ticker: "LEADER.AX", score: 60, confidence: 40, projected7dPct: 7.5, change1d: 4.2 });
  const mild = intel({ ticker: "MILD.AX", score: 40, macdSignal: "Neutral", signal: "Hold", projected7dPct: 0.2, change1d: 4.2, confidence: 40 });
  const sto = intel({ ticker: "STO.AX", score: 40, macdSignal: "Neutral", signal: "Hold", change1d: 73.07, price: 11.4 });
  const cdw = intel({ ticker: "CDW", market: "US", currency: "USD", score: 40, macdSignal: "Neutral", signal: "Hold", change1d: 64.76, price: 140 });
  const jpm = intel({ ticker: "JPM", market: "US", currency: "USD", score: 40, macdSignal: "Neutral", signal: "Hold", change1d: 30.34, price: 210 });
  const meta = intel({ ticker: "META", market: "US", currency: "USD", score: 40, macdSignal: "Neutral", signal: "Hold", change1d: 28.9, price: 520 });

  it("does not buy a name whose 7-day projection is not positive, and gives every skipped name a reason", () => {
    const guard = deploymentGuard("stock", tape, 1000, 1000);
    expect(candidateIsSuitable({ ...ada, projected7dPct: -0.54 }, guard)).toBe(false);
    expect(unsuitableReason({ ...ada, projected7dPct: -0.54 }, guard)).toMatch(/not positive/);
    expect(guard.headline).toMatch(/inside an 8%/);

    const report = buildLiveReport("stock", [], {
      tape,
      cashBalanceNZD: 1000,
      universeIntel: [ada, aaa, bbb, leader, mild, sto, cdw, jpm, meta],
    });

    for (const rec of report.directRecommendations) {
      if (rec.action === "BUY" || rec.action === "ACCUMULATE") {
        expect(rec.projected7dPct).toBeGreaterThan(0);
      }
    }
    expect(report.directRecommendations.some((rec) => rec.ticker === "ADA" && (rec.action === "BUY" || rec.action === "ACCUMULATE"))).toBe(false);
    expect(report.notSized?.length).toBeGreaterThan(0);
    for (const row of report.notSized ?? []) {
      expect(row.reason.trim().length).toBeGreaterThan(0);
    }
    expect(report.notSized?.some((row) => row.ticker === "ADA" && /not positive/.test(row.reason))).toBe(true);
    const prose = [report.executiveSummary, ...report.keyObservations, ...(report.pathwayPlan.pathways.flatMap((path) => path.steps))].join("\n");
    expect(prose).toContain("ADA");
    expect(prose).toMatch(/not positive|Not sized this week/);
    expect(prose).not.toMatch(/too aggressive/i);
    expect(prose).toMatch(/1 named BUY\/ACCUMULATE candidate|named BUY\/ACCUMULATE candidates/);

    const balanced = report.pathwayPlan.pathways.find((path) => path.name === "Balanced Growth");
    expect(balanced?.steps[0]).toMatch(/0\.00%/);
    expect(balanced?.steps[0]).not.toMatch(/Initiate/);
    const aggressive = report.pathwayPlan.pathways.find((path) => path.name === "Aggressive Alpha");
    expect(aggressive?.steps[0]).not.toMatch(/strongest momentum/i);
    expect(aggressive?.steps[0]).toContain("LEADER.AX");

    const session = sessionGainerSentence(
      report.topGainers.map((row) => ({ ticker: row.ticker, changePct: row.changePct })),
      report.sessionTapeNote?.includes("under review") ? 1 : 0
    );
    expect(report.keyObservations.join("\n")).toContain(report.sessionTapeNote ?? session);
    expect(report.topGainers[0]?.ticker).toBe(report.sessionTapeNote?.split(" ")[0]);
    expect(prose).not.toMatch(/73\.07|64\.76|30\.34|28\.90|28\.9/);
    for (const ticker of ["STO.AX", "CDW", "JPM", "META"]) {
      const row = report.marketMovers
        .flatMap((group) => group.windows.find((window) => window.window === "Last 24 hours")?.movers ?? [])
        .find((mover) => mover.ticker === ticker);
      expect(row?.withheld).toBe(true);
      expect(row?.changePct).toBe(0);
    }
    expect(JSON.stringify(report)).not.toMatch(/\b(Grok|ZENITH|ULTRA)\b/);
  });
});

describe("L3 projected list order", () => {
  it("sorts the projected top 10 by the percent on the row", () => {
    const bat = intel({
      ticker: "BAT",
      market: "CRYPTO",
      assetClass: "crypto",
      currency: "USD",
      price: 0.22,
      projected7dPct: 13.9,
      confidence: 99,
      outlook: outlook(13.9),
      change1d: 33.16,
    });
    const shib = intel({
      ticker: "SHIB",
      market: "CRYPTO",
      assetClass: "crypto",
      currency: "USD",
      price: 0.00002,
      projected7dPct: 24.38,
      confidence: 20,
      outlook: outlook(24.38),
      change1d: 4,
    });
    const report = buildLiveReport("crypto", [], {
      universeIntel: [bat, shib],
      marketFeedUnavailable: false,
    });
    const order = report.projectionLeaders.map((row) => row.ticker);
    expect(order.indexOf("SHIB")).toBeLessThan(order.indexOf("BAT"));
    expect(report.projectionLeaders[0]?.projected7dPct).toBeGreaterThanOrEqual(
      report.projectionLeaders[1]?.projected7dPct ?? 0
    );
    const day = report.marketMovers
      .flatMap((group) => group.windows.find((window) => window.window === "Last 24 hours")?.movers ?? [])
      .find((row) => row.ticker === "BAT");
    expect(day?.withheld).toBe(false);
    expect(day?.changePct).toBe(33.16);
  });
});

describe("L4 all-cash synthesis", () => {
  it("treats cash as not yet invested and does not score it twice", () => {
    const syn = buildSynthesis({
      stocks: [],
      metals: [],
      cashBalanceNZD: 100000,
      spot: {
        gold: { nzdPerOz: 7200, usdPerOz: 4300 },
        silver: { nzdPerOz: 110, usdPerOz: 66 },
        live: true,
        asOf: "2026-10-10",
      },
    });
    expect(syn.uninvestedBook).toBe(true);
    expect(syn.concentrationLabel).toBe("Not yet invested");
    expect(syn.concentrationRisks).toHaveLength(1);
    expect(syn.concentrationRisks[0]?.note).toMatch(/Not yet invested/);
    expect(syn.correlationNotes).toEqual([
      "Not yet invested. Correlation is not scored until the book holds a market position.",
    ]);
    expect(syn.expectedAnnualReturnPct).toBe(0);
    const strategy = buildStrategy(syn, "balanced_growth", {
      equitiesQualifying: 2,
      cryptoQualifying: 1,
    });
    expect(strategy.sleeveNotes.join(" ")).toMatch(/unallocated: not enough qualifying picks/);
    expect(buildStrategy(syn, "balanced_growth").sleeveNotes).toEqual([]);
  });
});
