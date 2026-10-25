/**
 * Goal loop batch b13.
 * pull-check:v3-goal-b13-2026-10-18
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { neutraliseRatingWording } from "@/lib/report-copy";
import { bookPerformance } from "@/lib/performance-book";

const read = (p: string) => readFileSync(p, "utf8");

describe("b13 pins", () => {
  it("build version", () => {
    expect(read("public/build-version.txt").trim()).toMatch(/^v3-(?:goal|h1)-b(1[3-9]|[2-9][0-9])[a-z]?-/);
  });
});

describe("b13 H-12 directives", () => {
  it("HOLD tokens and directive sentences are neutral at view time", () => {
    const out = neutraliseRatingWording(
      "HOLD BTC. HOLD FPH.NZ. Do not deploy the full cash balance. New buys are limited to 2 names. ACCUMULATE FTNT. SELL AIR.NZ"
    );
    expect(out).not.toMatch(/\b(BUY|SELL|HOLD|ACCUMULATE|STRONG BUY)\b(?= [A-Z]{1,6}(\.[A-Z]{2})?\b)/);
    expect(out).not.toMatch(/\b(do not|don't) (deploy|buy|sell)\b|\bnew buys\b/i);
    expect(neutraliseRatingWording("Hold: data too old")).toBe("Hold: data too old");
  });
});

describe("b13 G-02 uses the snapshot deposit", () => {
  it("a NZ$10,000 deposit in snapshot shape is a cash flow", () => {
    const perf = bookPerformance({
      ledger: [{ id: "d1", type: "deposit", ticker: "", cashNzd: 10000, when: "2026-10-01" }] as never,
      netWorthNzd: 10024.09,
      asOf: "2026-10-18",
      source: "test",
    });
    expect(perf.flows).toBe(1);
    expect(perf.report).not.toBeNull();
  });
  it("opening cash counts; empty book asks for a deposit", () => {
    expect(bookPerformance({ ledger: [{ type: "opening_balance", ticker: "", cashNzd: 500, when: "2026-10-01" }] as never, netWorthNzd: 500, asOf: "2026-10-18", source: "t" }).flows).toBe(1);
    expect(bookPerformance({ ledger: [], netWorthNzd: 0, asOf: "2026-10-18", source: "t" }).message).toMatch(/Add a deposit/);
  });
});

describe("b13 M-6 / G-10 / H-4 / G-17 / CR-2", () => {
  it("source guards", async () => {
    const t = read("src/components/dashboard/UnifiedHoldingsTable.tsx");
    expect(t).toContain('column !== "qty" && column !== "price"');
    expect(t).toContain("Actions for ${row.ticker || row.name}");
    expect(read("src/components/dashboard/PortfolioDashboard.tsx")).toContain("current.ledger.filter((row) => row.id !== line.id)");
    expect(read("src/lib/dashboard-page.tsx")).toContain("initialQuota");
    expect(read("src/lib/crypto-board-store.ts")).toContain("SEED_INFLIGHT_MAX_MS");
    expect(read("src/lib/ip-rate-limit.ts")).toContain("X-RateLimit-Backends");
    const { isDuplicateOrTokenisedCoin } = await import("@/lib/coin-junk");
    expect(isDuplicateOrTokenisedCoin("tesla-coinbase-tokenized-stocks")).toBe(true);
    expect(isDuplicateOrTokenisedCoin("doge-pepe-3")).toBe(false);
  });
});
