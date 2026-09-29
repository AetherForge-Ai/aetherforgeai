import { describe, expect, it } from "vitest";
import { buildLiveReport } from "@/lib/apex";
import { buildIntelligenceBriefing } from "@/lib/briefing";
import type { SecurityIntel } from "@/lib/market-intel";
import {
  alignedProjection,
  candidateIsSuitable,
  deploymentGuard,
  narrativeContradictsCanonical,
  rateAsset,
  readTape,
  urgesFullDeployment,
} from "@/lib/report-consistency";

function intel(partial: Partial<SecurityIntel> & Pick<SecurityIntel, "ticker">): SecurityIntel {
  const low = partial.outlook?.base.lowPct ?? -2.83;
  const high = partial.outlook?.base.highPct ?? 2.87;
  const expected = partial.outlook?.expectedPct ?? 0.02;
  return {
    ticker: partial.ticker,
    name: partial.name ?? partial.ticker,
    sector: "Test",
    market: partial.market ?? "NZX",
    assetClass: partial.assetClass ?? "stock",
    currency: partial.currency ?? "NZD",
    price: partial.price ?? 10,
    change1d: partial.change1d ?? 0.4,
    change7d: partial.change7d ?? 1.2,
    change30d: partial.change30d ?? 3,
    history: partial.history ?? [{ label: "Now", price: partial.price ?? 10 }],
    projection: [],
    projected7dPct: partial.projected7dPct ?? expected,
    confidence: partial.confidence ?? 50,
    rsi: partial.rsi ?? 55,
    macd: 0.1,
    macdSignalLine: 0,
    macdHistogram: 0.1,
    macdSignal: partial.macdSignal ?? "Neutral",
    bbPosition: 50,
    sma20: 10,
    vsSma20: 0,
    sma50: 10,
    vsSma50: 0,
    atrPct: 1,
    realizedVolPct: 20,
    dailyVolPct: 1,
    regime: partial.regime ?? "Range-Bound",
    support: 9,
    resistance: 11,
    pivot: 10,
    outlook: partial.outlook ?? {
      horizonDays: 7,
      expectedPct: expected,
      sigma7Pct: 2,
      regime: partial.regime ?? "Range-Bound",
      base: { label: "Base", lowPct: low, highPct: high, lowPrice: 9, highPrice: 11, probability: 50 },
      bull: { label: "Bull", lowPct: 3, highPct: 6, lowPrice: 11, highPrice: 12, probability: 25 },
      bear: { label: "Bear", lowPct: -6, highPct: -3, lowPrice: 8, highPrice: 9, probability: 25 },
    },
    signal: partial.signal ?? "Hold",
    score: partial.score ?? 52,
    conviction: partial.conviction ?? "Moderate",
    convictionReason: "test",
    reasoning: "test",
  };
}

const neutralTape = { bias: "Neutral" as const, level: "Speculative" as const, score: 54, averageConfidence: 42 };

describe("canonical ratings", () => {
  it("keeps a bullish MACD buy as the only positive-momentum rating", () => {
    const fph = rateAsset({ signal: "Buy", macdSignal: "Bullish", regime: "Range-Bound" });
    expect(fph).toEqual({ action: "BUY", cardSignal: "Buy", positiveMomentum: true });
  });

  it("will not call a bearish downtrend a buy", () => {
    const eth = rateAsset({ signal: "Strong Buy", macdSignal: "Bearish", regime: "Trending Down" });
    expect(eth.action).toBe("HOLD");
    expect(eth.cardSignal).toBe("Hold");
    expect(eth.positiveMomentum).toBe(false);
  });

  it("holds a buy whose MACD is bearish even outside a downtrend", () => {
    expect(rateAsset({ signal: "Buy", macdSignal: "Bearish", regime: "Range-Bound" }).action).toBe("HOLD");
  });

  it("quotes one midpoint inside one base range", () => {
    const aligned = alignedProjection(
      intel({ ticker: "FPH.NZ", outlook: undefined })
    );
    expect(aligned.pct).toBe(0.02);
    expect(aligned.range).toBe("-2.83% to +2.87%");
  });
});

describe("cash deployment guard", () => {
  it("caps a neutral speculative tape and refuses the full cash balance", () => {
    const guard = deploymentGuard("stock", neutralTape, 12696);
    expect(guard.mode).toBe("starter");
    expect(guard.maxDeployFraction).toBe(0.25);
    expect(guard.headline).toMatch(/Do not deploy the full cash balance/);
    expect(guard.headline).toMatch(/12,696/);
    expect(
      candidateIsSuitable(
        { signal: "Strong Buy", macdSignal: "Bullish", regime: "Trending Up", conviction: "Speculative", projected7dPct: 27 },
        guard
      )
    ).toBe(false);
  });

  it("does not treat the guard sentence itself as a full-cash instruction", () => {
    const guard = deploymentGuard("crypto", { bias: "Neutral", level: "Low", score: 49, averageConfidence: 40 }, 680);
    expect(urgesFullDeployment(guard.headline)).toBe(false);
    expect(urgesFullDeployment("Deploy the full cash balance into GALA.")).toBe(true);
    expect(
      narrativeContradictsCanonical(
        "HOLD ETH. 0 of 1 assets carry a positive momentum signal. Do not deploy the full cash balance.",
        [{ ticker: "ETH", action: "HOLD" }],
        guard,
        { positive: 0, total: 1 }
      )
    ).toBe(false);
    expect(
      narrativeContradictsCanonical(
        "ETH is a Strong Buy. 1 of 1 assets carry a positive momentum signal. Deploy the full cash into alts.",
        [{ ticker: "ETH", action: "HOLD" }],
        guard,
        { positive: 0, total: 1 }
      )
    ).toBe(true);
  });
});

