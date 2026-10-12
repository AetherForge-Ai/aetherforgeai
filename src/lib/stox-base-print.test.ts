import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { buildLiveReport, type MarketMoversGroup } from "@/lib/apex";
import { applyKoinsSweeps, rankGainers, type KoinsCandidate } from "@/lib/koins-quality";
import { analyzeSecurity } from "@/lib/market-intel";
import { formatPercent } from "@/lib/portfolio";
import { renderReportHtml } from "@/lib/report-html";
import { reviewSessionMove, seriesWindowChangePct } from "@/lib/quote-review";

/**
 * Yahoo Finance spark closes for 12 Oct 2026, plus chart adjusted closes where
 * the chart payload included them. The implausible Stox percents are the seeded
 * walk the report used when this series was missing.
 */
const fixture = JSON.parse(readFileSync("src/lib/fixtures/stox-base-prints-2026-10-12.json", "utf8")) as {
  names: Record<string, { closes: number[]; adjusted?: number[]; chartCloses?: number[]; chartPreviousClose?: number | null }>;
};

const BAD_WEEK: Record<string, number> = {
  "GXH.NZ": 33.48,
  "CNU.NZ": 20.61,
  "TRA.NZ": 19.26,
  "AD8.AX": 60.58,
  "AIA.AX": 58.96,
  "FLT.AX": 40.78,
  "AMC.AX": 38.27,
  "PANW": 48.81,
  "PAYX": 23.12,
  "MDLZ": 50.64,
};

const BAD_MONTH: Record<string, number> = {
  "AIA.AX": 68.28,
  "AD8.AX": 66.01,
  "AMC.AX": 53.34,
  "MDLZ": 48.78,
};

const NORMAL = ["BHP.AX", "CBA.AX", "WBC.AX", "ZIP.AX", "MAH.AX", "STO.AX", "AAPL", "AIR.NZ", "FPH.NZ"];

function closesOf(ticker: string): number[] {
  return fixture.names[ticker].closes;
}

function realRow(ticker: string) {
  return analyzeSecurity(ticker, undefined, undefined, undefined, closesOf(ticker));
}

function windowOf(groups: MarketMoversGroup[], market: string, label: string) {
  return groups.find((group) => group.market === market)?.windows.find((window) => window.window === label);
}

