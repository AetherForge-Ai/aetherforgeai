import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { buildDemoReport, buildLiveReport, ILLUSTRATIVE_DEMO_LABEL } from "@/lib/apex";
import { buildIntelligenceBriefing } from "@/lib/briefing";
import { coinToIntel } from "@/lib/koins-market";
import {
  ANALYSIS_UNAVAILABLE,
  analyzeSecurity,
  analyzeUniverse,
  getProjectionLeaders,
  NOT_ENOUGH_DAILY_HISTORY,
} from "@/lib/market-intel";
import { modelViewSentence } from "@/lib/headmaster-trust";
import { summariseReport } from "@/lib/totalum-service";
import type { ApexReport } from "@/lib/apex";
import type { CoinMarket } from "@/lib/crypto-market";
import { renderReportHtml } from "@/lib/report-html";

function closes(start = 10): number[] {
  return Array.from({ length: 45 }, (_, index) => start + index * 0.1);
}

function coin(partial: Partial<CoinMarket> = {}): CoinMarket {
  return {
    id: "zzz",
    symbol: "ZZZ",
    name: "Zed",
    image: "",
    rank: 1,
    price: 2,
    marketCap: 1,
    fdv: null,
    volume24h: 1,
    change1h: 0,
    change24h: 1.25,
    change7d: 3.5,
    high24h: null,
    low24h: null,
    circulatingSupply: null,
    totalSupply: null,
    maxSupply: null,
    ath: null,
    athDate: null,
    atl: null,
    atlDate: null,
    sparkline7d: [],
    ...partial,
  };
}

describe("live reports do not use a seeded walk", () => {
  it("keeps hashSeed and mulberry32 out of the live market engine", () => {
    const engine = readFileSync("src/lib/market-intel.ts", "utf8");
    expect(engine).not.toMatch(/hashSeed|mulberry32/);
    const live = readFileSync("src/lib/apex.ts", "utf8");
    const body = live.slice(live.indexOf("export function buildLiveReport"));
    expect(body).not.toMatch(/synthesizeTicker/);
    expect(body).not.toMatch(/mulberry32/);
  });

  it("holds a ticker with no daily history instead of printing a walk", () => {
    const bare = analyzeSecurity("GXH.NZ", 1.23);
    const other = analyzeSecurity("PANW", 1.23);
    expect(bare.analysisHold).toBe(NOT_ENOUGH_DAILY_HISTORY);
    expect(bare.price).toBe(1.23);
    expect(bare.publishedChanges).toEqual([]);
    expect(bare.history).toEqual([]);
    expect(bare.projection).toEqual([]);
    expect(bare.change1d).toBe(0);
    expect(bare.change7d).toBe(0);
    expect(bare.change30d).toBe(0);
    expect(bare.projected7dPct).toBe(0);
    expect(bare.rsi).toBe(0);
    expect(bare.outlook.base.probability).toBe(0);
    expect(bare.change7d).toBe(other.change7d);
    expect(bare.projected7dPct).toBe(other.projected7dPct);
    expect(getProjectionLeaders(10, [bare, other])).toEqual([]);
    expect(analyzeUniverse()).toEqual([]);
  });

  it("ranks a name only from a real series", () => {
    const series = closes(20);
    const row = analyzeSecurity("BHP.AX", series[series.length - 1], "BHP Group", "ASX", series);
    expect(row.analysisHold).toBeFalsy();
    expect(row.publishedChanges).toEqual(["1d", "7d", "30d"]);
    expect(getProjectionLeaders(5, [row]).map((item) => item.ticker)).toEqual(["BHP.AX"]);
    const short = analyzeSecurity("BHP.AX", 40, "BHP Group", "ASX", series.slice(0, 10));
    expect(short.analysisHold).toBe(NOT_ENOUGH_DAILY_HISTORY);
  });

  it("keeps a live Stox card free of a seeded pathway", () => {
    const report = buildLiveReport("stock", [{ ticker: "GXH.NZ", name: "Green Cross Health", price: 1.23, shares: 10 }]);
    expect(report.isDemo).toBe(false);
    expect(report.generatedLabel).toBe("Live report");
    expect(report.tickers[0]?.note).toBe(ANALYSIS_UNAVAILABLE);
    expect(report.tickers[0]?.shortTerm).toEqual([]);
    expect(report.tickers[0]?.pathways).toEqual([]);
    expect(report.directRecommendations[0]?.analysisHold).toBe(NOT_ENOUGH_DAILY_HISTORY);
    expect(JSON.stringify(report.tickers)).not.toMatch(/Range-bound consolidation/);
    const html = renderReportHtml(report, { generatedAtLabel: "12 Oct 2026" });
    expect(html).toContain(ANALYSIS_UNAVAILABLE);
    expect(html).toContain("Not enough daily history");
    expect(html).not.toContain(ILLUSTRATIVE_DEMO_LABEL);
  });

  it("labels the public demo and keeps that label off the live report", () => {
    const demo = buildDemoReport("stock");
    expect(demo.isDemo).toBe(true);
    expect(demo.generatedLabel).toBe(ILLUSTRATIVE_DEMO_LABEL);
    const html = renderReportHtml(demo, { generatedAtLabel: "12 Oct 2026" });
    expect(html).toContain(ILLUSTRATIVE_DEMO_LABEL);
    const live = buildLiveReport("stock", []);
    expect(live.isDemo).toBe(false);
    expect(renderReportHtml(live, { generatedAtLabel: "12 Oct 2026" })).not.toContain(ILLUSTRATIVE_DEMO_LABEL);
  });
});

