import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildLiveReport } from "@/lib/apex";
import { buildIntelligenceBriefing } from "@/lib/briefing";
import type { SecurityIntel } from "@/lib/market-intel";
import { balancedGrowthStep } from "@/lib/report-copy";
import {
  deploymentGuard,
  narrativeContradictsCanonical,
  rateAsset,
  readTape,
} from "@/lib/report-consistency";

function intel(partial: Partial<SecurityIntel> & Pick<SecurityIntel, "ticker">): SecurityIntel {
  const expected = partial.outlook?.expectedPct ?? partial.projected7dPct ?? 0.02;
  return {
    ticker: partial.ticker,
    name: partial.name ?? partial.ticker,
    sector: "Test",
    market: partial.market ?? "CRYPTO",
    assetClass: partial.assetClass ?? "crypto",
    currency: partial.currency ?? "USD",
    price: partial.price ?? 1,
    change1d: partial.change1d ?? 0.2,
    change7d: partial.change7d ?? 0.4,
    change30d: partial.change30d ?? 1,
    history: [{ label: "Now", price: partial.price ?? 1 }],
    projection: [],
    projected7dPct: partial.projected7dPct ?? expected,
    confidence: partial.confidence ?? 55,
    rsi: partial.rsi ?? 48,
    macd: 0.1,
    macdSignalLine: 0,
    macdHistogram: 0.1,
    macdSignal: partial.macdSignal ?? "Bullish",
    bbPosition: 50,
    sma20: 1,
    vsSma20: 0,
    sma50: 1,
    vsSma50: 0,
    atrPct: 1,
    realizedVolPct: 40,
    dailyVolPct: 2,
    regime: partial.regime ?? "Range-Bound",
    support: 0.9,
    resistance: 1.1,
    pivot: 1,
    outlook: partial.outlook ?? {
      horizonDays: 7,
      expectedPct: expected,
      sigma7Pct: 2,
      regime: partial.regime ?? "Range-Bound",
      base: { label: "Base", lowPct: expected - 1, highPct: expected + 1, lowPrice: 0.9, highPrice: 1.1, probability: 50 },
      bull: { label: "Bull", lowPct: 2, highPct: 4, lowPrice: 1.1, highPrice: 1.2, probability: 25 },
      bear: { label: "Bear", lowPct: -4, highPct: -2, lowPrice: 0.8, highPrice: 0.9, probability: 25 },
    },
    signal: partial.signal ?? "Buy",
    score: partial.score ?? 70,
    conviction: partial.conviction ?? "Moderate",
    convictionReason: "test",
    reasoning: "test",
  };
}

describe("one record per ticker", () => {
  it("does not let a narrative sentence contradict the ADA, NEAR, or MAH.AX record", () => {
    const ada = intel({ ticker: "ADA", name: "Cardano", signal: "Buy", projected7dPct: -0.63, score: 80 });
    const mah = intel({
      ticker: "MAH.AX",
      name: "Macmahon",
      market: "ASX",
      assetClass: "stock",
      currency: "AUD",
      signal: "Buy",
      macdSignal: "Bearish",
      regime: "Range-Bound",
      projected7dPct: 5.56,
      score: 40,
    });
    expect(rateAsset(ada)).toMatchObject({ action: "HOLD", cardSignal: "Hold", positiveMomentum: false });
    expect(rateAsset(mah).action).toBe("HOLD");

    const tape = readTape([ada]);
    const report = buildLiveReport(
      "crypto",
      [{ ticker: "ADA", name: "Cardano", price: 0.4, shares: 10, purchasePrice: 0.42 }],
      { holdingIntel: [ada], tape, cashBalanceNZD: 1000, universeIntel: [mah, ada] }
    );
    const rec = report.directRecommendations.find((row) => row.ticker === "ADA");
    const card = report.tickers.find((row) => row.ticker === "ADA");
    expect(rec?.action).toBe("HOLD");
    expect(rec?.detail).toContain("does not issue a buy.");
    expect(rec?.detail).not.toMatch(/does not issue a\.$/);
    expect(card?.signal).toBe("Hold");
    expect(card?.note).toContain("HOLD");
    expect(card?.note).toContain("does not issue a buy.");

    const briefing = buildIntelligenceBriefing({
      bot: "crypto",
      marketLabel: "Crypto",
      technicals: [ada],
      events: [],
      sentiment: { label: "Neutral", score: 50, bullish: 0, bearish: 0, neutral: 0, method: "keyword", headlines: [] },
    });
    expect(briefing.executiveSummary).not.toMatch(/BUY ADA/);
    expect(briefing.executiveSummary).toMatch(/HOLD ADA/);
    expect(briefing.executiveSummary).toMatch(/0 of 1/);
    expect(briefing.keyObservations.join(" ")).toMatch(/0 of 1/);
    expect(report.executiveSummary).toMatch(/0 of 1/);

    const guard = deploymentGuard("crypto", tape, 1000, 1000);
    const prose = [briefing.executiveSummary, ...briefing.keyObservations, report.executiveSummary, rec?.detail, card?.note]
      .filter(Boolean)
      .join(" ");
    expect(
      narrativeContradictsCanonical(prose, [{ ticker: "ADA", action: "HOLD" }], guard, { positive: 0, total: 1 })
    ).toBe(false);

    const pathway = balancedGrowthStep(-0.63, "NEAR", "crypto");
    expect(pathway).toBe("This pathway's 7-day target is -0.63%, so it does not initiate a position.");
    expect(pathway).not.toMatch(/Initiate/);

    const leader = report.projectionLeaders.find((row) => row.ticker === "MAH.AX");
    expect(leader?.projected7dPct).toBeGreaterThan(0);
    expect(leader?.signal === "Buy" || leader?.signal === "Strong Buy").toBe(false);
    expect(readFileSync("src/components/bots/ApexReport.tsx", "utf8")).not.toMatch(/Buy-signal names/);
  });
});
