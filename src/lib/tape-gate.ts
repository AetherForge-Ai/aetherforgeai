/**
 * Turns a bad or missing tape into a Hold.
 * Without at least 40 real closes the engine would otherwise score a seeded
 * walk. That walk is not a market read, so the outlook is flattened.
 */

import type { OutlookCase, SecurityIntel } from "@/lib/market-intel";

export const TAPE_WITHHELD_REASON =
  "The daily tape is missing, stale, or the session percent is under review, so this report does not state a directional scenario.";

function flatCase(label: OutlookCase["label"], price: number, probability: number): OutlookCase {
  return { label, lowPct: 0, highPct: 0, lowPrice: price, highPrice: price, probability };
}

export function holdWithoutDirectionalScenario(row: SecurityIntel, verifiedHistory: boolean): SecurityIntel {
  const held: SecurityIntel = {
    ...row,
    score: 50,
    signal: "Hold",
    confidence: Math.min(row.confidence, 47),
    conviction: "Speculative",
    convictionReason: TAPE_WITHHELD_REASON,
    reasoning: TAPE_WITHHELD_REASON,
  };
  if (verifiedHistory) return held;
  const price = row.price;
  return {
    ...held,
    change1d: 0,
    change7d: 0,
    change30d: 0,
    projected7dPct: 0,
    rsi: 50,
    macd: 0,
    macdSignalLine: 0,
    macdHistogram: 0,
    macdSignal: "Neutral",
    bbPosition: 50,
    vsSma20: 0,
    vsSma50: 0,
    regime: "Range-Bound",
    projection: row.projection.map((point) => ({ ...point, price })),
    outlook: {
      horizonDays: 7,
      expectedPct: 0,
      sigma7Pct: 0,
      regime: "Range-Bound",
      base: flatCase("Base", price, 50),
      bull: flatCase("Bull", price, 25),
      bear: flatCase("Bear", price, 25),
    },
  };
}