describe("Koins publishes no forward outlook", () => {
  it("keeps the real 24h and 7d changes and holds technicals without a series", () => {
    const row = coinToIntel(coin());
    expect(row.forwardOmitted).toBe(true);
    expect(row.analysisHold).toBe(NOT_ENOUGH_DAILY_HISTORY);
    expect(row.change1d).toBe(1.25);
    expect(row.change7d).toBe(3.5);
    expect(row.publishedChanges).toEqual(["1d", "7d"]);
    expect(row.projected7dPct).toBe(0);
    expect(row.confidence).toBe(0);
    expect(row.projection).toEqual([]);
    expect(row.outlook.bull.probability).toBe(0);
    expect(row.outlook.base.probability).toBe(0);
    expect(row.outlook.bear.probability).toBe(0);
    expect(row.convictionReason).toBe("");
    const report = buildLiveReport("crypto", [{ ticker: "ZZZ", name: "Zed", price: 2 }], {
      universeIntel: [row],
      holdingIntel: [row],
    });
    expect(report.tickers[0]?.changePct).toBe(1.25);
    expect(report.tickers[0]?.changeWithheld).toBe(false);
    expect(report.tickers[0]?.shortTerm).toEqual([]);
    expect(report.tickers[0]?.pathways).toEqual([]);
    expect(report.tickers[0]?.note).toContain(NOT_ENOUGH_DAILY_HISTORY);
    expect(report.tickers[0]?.note).not.toMatch(/RSI|MACD/);
    expect(report.directRecommendations[0]?.detail).toContain("+1.25%");
    expect(report.directRecommendations[0]?.detail).toContain("+3.50%");
    expect(report.directRecommendations[0]?.detail).not.toMatch(/RSI|MACD|\bodds\b|\bbull\b|\bbear\b/i);
    expect(report.projectionLeaders).toEqual([]);
  });

  it("holds technicals when the only series is an hourly sparkline", () => {
    const spark = closes(1);
    const row = coinToIntel(
      coin({ sparkline7d: spark, change24h: 4.2, change7d: -1.1, moves: { h24: 4.2, d7: -1.1, d30: null } })
    );
    expect(spark.length).toBeGreaterThanOrEqual(40);
    expect(row.analysisHold).toBe(NOT_ENOUGH_DAILY_HISTORY);
    expect(row.rsi).toBe(0);
    expect(row.forwardOmitted).toBe(true);
    expect(row.change1d).toBe(4.2);
    expect(row.change7d).toBe(-1.1);
    expect(row.publishedChanges).toEqual(["1d", "7d"]);
  });

  it("computes RSI from daily closes and still omits the outlook", () => {
    const daily = closes(1);
    const row = coinToIntel(
      coin({ sparkline7d: closes(3), change24h: 4.2, change7d: -1.1, moves: { h24: 4.2, d7: -1.1, d30: null } }),
      daily
    );
    expect(row.analysisHold).toBeNull();
    expect(row.rsi).not.toBe(0);
    expect(row.forwardOmitted).toBe(true);
    expect(row.projected7dPct).toBe(0);
    expect(row.change1d).toBe(4.2);
    expect(row.change7d).toBe(-1.1);
    expect(coinToIntel(coin(), daily.slice(0, 39)).analysisHold).toBe(NOT_ENOUGH_DAILY_HISTORY);
    const report = buildLiveReport("crypto", [{ ticker: "ZZZ", name: "Zed", price: 2 }], {
      universeIntel: [row],
      holdingIntel: [row],
    });
    expect(report.projectionLeaders).toEqual([]);
    expect(report.tickers[0]?.shortTerm).toEqual([]);
    expect(report.tickers[0]?.pathways).toEqual([]);
    expect(report.tickers[0]?.note).toContain("No 7-day projection is published.");
    expect(report.tickers[0]?.note).not.toMatch(/\bodds\b|\bbull\b|\bbear\b|conviction/i);
  });
});

