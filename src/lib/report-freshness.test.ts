import { describe, expect, it } from "vitest";
import { buildLiveReport } from "@/lib/apex";
import {
  PAID_REPORT_REFRESH_MS,
  checkReportQuota,
  formatAucklandDateTime,
  formatReportCooldownLine,
  reportCadence,
} from "@/lib/entitlements";
import {
  claimsEmptyBook,
  groundReportNarrative,
  reconcileNarrativeWithLiveBook,
  reconcileStoredReport,
} from "@/lib/report-book";

const NOW = Date.parse("2026-09-23T10:33:00.000Z"); // 22:33 in Pacific/Auckland (NZST)
const HOUR = 60 * 60 * 1000;

describe("Stox/Koins refresh cadence", () => {
  it("lets a paid plan refresh a report that is already ~15h old", () => {
    const last = new Date(NOW - 15 * HOUR).toISOString();
    const quota = checkReportQuota("pro_monthly", last, NOW);
    expect(quota.cadence.ms).toBe(PAID_REPORT_REFRESH_MS);
    expect(quota.allowed).toBe(true);
    expect(quota.waitMs).toBe(0);
    expect(formatReportCooldownLine({
      lastReportAt: last,
      waitMs: quota.waitMs,
      cadenceUnit: quota.cadence.unit,
      now: NOW,
    })).toBe("Generated 15h ago · ready to refresh");
  });

  it("keeps a short cooldown so a report from 2h ago is not immediately re-run", () => {
    const last = new Date(NOW - 2 * HOUR).toISOString();
    const quota = checkReportQuota("monthly", last, NOW);
    expect(quota.allowed).toBe(false);
    expect(quota.waitMs).toBe(2 * HOUR);
    const line = formatReportCooldownLine({
      lastReportAt: last,
      waitMs: quota.waitMs,
      cadenceUnit: quota.cadence.unit,
      now: NOW,
    });
    expect(line).toContain("next refresh in 2h");
    expect(line.toLowerCase()).not.toContain("midnight");
  });

  it("leaves the free weekly window unchanged", () => {
    expect(reportCadence("free").perLabel).toBe("per week");
    const recent = checkReportQuota("free", new Date(NOW - 2 * 24 * HOUR).toISOString(), NOW);
    expect(recent.allowed).toBe(false);
    const stale = checkReportQuota("weekly", new Date(NOW - 8 * 24 * HOUR).toISOString(), NOW);
    expect(stale.allowed).toBe(true);
  });

  it("formats report timestamps in Pacific/Auckland, not UTC", () => {
    // 00:30 UTC on 23 Sep 2026 is 12:30 pm NZST (UTC+12; DST starts 27 Sep 2026).
    const label = formatAucklandDateTime("2026-09-23T00:30:00.000Z");
    expect(label).toMatch(/23/);
    expect(label).toMatch(/Sep/);
    expect(label).toMatch(/12:30/);
    expect(label).toMatch(/pm/i);
    expect(label).not.toMatch(/12:30\s*am/i);
  });
});

describe("report narrative vs live book", () => {
  const book = [
    { ticker: "GNC.AX", name: "GrainCorp", price: 8.4, shares: 120, purchasePrice: 7.1 },
    { ticker: "ARB", name: "ARB Corporation", price: 31.2, shares: 40, purchasePrice: 29 },
  ];

  it("describes held names instead of an empty book", () => {
    const report = buildLiveReport("stock", book, { cashBalanceNZD: 80423 });
    const blob = [
      report.executiveSummary,
      ...report.keyObservations,
      report.pathwayPlan.recommendationNote,
    ].join("\n");
    expect(report.executiveSummary).toMatch(/GNC\.AX/);
    expect(report.executiveSummary).toMatch(/ARB/);
    expect(report.executiveSummary).toMatch(/120/);
    expect(claimsEmptyBook(blob)).toBe(false);
  });

  it("still uses empty-book copy when the account really has no positions", () => {
    const report = buildLiveReport("crypto", [], { cashBalanceNZD: 500 });
    expect(claimsEmptyBook(report.executiveSummary)).toBe(true);
  });

  it("discards a model narrative that calls a funded book empty", () => {
    const grounded = groundReportNarrative(
      "Your book has no monitored tickers yet — deploy the cash into new names.",
      book
    );
    expect(grounded.discardedEmptyClaim).toBe(true);
    expect(grounded.text).toBe("");
  });

  it("prefixes a narrative that never names the live tickers", () => {
    const grounded = groundReportNarrative(
      "The tape is constructive this week and several catalysts sit ahead of the open.",
      [{ ticker: "DOT", shares: 80 }]
    );
    expect(grounded.discardedEmptyClaim).toBe(false);
    expect(grounded.text.startsWith("Live holdings: DOT × 80.")).toBe(true);
  });

  it("rewrites a stored empty-book summary when the account now holds positions", () => {
    const text = reconcileNarrativeWithLiveBook(
      "Cash-ready / empty holdings — nothing is monitored on this book.",
      [{ ticker: "NEAR", shares: 25 }]
    );
    expect(text).toMatch(/NEAR × 25/);
    expect(claimsEmptyBook(text)).toBe(false);

    const stored = reconcileStoredReport(
      {
        executiveSummary: "Your book has **no monitored tickers yet**.",
        keyObservations: ["Empty holdings — leading with 4 named BUY candidates."],
        pathwayPlan: { recommendationNote: "Cash-ready / empty holdings — deploy into BTC." },
      },
      [{ ticker: "DOT", shares: 12 }]
    );
    expect(stored.executiveSummary).toMatch(/DOT × 12/);
    expect(stored.keyObservations?.[0]).toMatch(/DOT/);
    expect(claimsEmptyBook(stored.pathwayPlan?.recommendationNote || "")).toBe(false);
  });
});
