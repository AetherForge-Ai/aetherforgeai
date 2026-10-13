import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SHIPPED_EDGE, featuresIgnoreFuture, fitHmm, formatEdgeMarkdown, parseContextCsv, runEdgeStudy } from "@/lib/bot-edge";
import { parseClosesCsv, type DailyBar } from "@/lib/bot-eval";

function bars(symbol: string, market: DailyBar["market"], n: number): DailyBar[] {
  const out: DailyBar[] = [];
  let price = 100;
  for (let i = 0; i < n; i++) {
    price *= 1 + (((i * 17) % 11) - 5) / 200;
    const day = new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10);
    out.push({ symbol, market, date: day, close: price, volume: 1000 + i });
  }
  return out;
}

describe("round-2 edge check", () => {
  it("does not let a later close change features", () => {
    expect(featuresIgnoreFuture(bars("TEST.AX", "ASX", 90))).toBe(true);
  });

  it("separates a calm regime from a noisy one", () => {
    const values: number[] = [];
    for (let block = 0; block < 6; block++) {
      const calm = block % 2 === 0;
      for (let step = 0; step < 40; step++) {
        values.push(calm ? 0.002 : -0.004 + ((step % 5) - 2) * 0.01);
      }
    }
    const model = fitHmm(values);
    expect(model).not.toBeNull();
    expect(Math.abs(model!.mu[0] - model!.mu[1])).toBeGreaterThan(0.002);
  });

  it(
    "keeps only a rule that beats the current model on the later window",
    () => {
      const closes = readFileSync(path.join(process.cwd(), "docs/backtest/closes.csv"), "utf8");
      const context = readFileSync(path.join(process.cwd(), "docs/backtest/context.csv"), "utf8");
      const study = runEdgeStudy(parseClosesCsv(closes), parseContextCsv(context));
      writeFileSync(path.join(process.cwd(), "docs/ai-bots-edge.md"), formatEdgeMarkdown(study));
      expect(study.testFrom).toBe("2024-10-24");
      expect(study.stox.currentTest.meanStrategyReturnPct).toBeCloseTo(study.stox.before.meanStrategyReturnPct ?? 0, 2);
      expect(study.koins.currentTest.meanStrategyReturnPct).toBeCloseTo(study.koins.before.meanStrategyReturnPct ?? 0, 2);
      expect(study.stox.shippedName).toBe(SHIPPED_EDGE.stox);
      expect(study.koins.shippedName).toBe(SHIPPED_EDGE.koins);
      expect(study.stox.shippedRange).toBe(SHIPPED_EDGE.stoxRange);
      expect(study.koins.shippedRange).toBe(SHIPPED_EDGE.koinsRange);
      const markdown = formatEdgeMarkdown(study);
      expect(markdown).not.toMatch(/\bGST\b/);
      expect(markdown).toContain("not a forecast");
      expect(markdown).toContain("BTC dominance history was not available");
      writeFileSync(path.join(process.cwd(), "docs/ai-bots-edge.md"), markdown);
      expect(readFileSync(path.join(process.cwd(), "docs/ai-bots-edge.md"), "utf8")).toContain(study.testFrom);
    },
    120_000
  );
});
