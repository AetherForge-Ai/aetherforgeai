import { describe, expect, it } from "vitest";
import type { SecurityIntel } from "@/lib/market-intel";
import { holdWithoutDirectionalScenario, TAPE_WITHHELD_REASON } from "@/lib/tape-gate";

function row(): SecurityIntel {
  return {
    ticker: "RSG.AX",
    name: "Resolute Mining",
    sector: "Materials",
    market: "ASX",
    assetClass: "stock",
    currency: "AUD",
    price: 1.14,
    change1d: -32,
    change7d: 8,
    change30d: 4,
    history: [],
    projection: [{ label: "+1d", price: 1.4, projected: true }],
    projected7dPct: 12,
    confidence: 86,
    rsi: 71,
    macd: 0.2,
    macdSignalLine: 0.1,
    macdHistogram: 0.1,
    macdSignal: "Bullish",
    bbPosition: 90,
    sma20: 1,
    vsSma20: 14,
    sma50: 1,
    vsSma50: 14,
    atrPct: 3,
    realizedVolPct: 40,
    dailyVolPct: 2,
    regime: "Trending Up",
    support: 1,
    resistance: 1.3,
    pivot: 1.1,
    outlook: {
      horizonDays: 7,
      expectedPct: 12,
      sigma7Pct: 4,
      regime: "Trending Up",
      base: { label: "Base", lowPct: 8, highPct: 16, lowPrice: 1.23, highPrice: 1.32, probability: 50 },
      bull: { label: "Bull", lowPct: 16, highPct: 24, lowPrice: 1.32, highPrice: 1.41, probability: 25 },
      bear: { label: "Bear", lowPct: -4, highPct: 8, lowPrice: 1.09, highPrice: 1.23, probability: 25 },
    },
    signal: "Buy",
    score: 80,
    conviction: "High",
    convictionReason: "strong",
    reasoning: "seeded",
  };
}

describe("tape gate", () => {
  it("flattens a seeded outlook when the daily history is missing", () => {
    const held = holdWithoutDirectionalScenario(row(), false);
    expect(held.score).toBe(50);
    expect(held.signal).toBe("Hold");
    expect(held.projected7dPct).toBe(0);
    expect(held.outlook.expectedPct).toBe(0);
    expect(held.outlook.base.lowPct).toBe(0);
    expect(held.macdSignal).toBe("Neutral");
    expect(held.change1d).toBe(0);
    expect(held.reasoning).toBe(TAPE_WITHHELD_REASON);
    expect(held.reasoning).not.toMatch(/\bGST\b/);
  });

  it("keeps a real history outlook and still refuses the buy when the print is bad", () => {
    const held = holdWithoutDirectionalScenario(row(), true);
    expect(held.score).toBe(50);
    expect(held.signal).toBe("Hold");
    expect(held.projected7dPct).toBe(12);
    expect(held.macdSignal).toBe("Bullish");
    expect(held.confidence).toBeLessThan(48);
  });
});