describe("Stox base print", () => {
  it("keeps an in-band week when no series is supplied, and holds it when the daily series disagrees", () => {
    const open = reviewSessionMove({
      ticker: "PAYX",
      assetClass: "stock",
      market: "US",
      currency: "USD",
      price: 104.64,
      reportedChangePct: 23.12,
      window: "7d",
      dailyVolPct: 2.5,
    });
    expect(open.withheld).toBe(false);

    const payx = realRow("PAYX");
    const held = reviewSessionMove({
      ticker: "PAYX",
      assetClass: "stock",
      market: "US",
      currency: "USD",
      price: payx.price,
      reportedChangePct: 23.12,
      window: "7d",
      dailyCloses: closesOf("PAYX"),
      dailyVolPct: payx.dailyVolPct,
    });
    expect(held.withheld).toBe(true);
    expect(held.reason).toBe("base print does not match the daily series");
    expect(held.display).toBe("data under review");

    const kept = reviewSessionMove({
      ticker: "PAYX",
      assetClass: "stock",
      market: "US",
      currency: "USD",
      price: payx.price,
      reportedChangePct: payx.change7d,
      window: "7d",
      dailyCloses: closesOf("PAYX"),
      dailyVolPct: payx.dailyVolPct,
    });
    expect(kept.withheld).toBe(false);
    expect(seriesWindowChangePct(closesOf("PAYX"), payx.price, "7d")).toBe(payx.change7d);
    expect(formatPercent(payx.change7d)).toBe("+3.77%");
  });

  it("holds a missing base and a raw base that does not match the adjusted close", () => {
    expect(
      reviewSessionMove({
        ticker: "GXH.NZ",
        assetClass: "stock",
        market: "NZX",
        currency: "NZD",
        price: 1.945,
        reportedChangePct: 33.48,
        window: "7d",
        dailyCloses: [],
      }).reason
    ).toBe("base print is missing from the daily series");

    const panw = realRow("PANW");
    const raw = closesOf("PANW").slice();
    const badBase = fixture.names.PANW.chartPreviousClose;
    expect(badBase).toBe(155.73);
    raw[raw.length - 1 - 7] = badBase as number;
    const broken = reviewSessionMove({
      ticker: "PANW",
      assetClass: "stock",
      market: "US",
      currency: "USD",
      price: panw.price,
      reportedChangePct: seriesWindowChangePct(raw, panw.price, "7d") as number,
      window: "7d",
      dailyCloses: raw,
      adjustedCloses: closesOf("PANW"),
    });
    expect(broken.withheld).toBe(true);
    expect(broken.reason).toBe("base print does not match the adjusted close");

    const adjusted = reviewSessionMove({
      ticker: "PANW",
      assetClass: "stock",
      market: "US",
      currency: "USD",
      price: panw.price,
      reportedChangePct: panw.change7d,
      window: "7d",
      dailyCloses: raw,
      adjustedCloses: closesOf("PANW"),
    });
    expect(adjusted.withheld).toBe(false);

    const cnuCloses = fixture.names["CNU.NZ"].chartCloses as number[];
    const cnuAdj = fixture.names["CNU.NZ"].adjusted as number[];
    const cnuPrice = cnuCloses[cnuCloses.length - 1];
    const cnuMonth = seriesWindowChangePct(cnuCloses, cnuPrice, "30d") as number;
    expect(
      reviewSessionMove({
        ticker: "CNU.NZ",
        assetClass: "stock",
        market: "NZX",
        currency: "NZD",
        price: cnuPrice,
        reportedChangePct: cnuMonth,
        window: "30d",
        dailyCloses: cnuCloses,
        adjustedCloses: cnuAdj,
      }).withheld
    ).toBe(false);
  });

  it("holds the seeded 7-day and month prints and still ranks prints that match the daily series", () => {
    const badNames = Object.keys(BAD_WEEK);
    const rows = [...badNames, ...NORMAL].map((ticker) => {
      const row = realRow(ticker);
      return {
        ...row,
        change7d: BAD_WEEK[ticker] ?? row.change7d,
        change30d: BAD_MONTH[ticker] ?? row.change30d,
      };
    });
    const dailyCloses = Object.fromEntries(rows.map((row) => [row.ticker.toUpperCase(), closesOf(row.ticker)]));
    const changePct = Object.fromEntries(rows.map((row) => [row.ticker.toUpperCase(), row.change1d]));
    const report = buildLiveReport("stock", [], {
      universeIntel: rows,
      marketsCrossCheck: { changePct, dailyCloses, requireDailySeries: true },
    });

    const aia = realRow("AIA.AX");
    expect(aia.change1d).toBe(0.9);
    expect(aia.change7d).toBe(-0.74);
    expect(realRow("AMC.AX").change1d).toBe(-1.24);
    expect(realRow("AD8.AX").change1d).toBe(-1.86);

    for (const [market, names] of [
      ["NZX", ["GXH.NZ", "CNU.NZ", "TRA.NZ"]],
      ["ASX", ["AD8.AX", "AIA.AX", "FLT.AX", "AMC.AX"]],
      ["US", ["PANW", "PAYX"]],
    ] as const) {
      const week = windowOf(report.marketMovers, market, "Last 7 days");
      const ranked = week?.movers.map((row) => row.ticker) ?? [];
      const held = week?.underReview.map((row) => row.ticker) ?? [];
      for (const ticker of names) {
        expect(ranked, ticker).not.toContain(ticker);
        expect(held, ticker).toContain(ticker);
      }
    }

    const asxMonth = windowOf(report.marketMovers, "ASX", "Last month");
    for (const ticker of ["AIA.AX", "AD8.AX", "AMC.AX"]) {
      expect(asxMonth?.movers.map((row) => row.ticker)).not.toContain(ticker);
      expect(asxMonth?.underReview.map((row) => row.ticker)).toContain(ticker);
    }

    const asxWeek = windowOf(report.marketMovers, "ASX", "Last 7 days");
    const usWeek = windowOf(report.marketMovers, "US", "Last 7 days");
    const nzxWeek = windowOf(report.marketMovers, "NZX", "Last 7 days");
    expect(asxWeek?.movers.map((row) => row.ticker)).toEqual(expect.arrayContaining(["BHP.AX", "ZIP.AX", "MAH.AX", "STO.AX"]));
    expect(usWeek?.movers.map((row) => row.ticker)).toContain("AAPL");
    expect(nzxWeek?.movers.map((row) => row.ticker)).toEqual(expect.arrayContaining(["AIR.NZ", "FPH.NZ"]));
    expect(asxWeek?.movers.find((row) => row.ticker === "ZIP.AX")?.changePct).toBe(14.29);
    expect(formatPercent(14.29)).toBe("+14.29%");

    const usDay = windowOf(report.marketMovers, "US", "Last 24 hours");
    const usMonth = windowOf(report.marketMovers, "US", "Last month");
    expect(usDay?.movers.find((row) => row.ticker === "MDLZ")?.changePct).toBe(2.28);
    expect(usDay?.underReview.map((row) => row.ticker) ?? []).not.toContain("MDLZ");
    expect(usWeek?.underReview.map((row) => row.ticker)).toContain("MDLZ");
    expect(usMonth?.underReview.map((row) => row.ticker)).toContain("MDLZ");
    expect(usWeek?.movers.map((row) => row.ticker)).not.toContain("MDLZ");
  });

  it("reads MAH's projection from MAH's series and ZIP's session from ZIP's series", () => {
    const mahReal = realRow("MAH.AX");
    const zipReal = realRow("ZIP.AX");
    const mahSeed = analyzeSecurity("MAH.AX", mahReal.price);
    const zipSeed = analyzeSecurity("ZIP.AX", zipReal.price);
    expect(mahSeed.projected7dPct).toBe(5.56);
    expect(zipSeed.change1d).toBe(-13.9);
    expect(zipReal.change1d).toBe(5.56);
    expect(mahReal.projected7dPct).not.toBe(zipReal.change1d);
    expect(mahSeed.projected7dPct).not.toBe(zipSeed.change1d);

    const report = buildLiveReport("stock", [], {
      universeIntel: [mahReal, zipReal],
      marketsCrossCheck: {
        changePct: { "MAH.AX": mahReal.change1d, "ZIP.AX": zipReal.change1d },
        dailyCloses: { "MAH.AX": closesOf("MAH.AX"), "ZIP.AX": closesOf("ZIP.AX") },
      },
    });
    const mah = report.projectionLeaders.find((row) => row.ticker === "MAH.AX");
    const zip = report.projectionLeaders.find((row) => row.ticker === "ZIP.AX");
    expect(mah?.projected7dPct).toBe(mahReal.projected7dPct);
    expect(zip?.projected7dPct).toBe(zipReal.projected7dPct);
    expect(mah?.projected7dPct).not.toBe(zipReal.change1d);
    expect(formatPercent(mahReal.projected7dPct)).toMatch(/^[+-]\d+\.\d{2}%$/);
  });
});

