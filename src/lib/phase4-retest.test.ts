import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { headmasterReportText, listedReportBody, type HeadmasterBookBrief } from "@/lib/report-body";
import { shownTradePriceLabel, tradePriceHint } from "@/lib/trade-price-label";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("phase 4 retest", () => {
  it("writes a Headmaster body from the book and dashes a missing section", () => {
    const brief: HeadmasterBookBrief = {
      holdsCrypto: false,
      holdings: [{ label: "Fisher & Paykel Healthcare", valueNZD: 4864 }],
      allocation: [{ label: "Equities", weightPct: 100, valueNZD: 4864 }],
      cashNZD: 250000,
      trades: [{ whenLabel: "14 Oct 2026", type: "deposit", ticker: "", amountNZD: 250000 }],
      risks: [],
    };
    const text = headmasterReportText({
      path: { illustrated7dPct: 0.17, netWorthNZD: 254864, issuedAtMs: Date.parse("2026-10-14T00:00:00.000Z") },
      brief,
    });
    expect(text).toContain("Holdings");
    expect(text).toContain("Fisher & Paykel Healthcare NZ$4,864.00");
    expect(text).toContain("Allocation");
    expect(text).toContain("Equities 100.0% NZ$4,864.00");
    expect(text).toContain("Cash");
    expect(text).toContain("NZ$250,000.00");
    expect(text).toContain("Recent trades");
    expect(text).toContain("14 Oct 2026 deposit NZ$250,000.00");
    expect(text).toContain("— No concentration risk was scored for this book.");
    expect(text).toContain("not a forecast");
    expect(text).toContain("Issued 14 Oct 2026");

    const missing = listedReportBody({
      textBody: "Illustrated 7-day path +0.17%.",
      payload: { illustratedPath: { illustrated7dPct: 0.17, netWorthNZD: 254864, issuedAtMs: Date.parse("2026-10-14T00:00:00.000Z") } },
    });
    expect(missing).toContain("— Holding lines were not stored with this report.");
    expect(missing).toContain("— Cash was not stored with this report.");
    expect(missing).not.toContain("NZ$4,864.00");
  });

  it("labels an open print as the latest price and hides the hint after an edit", () => {
    expect(shownTradePriceLabel("2026-10-14T23:27:00.000Z", false, "open")).toMatch(/^Latest price 15 Oct 2026/);
    expect(shownTradePriceLabel("2026-10-13T00:00:00.000Z", false, "closed")).toBe("Last close 13 Oct 2026");
    expect(tradePriceHint({ priceDirty: false, session: "open", quotedAt: "2026-10-14T23:27:00.000Z" })).toMatch(/filled in$/);
    expect(tradePriceHint({ priceDirty: true, session: "open", quotedAt: "2026-10-14T23:27:00.000Z" })).toBe("");
    const route = read("src/app/api/tickers/quote/route.ts");
    expect(route).toContain("fetchLiveQuotes");
    expect(route).toContain("equitySessionOpen");
    expect(route).toContain("Latest price");
    expect(route).toContain("Last close");
  });

  it("fits the holdings table, opens the chart, and unclips delete", () => {
    const holdings = read("src/components/dashboard/UnifiedHoldingsTable.tsx");
    expect(holdings).not.toContain("A dash has its reason on the info button.");
    // b7 M-6: fixed layout let nowrap figures overlap; auto layout + sideways scroll replaces it.
    expect(holdings).toContain("overflow-x-auto");
    expect(holdings).toContain("table-auto");
    const kpi = read("src/components/dashboard/KpiHeader.tsx");
    expect(kpi).toContain("useState(true)");
    expect(kpi).toContain("data-chart-open");
    expect(kpi).toContain("grid-cols-2");
    const calcTabs = read("src/components/dashboard/DashboardCalculator.tsx");
    expect(calcTabs).toContain("order-1 mt-4");
    expect(calcTabs).toContain("md:order-3");
    const tx = read("src/components/dashboard/TransactionsTab.tsx");
    expect(tx).toContain("flex-col");
    expect(tx).toContain("overflow-x-clip");
    expect(tx).toContain("This row cannot be removed from this list.");
    const calc = read("src/components/dashboard/DashboardCalculator.tsx");
    expect(calc).toContain('block: "nearest"');
    expect(calc).not.toContain('scrollIntoView({ block: "start" })');
  });

  it("does not leave the report desk or onboarding on a stuck sentence", () => {
    const center = read("src/components/dashboard/ReportCenter.tsx");
    expect(center).toContain("Reports did not load.");
    expect(center).toContain("8_000");
    expect(center).not.toContain("Loading…");
    const onboard = read("src/components/dashboard/OnboardingChecklist.tsx");
    expect(onboard).not.toContain("Checking your paper book…");
    expect(onboard).toContain("Alerts and reports could not be checked.");
    const dash = read("src/components/dashboard/PortfolioDashboard.tsx");
    expect(dash).toContain('"/api/reports"');
    expect(dash).toContain('"/api/alerts"');
    expect(dash).toContain('params.set("marks", "stored")');
    expect(dash).toContain("cryptoSnapshotAt");
    const route = read("src/app/api/portfolio/snapshot/route.ts");
    expect(route).toContain('searchParams.get("marks") === "stored"');
    expect(route).toContain("storedMarks");
  });
});
