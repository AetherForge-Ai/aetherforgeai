import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseClosesCsv, type DailyBar } from "@/lib/bot-eval";
import {
  RESEARCH_STRATEGIES,
  SHIPPED_RESEARCH,
  TRIALS_PER_BOOK,
  deflatedSharpeRatio,
  normInv,
  parseYieldCsv,
  renderResearch,
  runResearch,
  weightsFromSnaps,
  weightsOnDate,
  type Snap,
} from "@/lib/bot-research";

function snap(partial: Partial<Snap> & Pick<Snap, "symbol">): Snap {
  return {
    market: "US",
    price: 10,
    r5: null,
    r21: null,
    r63: null,
    r252: null,
    r121: null,
    vol63: 0.2,
    vol252: 0.2,
    ...partial,
  };
}

function datedBars(symbol: string, closes: number[]): DailyBar[] {
  return closes.map((close, i) => {
    const date = new Date(Date.UTC(2023, 0, 1 + i)).toISOString().slice(0, 10);
    return { symbol, market: "US", date, close, volume: 1000 };
  });
}

describe("monthly research rules", () => {
  it("keeps the inverse normal near 1.96", () => {
    expect(normInv(0.975)).toBeGreaterThan(1.95);
    expect(normInv(0.975)).toBeLessThan(1.97);
  });

  it("lowers the deflated Sharpe when more rules were tried", () => {
    const returns = Array.from({ length: 250 }, (_, i) => (i % 5 === 0 ? -0.01 : 0.012));
    const one = deflatedSharpeRatio(returns, 1);
    const many = deflatedSharpeRatio(returns, 5000);
    expect(one).not.toBeNull();
    expect(many).not.toBeNull();
    expect(one!).toBeGreaterThan(0.95);
    expect(many!).toBeLessThan(one!);
  });

  it("pre-registers 18 rules and no more", () => {
    expect(RESEARCH_STRATEGIES).toHaveLength(TRIALS_PER_BOOK);
    expect(new Set(RESEARCH_STRATEGIES.map((row) => row.id)).size).toBe(TRIALS_PER_BOOK);
  });

  it("holds the top third on 12-1 momentum and stays in cash below 6 names", () => {
    const strategy = RESEARCH_STRATEGIES.find((row) => row.id === "csmom-12-1-m");
    expect(strategy).toBeTruthy();
    const snaps = Array.from({ length: 9 }, (_, i) => snap({ symbol: `S${i}`, r121: i / 100 }));
    const weights = weightsFromSnaps(strategy!, snaps);
    expect([...weights.keys()].sort()).toEqual(["S6", "S7", "S8"]);
    expect(weightsFromSnaps(strategy!, snaps.slice(0, 5)).size).toBe(0);
  });

  it("drops a downtrend and refuses leverage", () => {
    const strategy = RESEARCH_STRATEGIES.find((row) => row.id === "tsmom-252-m")!;
    const calm = weightsFromSnaps(strategy, [
      snap({ symbol: "UP", r252: 0.2, vol63: 0.2 }),
      snap({ symbol: "DOWN", r252: -0.2, vol63: 0.2 }),
    ]);
    expect(calm.get("DOWN")).toBeUndefined();
    expect(calm.get("UP")).toBeCloseTo(0.5);
    const hot = weightsFromSnaps(strategy, [
      snap({ symbol: "A", r252: 0.4, vol63: 0.05 }),
      snap({ symbol: "B", r252: 0.4, vol63: 0.05 }),
    ]);
    expect((hot.get("A") || 0) + (hot.get("B") || 0)).toBeCloseTo(1);
  });

  it("uses the 12-1 skip, so a last-month crash does not erase the prior year", () => {
    const closesFor = (mid: number, end: number) => {
      const closes = Array.from({ length: 260 }, (_, i) => 100 + Math.sin(i) );
      closes[7] = 100;
      closes[238] = mid;
      closes[259] = end;
      return closes;
    };
    const bars = [
      ...datedBars("WIN", closesFor(200, 80)),
      ..."ABCDE".split("").map((symbol) => datedBars(symbol, closesFor(110, 150))).flat(),
    ];
    const date = datedBars("WIN", closesFor(200, 80)).at(-1)!.date;
    const momentum = weightsOnDate(bars, "stox", "csmom-12-1-m", date);
    const trend = weightsOnDate(bars, "stox", "tsmom-252-m", date);
    expect(momentum.WIN).toBeGreaterThan(0);
    expect(trend.WIN).toBeUndefined();
  });

  it("does not let a future close change today's weight", () => {
    const bars = parseClosesCsv(readFileSync(path.join(process.cwd(), "docs/backtest/closes-r3.csv"), "utf8"));
    const before = weightsOnDate(bars, "stox", "tsmom-252-m", "2024-01-08");
    const spiked = bars.map((bar) => (bar.date > "2024-01-08" ? { ...bar, close: bar.close * 1.5 } : bar));
    const after = weightsOnDate(spiked, "stox", "tsmom-252-m", "2024-01-08");
    expect(Object.keys(before).length).toBeGreaterThan(0);
    expect(after).toEqual(before);
  });

  it("writes the research note and ships only what the held-out bar allows", () => {
    const bars = parseClosesCsv(readFileSync(path.join(process.cwd(), "docs/backtest/closes-r3.csv"), "utf8"));
    const yields = parseYieldCsv(readFileSync(path.join(process.cwd(), "docs/backtest/tbill.csv"), "utf8"));
    const report = runResearch(bars, yields);
    const markdown = renderResearch(report);
    writeFileSync(path.join(process.cwd(), "docs/ai-bots-research.md"), markdown);
    expect(report.shipped).toEqual(SHIPPED_RESEARCH);
    expect(markdown).toContain("2024");
    expect(markdown).toContain("Moskowitz");
    expect(markdown).toContain("Deflated Sharpe");
    expect(markdown).toContain("post-earnings");
    expect(report.universe.coins).toBeGreaterThanOrEqual(30);
    expect(report.universe.rejected).toEqual(["ARB-USD", "OP-USD", "TON-USD"]);
    expect(report.universe.etfs).toBe(16);
    expect(report.books.stox.strategies).toHaveLength(TRIALS_PER_BOOK);
    expect(report.books.koins.strategies).toHaveLength(TRIALS_PER_BOOK);
  }, 180000);
});
