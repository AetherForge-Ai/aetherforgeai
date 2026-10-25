import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { benchmarkPeriodReturn, storedBenchmarks } from "@/lib/benchmark-history";
import { nzTaxYearEnding } from "@/lib/nz-tax-year";
import { dividendIncome, type DividendView } from "@/lib/dividend-ledger";

const read = (p: string) => readFileSync(p, "utf8");

describe("goal b16", () => {
  it("pins the build", () => expect(read("public/build-version.txt").trim()).toMatch(/^v3-(?:goal|h1)-b(1[6-9]|[2-9][0-9])[a-z]?-/));

  it("G-02: stored benchmark history has source and as-of", () => {
    const list = storedBenchmarks();
    expect(list.map((b) => b.id)).toEqual(["nzx50", "sp500nzd"]);
    for (const b of list) {
      expect(b.source).toMatch(/Yahoo Finance daily closes \(delayed public data\)/);
      expect(b.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(b.prices.length).toBeGreaterThan(1000);
    }
  });

  it("G-02: benchmark period returns match the independent golden file within 0.01%", () => {
    const rows = read("fixtures/benchmark-periods.expected.csv").split("\n").filter((l) => l && !l.startsWith("#")).slice(1);
    const byId = new Map(storedBenchmarks().map((b) => [b.id, b]));
    for (const line of rows) {
      const [id, period, start, value] = line.split(",");
      const got = benchmarkPeriodReturn(byId.get(id as never)!, period as never, "2026-10-18", period === "since" ? start : null);
      expect(Math.abs((got.value! - Number(value)) / Number(value))).toBeLessThan(0.0001);
    }
  });

  it("G-01: 31 Mar is the old tax year and 1 Apr the new one", () => {
    expect(nzTaxYearEnding("2026-03-31")).toBe(2026);
    expect(nzTaxYearEnding("2026-04-01")).toBe(2027);
    const row = (id: string, when: string, cash: number): DividendView => ({ id, when, ticker: "FPH.NZ", assetName: "FPH", assetType: "stock", parts: null, cashNzd: cash });
    const income = dividendIncome([row("a", "2026-03-31", 10), row("b", "2026-04-01", 20)]);
    const y26 = income.years.find((y) => y.endingYear === 2026);
    const y27 = income.years.find((y) => y.endingYear === 2027);
    expect(y26?.netCashNzd).toBe(10);
    expect(y27?.netCashNzd).toBe(20);
    expect(income.cashNzd).toBe(30);
  });

  it("M-10: worker never writes responses, drops old caches, clears on sign-out", () => {
    const sw = read("src/lib/pwa-worker.ts");
    expect(sw).toContain('"/offline"');
    expect(sw).not.toMatch(/cache\.put|\.put\(/);
    expect(sw).toContain("aetherforge-clear");
    expect(sw).toContain("url.origin !== self.location.origin");
    expect(read("src/app/logout/page.tsx")).toContain("clearOfflineCaches()");
    expect(read("src/components/PwaRegister.tsx")).not.toMatch(/requestPermission|pushManager/);
  });
});
