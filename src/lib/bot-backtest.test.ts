import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { calibrationApplies, FROZEN_CALIBRATION } from "@/lib/bot-calibration";
import { KOINS_SCORECARD, STOX_SCORECARD } from "@/lib/bot-scorecard";
import { koinsModelV2Enabled } from "@/lib/koins-model-flag";
import { CRYPTO_PROJECTIONS_PAUSED } from "@/lib/projection-pause";
import {
  decisionIgnoresFuture,
  decisionsCsv,
  formatBacktestMarkdown,
  parseClosesCsv,
  runBacktest,
  type DailyBar,
} from "@/lib/bot-eval";

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

describe("walk-forward bot check", () => {
  it("keeps the coin model and crypto projections off unless the flag is on", () => {
    expect(CRYPTO_PROJECTIONS_PAUSED).toBe(true);
    expect(koinsModelV2Enabled({})).toBe(false);
    expect(koinsModelV2Enabled({ KOINS_MODEL_V2: "on" })).toBe(true);
    expect(calibrationApplies("stock", true)).toBe(true);
    expect(calibrationApplies("stock", false)).toBe(false);
    expect(calibrationApplies("crypto", true)).toBe(false);
  });

  it("does not let a later close change the decision", () => {
    expect(decisionIgnoresFuture(bars("TEST.AX", "ASX", 80))).toBe(true);
  });

  it(
    "measures the public daily sample without using the test window to choose the map",
    () => {
      const csv = readFileSync(path.join(process.cwd(), "docs/backtest/closes.csv"), "utf8");
      const report = runBacktest(parseClosesCsv(csv));
      expect(report.rows).toBeGreaterThan(500);
      expect(report.stox.testRaw.n).toBeGreaterThan(50);
      expect(report.koins.testRaw.n).toBeGreaterThan(20);
      expect(report.seal).toMatch(/^[a-f0-9]{64}$/);
      expect(report.calibration.enabled).toBe(FROZEN_CALIBRATION.enabled);
      expect(report.calibration.fitThrough).toBe(FROZEN_CALIBRATION.fitThrough);
      if (report.calibration.enabled) {
        expect(report.calibration.platt.a).toBeCloseTo(FROZEN_CALIBRATION.platt.a, 4);
        expect(report.calibration.platt.b).toBeCloseTo(FROZEN_CALIBRATION.platt.b, 4);
        expect(report.calibration.band.q25).toBeCloseTo(FROZEN_CALIBRATION.band.q25, 4);
        expect(report.calibration.band.q75).toBeCloseTo(FROZEN_CALIBRATION.band.q75, 4);
      }
      const markdown = formatBacktestMarkdown(report);
      expect(markdown).toContain(STOX_SCORECARD.testHitRate);
      expect(markdown).toContain(KOINS_SCORECARD.testHitRate);
      expect(markdown).toContain("not a forecast");
      expect(markdown).not.toMatch(/\bGST\b/);
      const docs = path.join(process.cwd(), "docs");
      writeFileSync(path.join(docs, "ai-bots-backtest.md"), markdown);
      writeFileSync(path.join(docs, "ai-bots-decisions.csv"), decisionsCsv(report));
      expect(readFileSync(path.join(docs, "ai-bots-backtest.md"), "utf8")).toContain(report.seal);
    },
    120_000
  );
});