describe("report HTML technicals", () => {
  function table(html: string): string {
    const start = html.indexOf("Technical indicators");
    const end = html.indexOf("Per-");
    return html.slice(start, end === -1 ? undefined : end);
  }

  it("does not print a zero projection or RSI for a held Stox row or a paused Koins row", () => {
    const held = analyzeSecurity("GXH.NZ", 1.23, "Green Cross", "NZX");
    const stock = buildLiveReport("stock", [{ ticker: "GXH.NZ", name: "Green Cross", price: 1.23 }], {
      holdingIntel: [held],
    });
    const stockTable = table(renderReportHtml(stock, { generatedAtLabel: "12 Oct 2026", technicals: [held] }));
    expect(stockTable).toContain(NOT_ENOUGH_DAILY_HISTORY);
    expect(stockTable).not.toContain("+0.00% (0%)");
    expect(stockTable).not.toContain("0.00% (0%)");
    expect(stockTable).not.toContain("RSI 0");
    expect(stockTable).not.toMatch(/>0</);

    const paused = coinToIntel(coin(), closes(2));
    const heldCoin = coinToIntel(coin());
    const koins = buildLiveReport("crypto", [{ ticker: "ZZZ", name: "Zed", price: 2 }], {
      universeIntel: [paused, heldCoin],
      holdingIntel: [paused],
    });
    const koinsTable = table(renderReportHtml(koins, { generatedAtLabel: "12 Oct 2026", technicals: [paused, heldCoin] }));
    expect(koinsTable.startsWith("Technical indicators")).toBe(true);
    expect(koinsTable).not.toContain("7-day projection");
    expect(koinsTable).toContain("— Crypto projections are paused");
    expect(koinsTable).toContain(NOT_ENOUGH_DAILY_HISTORY);
    expect(koinsTable).not.toContain("+0.00% (0%)");
    expect(koinsTable).not.toContain("0.00% (0%)");
    expect(koinsTable).not.toContain("RSI 0");
    expect(koinsTable).not.toMatch(/\(\d+%\)/);
    expect(koinsTable).not.toMatch(/>Buy<|>Sell<|>Hold<|>Reduce<|>Strong Buy</);
  });
});

describe("briefing volatility", () => {
  const sentiment = { label: "Neutral" as const, score: 50, bullish: 0, bearish: 0, neutral: 0, method: "keyword" as const, headlines: [] };

  it("skips the 7-day swing sentence for crypto and averages only a real daily series", () => {
    const daily = analyzeSecurity("BHP.AX", 40, "BHP", "ASX", closes(20));
    const held = analyzeSecurity("GXH.NZ", 1.2, "Green Cross", "NZX");
    const stock = buildIntelligenceBriefing({
      bot: "stock",
      marketLabel: "Equities",
      technicals: [daily, held],
      events: [],
      sentiment,
    });
    const stockText = stock.keyObservations.join(" ");
    expect(stockText).toContain(`realised vol ${daily.realizedVolPct.toFixed(2)}%`);
    expect(stockText).toContain("7-day 1σ swings");
    expect(stockText).not.toContain("realised vol 0.00%");

    const paused = { ...daily, forwardOmitted: true as const };
    const mixed = buildIntelligenceBriefing({
      bot: "stock",
      marketLabel: "Equities",
      technicals: [paused],
      events: [],
      sentiment,
    });
    expect(mixed.keyObservations.join(" ")).not.toContain("1σ");
    expect(mixed.keyObservations.join(" ")).toContain(`realised vol ${daily.realizedVolPct.toFixed(2)}%`);

    const coinRow = coinToIntel(coin({ sparkline7d: closes(1) }), closes(4));
    const crypto = buildIntelligenceBriefing({
      bot: "crypto",
      marketLabel: "Crypto",
      technicals: [coinRow, coinToIntel(coin())],
      events: [],
      sentiment,
    });
    const cryptoText = crypto.keyObservations.join(" ");
    expect(cryptoText).not.toContain("1σ");
    expect(cryptoText).toContain(`realised vol ${coinRow.realizedVolPct.toFixed(2)}%`);
  });
});

describe("Headmaster", () => {
  it("calls expected return and volatility fixed planning assumptions", () => {
    expect(modelViewSentence(8, 12)).toBe(
      "Expected return (8.00%) and volatility (12.00%) are fixed long-run planning assumptions, not a forecast. Undeployed cash is not given a return."
    );
    expect(modelViewSentence(0, 0)).toBe("The model has no view.");
  });

  it("drops a no-history name from picks", () => {
    const report = {
      directRecommendations: [
        { ticker: "GXH.NZ", name: "Green Cross", action: "BUY", held: false, projected7dPct: 4, detail: "Buy", analysisHold: NOT_ENOUGH_DAILY_HISTORY },
        { ticker: "BHP.AX", name: "BHP", action: "BUY", held: false, projected7dPct: 1.2, detail: "Buy BHP" },
      ],
      notSized: [],
    } as unknown as ApexReport;
    const summary = summariseReport("stock", report, "12 Oct 2026");
    expect(summary.ideas.map((idea) => idea.ticker)).toEqual(["BHP.AX"]);
    expect(summary.qualifying).toBe(1);
  });
});