describe("Koins held names", () => {
  it("lists the held symbols on the 7-day window", () => {
    const coin = (symbol: string, d7: number): KoinsCandidate => ({
      symbol,
      name: symbol,
      price: 1,
      moves: { h24: 1, d7, d30: 1 },
    });
    const candidates = [
      coin("QRL", 48.31),
      coin("W", 46.67),
      coin("RLC", 40),
      ...Array.from({ length: 12 }, (_, index) => coin(`C${index}`, 0.4 + index * 0.05)),
    ];
    const ranked = rankGainers(candidates, "7d");
    expect(ranked.held.map((row) => row.ticker)).toEqual(expect.arrayContaining(["QRL", "W", "RLC"]));
    expect(ranked.movers.map((row) => row.ticker)).not.toEqual(expect.arrayContaining(["QRL", "W", "RLC"]));

    const report = applyKoinsSweeps(
      {
        bot: "crypto",
        title: "Koins",
        marketLabel: "Digital assets",
        generatedLabel: "Live report",
        isDemo: false,
        engine: "intelligent AI bot named Koins",
        executiveSummary: "Tape.",
        topGainers: [],
        keyObservations: [],
        newsSynthesis: [],
        tickers: [],
        marketMovers: [{ market: "CRYPTO", label: "Crypto", windows: [] }],
        projectionLeaders: [],
        directRecommendations: [],
        pathwayPlan: { pathways: [], recommendedName: "", recommendationNote: "" },
      },
      { at: "2026-10-12T03:05:00.000Z", candidates, projections: [] },
      Date.parse("2026-10-12T03:06:00.000Z")
    );
    const week = report.marketMovers[0].windows.find((row) => row.window === "Last 7 days");
    expect(week?.underReview.map((row) => row.ticker)).toEqual(["QRL", "RLC", "W"]);
    expect(week?.reviewNote).toContain("prints under review");
    const html = renderReportHtml(report, { generatedAtLabel: "12 Oct 2026" });
    expect(html).toContain("QRL — print under review");
    expect(html).toContain("W — print under review");
    expect(html).not.toContain("+48.31%");
  });
});