describe("live report uses one rating", () => {
  const fph = intel({
    ticker: "FPH.NZ",
    name: "Fisher & Paykel Healthcare",
    signal: "Buy",
    macdSignal: "Bullish",
    regime: "Range-Bound",
    conviction: "Moderate",
    score: 61,
  });
  const aapl = intel({
    ticker: "AAPL",
    name: "Apple",
    market: "US",
    currency: "USD",
    signal: "Hold",
    macdSignal: "Bearish",
    regime: "High Volatility",
    score: 48,
  });
  const bhp = intel({
    ticker: "BHP.AX",
    name: "BHP",
    market: "ASX",
    currency: "AUD",
    signal: "Hold",
    macdSignal: "Neutral",
    regime: "High Volatility",
    score: 47,
  });
  const gala = intel({
    ticker: "GALA",
    name: "Gala",
    market: "CRYPTO",
    assetClass: "crypto",
    currency: "USD",
    signal: "Strong Buy",
    macdSignal: "Bullish",
    regime: "High Volatility",
    conviction: "Speculative",
    projected7dPct: 27.5,
    score: 80,
    confidence: 70,
  });

  it("aligns Stox cards, counts, ranges, and cash advice", () => {
    const report = buildLiveReport(
      "stock",
      [
        { ticker: "AAPL", name: "Apple", price: 180, shares: 2, purchasePrice: 170 },
        { ticker: "BHP.AX", name: "BHP", price: 40, shares: 10, purchasePrice: 38 },
        { ticker: "FPH.NZ", name: "Fisher & Paykel Healthcare", price: 36, shares: 5, purchasePrice: 34 },
      ],
      { holdingIntel: [aapl, bhp, fph], tape: neutralTape, cashBalanceNZD: 12696, universeIntel: [gala] }
    );
    const fphCard = report.tickers.find((t) => t.ticker === "FPH.NZ");
    const fphRec = report.directRecommendations.find((r) => r.ticker === "FPH.NZ");
    expect(fphCard?.signal).toBe("Buy");
    expect(fphCard?.note).toContain("BUY");
    expect(fphCard?.note).toContain("-2.83% to +2.87%");
    expect(fphCard?.note).toContain("+0.02%");
    expect(fphRec?.action).toBe("BUY");
    expect(fphRec?.detail).toContain("-2.83% to +2.87%");
    expect(fphRec?.detail).toContain("+0.02%");
    expect(report.executiveSummary).toMatch(/1 of 3/);
    expect(report.executiveSummary).toContain("BUY FPH.NZ");
    expect(report.executiveSummary).toContain("-2.83% to +2.87%");
    expect(report.keyObservations.join(" ")).toMatch(/1 of 3/);
    expect(report.executiveSummary).toMatch(/Do not deploy the full cash balance/);
    expect(report.pathwayPlan.recommendationNote).toMatch(/Do not deploy the full cash balance/);
    expect(report.directRecommendations.some((r) => r.ticker === "GALA")).toBe(false);
    expect(report.executiveSummary).toMatch(/GALA/);
    const daySum = (fphCard?.shortTerm ?? []).reduce((s, d) => s + d.movePct, 0);
    expect(Math.round(daySum * 100) / 100).toBe(0.02);
  });

  it("keeps ETH a hold when the tape and MACD are bearish", () => {
    const eth = intel({
      ticker: "ETH",
      name: "Ethereum",
      market: "CRYPTO",
      assetClass: "crypto",
      currency: "USD",
      signal: "Strong Buy",
      macdSignal: "Bearish",
      regime: "Trending Down",
      conviction: "Low",
      score: 44,
      rsi: 29.9,
    });
    const tape = readTape([eth]);
    const report = buildLiveReport(
      "crypto",
      [{ ticker: "ETH", name: "Ethereum", price: 2700, shares: 0.25, purchasePrice: 2730 }],
      { holdingIntel: [eth], tape, cashBalanceNZD: 0, universeIntel: [gala] }
    );
    expect(report.tickers[0]?.signal).toBe("Hold");
    expect(report.tickers[0]?.note).toContain("HOLD");
    expect(report.tickers[0]?.note).toContain("This is not a positive-momentum rating.");
    expect(report.directRecommendations.find((r) => r.ticker === "ETH")?.action).toBe("HOLD");
    expect(report.executiveSummary).toMatch(/0 of 1/);
    expect(report.executiveSummary).toContain("HOLD ETH");
    expect(report.directRecommendations.some((r) => r.ticker === "GALA" && (r.action === "BUY" || r.action === "ACCUMULATE"))).toBe(false);

    const briefing = buildIntelligenceBriefing({
      bot: "crypto",
      marketLabel: "Crypto",
      technicals: [eth],
      events: [],
      sentiment: { label: "Neutral", score: 50, bullish: 0, bearish: 0, neutral: 0, method: "keyword", headlines: [] },
    });
    expect(briefing.executiveSummary).toMatch(/0 of 1/);
    expect(briefing.executiveSummary).toContain("HOLD ETH");
    expect(briefing.outlook[0]?.signal).toBe("Hold");
    expect(briefing.keyObservations.join(" ")).toMatch(/0 of 1/);
  });
});
