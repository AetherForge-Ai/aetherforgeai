import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { holdingBookValuation } from "@/lib/book-valuation";
import { performanceReport } from "@/lib/performance-math";
import { claimsEmptyBook, reconcileNarrativeWithLiveBook, reconcileStoredReport } from "@/lib/report-book";
import { GET as serviceWorker } from "@/app/sw.js/route";

function read(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("pull-check:batch2-fixes-2026-10-12", () => {
  it("keeps the marker in the qa file and in source", () => {
    const marker = "pull-check:batch2-fixes-2026-10-12";
    expect(read("qa/PULL-CHECK-2026-10-10.md")).toContain(marker);
    expect(read("src/lib/broker-import.ts")).toContain(marker);
    expect(read("src/lib/route-gate.ts")).toContain(marker);
  });

  it("serves the service worker as JavaScript", async () => {
    const response = serviceWorker();
    expect(response.headers.get("Content-Type")).toMatch(/application\/javascript/);
    const body = await response.text();
    expect(body).toContain("aetherforge-shell-v1");
    expect(body).toContain("/offline");
  });

  it("names a holding with no stored mark and does not use cost", () => {
    const missing = holdingBookValuation(
      [{ ticker: "AIR.NZ", shares: 10, currentPrice: null, currency: "NZD", updatedAt: null }],
      { NZD: 1, USD: 1.7, AUD: 1.1 },
      "2026-10-12"
    );
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.reason).toMatch(/AIR\.NZ/);
    const priced = holdingBookValuation(
      [{ ticker: "AIR.NZ", shares: 10, currentPrice: 0.7, currency: "NZD", updatedAt: "2026-10-01T00:00:00.000Z" }],
      { NZD: 1, USD: 1.7, AUD: 1.1 },
      "2026-10-12"
    );
    expect(priced.ok).toBe(true);
    if (priced.ok) {
      expect(priced.holdingsNzd).toBe(7);
      expect(priced.asOf).toBe("2026-10-01");
      expect(priced.source).toMatch(/Stored mark/);
    }
  });

  it("leaves time-weighted return blank when the value before each deposit was not stored", () => {
    const report = performanceReport({
      points: [{ date: "2026-01-15", valueBeforeNzd: 0, flowNzd: 100, valueKnown: false }],
      endingNzd: 110,
      asOf: "2026-10-12",
      source: "Stored mark on the holding.",
    });
    expect(report.xirr.value).not.toBeNull();
    expect(report.twr.value).toBeNull();
    expect(report.twr.reason).toMatch(/book value before each deposit/);
  });

  it("keeps one holdings count and drops a repeated empty-book sentence", () => {
    const holdings = [
      { ticker: "AIR.NZ", shares: 10 },
      { ticker: "FPH.NZ", shares: 5 },
      { ticker: "MEL.NZ", shares: 8 },
      { ticker: "CEN.NZ", shares: 4 },
    ];
    const text =
      "Live book: 4 positions — AIR.NZ × 10, FPH.NZ × 5, MEL.NZ × 8, CEN.NZ × 4. " +
      "The book has no monitored holdings yet. 0 of 0 holdings carry a positive momentum signal. " +
      "The book has no monitored holdings yet.";
    const aligned = reconcileNarrativeWithLiveBook(text, holdings, "stock");
    expect(aligned).toMatch(/4 positions/);
    expect(aligned).toMatch(/0 of 4/);
    expect(aligned.match(/Live book:/gi)).toHaveLength(1);
    expect(claimsEmptyBook(aligned)).toBe(false);
    expect(aligned.toLowerCase().match(/no monitored holdings yet/g)).toBeNull();

    const stored = reconcileStoredReport(
      {
        bot: "crypto",
        executiveSummary: "Koins says no monitored coins yet. 0 of 0 coins carry a positive momentum signal. Grok wrote this. An AI model scored it.",
        keyObservations: [
          "No monitored coins yet.",
          "No monitored coins yet.",
        ],
        pathwayPlan: { recommendationNote: "Cash-ready / empty holdings — wait." },
      },
      [{ ticker: "BTC", shares: 1 }]
    );
    expect(stored.executiveSummary).not.toMatch(/Grok/);
    expect(stored.executiveSummary).not.toMatch(/AI model/);
    expect(stored.executiveSummary).toMatch(/0 of 1|BTC/);
    expect(claimsEmptyBook(stored.executiveSummary || "")).toBe(false);
    expect(stored.keyObservations?.filter((line) => /no monitored coins yet/i.test(line))).toHaveLength(0);
  });
});
