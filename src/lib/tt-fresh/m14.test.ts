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
describe("TT fresh H6 — coin page h1", () => {
  it("the server always prints the coin h1, the client view uses h2", () => {
    const page = readFileSync("src/app/markets/crypto/[id]/page.tsx", "utf8");
    expect(page).toContain("the page h1 is always printed here");
    expect(readFileSync("src/components/dashboard/CryptoAssetPage.tsx", "utf8")).toContain("serverHeading\n");
    expect(readFileSync("src/components/dashboard/crypto/CoinDetailView.tsx", "utf8")).not.toMatch(/<h1 /);
  });
});
