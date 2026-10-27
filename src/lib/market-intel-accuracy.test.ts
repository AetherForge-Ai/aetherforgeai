import { describe, expect, it } from "vitest";
import { analyzeSecurity } from "@/lib/market-intel";
import { projectionPointPct } from "@/lib/projection-figure";
import { labelIntel, signalFromScore } from "@/lib/security-signal";

function geometric(start: number, days: number, dailyPct: number): number[] {
  const out: number[] = [];
  let price = start;
  for (let i = 0; i < days; i++) {
    out.push(price);
    price *= 1 + dailyPct / 100;
  }
  return out;
}

/** Slow base, then a faster push, so the share MACD histogram is still rising. */
function sharePush(): number[] {
  const base = geometric(10, 50, 0.05);
  const last = base[base.length - 1];
  const push = geometric(last, 35, 0.7).slice(1);
  return [...base, ...push];
}

/**
 * A decline, then a wide chop that finishes just under both averages.
 * Volatility stays high without a deep slide (more than 6% under the 20-day average).
 */
function cryptoHotBelow(): number[] {
  const out: number[] = [];
  let price = 180;
  for (let i = 0; i < 45; i++) {
    price *= 0.992;
    out.push(price);
  }
  const center = price;
  for (let i = 0; i < 39; i++) {
    out.push(center * (1 + Math.sin(i / 1.1) * 0.12));
  }
  const sum19 = out.slice(-19).reduce((sum, value) => sum + value, 0);
  out.push(sum19 / (20 / 0.97 - 1));
  return out;
}

describe("Stox and Koins 7-day tilt", () => {
  it("treats the same return path the same at $2 and at $200", () => {
    const cheap = analyzeSecurity("CHEAP", undefined, "Cheap", "US", geometric(2, 80, 0.45));
    const rich = analyzeSecurity("RICH", undefined, "Rich", "US", geometric(200, 80, 0.45));
    expect(cheap.analysisHold).toBeFalsy();
    expect(cheap.score).toBe(rich.score);
    expect(cheap.projected7dPct).toBe(rich.projected7dPct);
    expect(cheap.macdSignal).toBe(rich.macdSignal);
    expect(cheap.confidence).toBe(rich.confidence);
  });

  it("keeps a steady share rise flat, and tilts only when the MACD histogram is bullish", () => {
    const steady = analyzeSecurity("UP.AX", undefined, "Up", "ASX", geometric(10, 80, 0.45));
    expect(steady.rsi).toBeGreaterThanOrEqual(70);
    expect(steady.macdSignal).not.toBe("Bullish");
    expect(steady.score).toBe(50);
    expect(steady.projected7dPct).toBe(0);

    const row = analyzeSecurity("PUSH.AX", undefined, "Push", "ASX", sharePush());
    expect(row.rsi).toBeGreaterThanOrEqual(70);
    expect(row.macdSignal).toBe("Bullish");
    expect(row.score).toBeGreaterThanOrEqual(58);
    expect(row.score).toBeLessThan(72);
    expect(row.projected7dPct).toBeGreaterThan(0);
    expect(row.projected7dPct).toBeLessThanOrEqual(2);
    expect(row.confidence).toBeLessThanOrEqual(74);
    expect(row.outlook.expectedPct).toBe(row.projected7dPct);
    expect(projectionPointPct(row.price, row.projection)).toBe(row.projected7dPct);
    expect(row.outlook.bull.probability + row.outlook.base.probability + row.outlook.bear.probability).toBe(100);
    expect(labelIntel(row).signal).toBe(signalFromScore(row.score));
    expect(row.reasoning).toMatch(/7-day tilt stays small/);
  });

  it("steps a washed-out share down without calling a collapse", () => {
    const row = analyzeSecurity("DOWN.NZ", undefined, "Down", "NZX", geometric(10, 80, -0.45));
    expect(row.rsi).toBeLessThanOrEqual(32);
    expect(row.score).toBeLessThanOrEqual(41);
    expect(row.score).toBeGreaterThanOrEqual(28);
    expect(row.projected7dPct).toBeLessThan(0);
    expect(row.projected7dPct).toBeGreaterThanOrEqual(-2);
    expect(row.reasoning).not.toMatch(/mean-reversion setup/i);
  });

  it("leaves a mixed share tape flat", () => {
    const mixed = Array.from({ length: 80 }, (_, index) => 50 + Math.sin(index / 2.2) * 0.8);
    const row = analyzeSecurity("MIX", undefined, "Mix", "US", mixed);
    expect(row.score).toBe(50);
    expect(row.projected7dPct).toBe(0);
    expect(Math.abs(row.outlook.bull.probability - 25)).toBeLessThanOrEqual(2);
  });

  it("rates an extended calm crypto rally above a smooth slide, inside a 6% tilt", () => {
    const rally = analyzeSecurity("BTC", undefined, "Bitcoin", "CRYPTO", geometric(100, 80, 1.8));
    const slide = analyzeSecurity("SLIDE", undefined, "Slide", "CRYPTO", geometric(100, 90, -0.7));
    const hot = analyzeSecurity("CHOP", undefined, "Chop", "CRYPTO", cryptoHotBelow());
    expect(rally.score).toBeGreaterThan(slide.score);
    expect(rally.score).toBeGreaterThanOrEqual(72);
    expect(rally.projected7dPct).toBeGreaterThan(0);
    expect(rally.projected7dPct).toBeLessThanOrEqual(6);
    expect(slide.score).toBe(50);
    expect(slide.projected7dPct).toBe(0);
    expect(hot.score).toBeLessThanOrEqual(41);
    expect(hot.score).toBeGreaterThanOrEqual(28);
    expect(hot.projected7dPct).toBeLessThan(0);
    expect(hot.projected7dPct).toBeGreaterThanOrEqual(-6);
    expect(rally.confidence).toBeLessThanOrEqual(74);
    expect(hot.confidence).toBeLessThanOrEqual(74);
    expect(rally.reasoning).toMatch(/7-day tilt stays small/);
    expect(hot.reasoning).toMatch(/volatility is elevated while price is below both averages/);
  });

  it("does not turn a one-week spike into a large share forecast", () => {
    const calm = geometric(40, 70, 0.05);
    const last = calm[calm.length - 1];
    const spike = [...calm];
    for (let day = 0; day < 8; day++) spike.push(last * Math.pow(1.08, day + 1));
    const row = analyzeSecurity("SPIKE", undefined, "Spike", "US", spike);
    expect(Math.abs(row.projected7dPct)).toBeLessThanOrEqual(2);
    expect(row.confidence).toBeLessThanOrEqual(74);
  });
});
