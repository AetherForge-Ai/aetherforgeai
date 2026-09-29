import { describe, expect, it } from "vitest";
import {
  mergeSevenDayChanges,
  resolveSevenDayChange,
  sevenDayBoardIsMissing,
  sevenDayReturnPct,
} from "@/lib/crypto-market";

describe("7-day crypto change", () => {
  it("computes a sparkline return and treats a flat series as zero", () => {
    expect(sevenDayReturnPct([100, 110])).toBeCloseTo(10);
    expect(sevenDayReturnPct([100, 100])).toBe(0);
    expect(sevenDayReturnPct([100])).toBeNull();
    expect(sevenDayReturnPct(null)).toBeNull();
  });

  it("does not treat a placeholder 0 with no sparkline as a real week", () => {
    expect(resolveSevenDayChange(0, null)).toBeNull();
    expect(resolveSevenDayChange(0, [])).toBeNull();
    expect(resolveSevenDayChange(3.25, null)).toBe(3.25);
    expect(resolveSevenDayChange(0, [100, 107])).toBeCloseTo(7);
  });

  it("flags a board of zeros and fills it from a second feed", () => {
    const board = ["BTC", "ETH", "SOL", "GALA", "SKL"].map((symbol) => ({
      symbol,
      change7d: 0,
      sparkline7d: [] as number[],
    }));
    expect(sevenDayBoardIsMissing(board)).toBe(true);
    const merged = mergeSevenDayChanges(board, [
      { symbol: "btc", change7d: 0, sparkline7d: [100, 104] },
      { symbol: "ETH", change7d: -2.5, sparkline7d: null },
      { symbol: "SOL", change7d: 0, sparkline7d: [] },
    ]);
    expect(merged.find((c) => c.symbol === "BTC")?.change7d).toBeCloseTo(4);
    expect(merged.find((c) => c.symbol === "ETH")?.change7d).toBe(-2.5);
    expect(merged.find((c) => c.symbol === "SOL")?.change7d).toBe(0);
    expect(resolveSevenDayChange(merged.find((c) => c.symbol === "SOL")?.change7d, merged.find((c) => c.symbol === "SOL")?.sparkline7d)).toBeNull();
  });
});
