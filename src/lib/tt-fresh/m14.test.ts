import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { cryptoFreshnessLabel } from "@/lib/market-freshness";
import { fmtPrice, dailyAxisTicks } from "@/lib/crypto-market";

describe("TT fresh M14 — freshness, US$ and axis", () => {
  it("a 2-hour-old crypto print says Delayed", () => {
    const now = new Date("2026-10-14T07:30:00Z");
    expect(cryptoFreshnessLabel(new Date("2026-10-14T05:38:00Z"), now).label).toMatch(/^Delayed · updated/);
  });
  it("coin prices carry US$", () => {
    expect(fmtPrice(83592)).toBe("US$83,592.00");
  });
  it("daily ticks never repeat a day", () => {
    const start = Date.UTC(2026, 9, 8, 13);
    const ticks = dailyAxisTicks(start, start + 7 * 86_400_000);
    const days = ticks.map((t) => new Date(t).toISOString().slice(0, 10));
    expect(new Set(days).size).toBe(days.length);
  });
  it("ticker drops chips without a price", () => {
    expect(readFileSync("src/components/MarketTicker.tsx", "utf8")).toContain("quotes = quotes.filter((q) => Number.isFinite(q.price) && q.price > 0);");
  });
});
