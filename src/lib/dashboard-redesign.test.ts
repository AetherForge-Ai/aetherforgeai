import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { dividendDeleteEffect, holdingDeleteEffect, readDashboardTab, writeDashboardTab } from "@/lib/dashboard-tabs";
import { dashboardRedirectHref } from "@/lib/dashboard-redirect";
import { readHoldingsQuery } from "@/lib/holdings-table";
import { formatLedgerQtyPrice } from "@/lib/ledger-line-format";
import { METAL_SPOT_DOWN, shownMetalSpot } from "@/lib/metal-spot-display";
import { buildPortfolioSnapshot, type SnapshotLedgerRow } from "@/lib/portfolio-snapshot";
import { headerQuotaCopy, nextAucklandMonthLabel, reportRunControl } from "@/lib/report-quota-display";
import { documentAccess } from "@/lib/route-gate";
import { formatDisplayDate, formatFxInput, formatNzd } from "@/lib/currency";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("dashboard PR4 and PR5", () => {
  it("formats money, FX, and dates without inventing a tax line", () => {
    expect(formatNzd(12.5)).toBe("NZ$12.50");
    expect(formatFxInput(1.23456)).toBe("1.2346");
    expect(formatDisplayDate("2026-10-13")).toBe("13 Oct 2026");
    const tab = read("src/components/dashboard/TransactionsTab.tsx");
    expect(tab).toContain("Cost method is FIFO");
    expect(tab).toContain("Record a transaction");
    expect(tab).not.toMatch(/\bgst\b/i);
  });

  it("reads the shared tabs and the old class filters", () => {
    const params = new URLSearchParams("tab=transactions&view=crypto");
    expect(readDashboardTab(params)).toBe("transactions");
    expect(readHoldingsQuery(params).assetClass).toBe("crypto");
    writeDashboardTab(params, "holdings");
    expect(params.has("tab")).toBe(false);
    expect(readDashboardTab(new URLSearchParams("view=shares"))).toBe("holdings");
    expect(readHoldingsQuery(new URLSearchParams("view=shares")).assetClass).toBe("shares");
  });

  it("states cash and P&L before a holding or dividend is removed", () => {
    const holding = holdingDeleteEffect({ cash: 100, unrealised: 20, realised: 5 });
    expect(holding.cashBefore).toBe("NZ$100.00");
    expect(holding.cashAfter).toBe(holding.cashBefore);
    expect(holding.cashReason).toMatch(/does not post a cash line/);
    expect(holding.unrealisedAfter).toBe("—");
    const missing = dividendDeleteEffect(null, 10);
    expect(missing.cashAfter).toBe("—");
    expect(dividendDeleteEffect(100, 12.5).cashAfter).toBe("NZ$87.50");
  });

  it("does not show a purchase price as spot when the metal feed is down", () => {
    const down = shownMetalSpot(false, 7640.25);
    expect(down.text).toBe("—");
    expect(down.reason).toBe(METAL_SPOT_DOWN);
    expect(down.live).toBe(false);
    expect(shownMetalSpot(true, 7237.61).text).toBe("NZ$7,237.61");
    const panel = read("src/components/dashboard/PreciousMetals.tsx");
    expect(panel).toContain("shownMetalSpot");
    expect(panel).not.toContain("spotPerOz || paid");
    expect(panel).not.toContain("spotPerOz || h.purchase_price_per_oz");
    expect(panel).not.toContain("price: gold?.nzdPerOz");
  });

  it("keeps one workspace, the report lists, and the old addresses", () => {
    const dash = read("src/components/dashboard/PortfolioDashboard.tsx");
    const center = read("src/components/dashboard/ReportCenter.tsx");
    expect(read("src/components/dashboard/DashboardCalculator.tsx")).toContain('data-section="dashboard-workspace"');
    expect(read("src/lib/report-quota-display.ts")).toContain("Run ${input.name} report");
    expect(dash).toContain(".label");
    expect(dash).toContain("stay until PR5");
    expect(center).toContain("Choose {b.name} free");
    expect(center).toContain("The Headmaster");
    expect(center).toContain("Your reports");
    expect(center).toContain("stoxReviewCopy");
    expect(center).toContain("left this month");
    expect(dash).not.toContain("querySelector");
    expect(dash).toContain("reportDesk.run");
    expect(dash).toContain('data-header-actions');
    expect(dash).toContain("flex-wrap");
    expect(read("src/components/dashboard/DashboardCalculator.tsx")).toContain("min-h-11");
    expect(read("src/components/dashboard/GlobalSearch.tsx")).toContain('aria-label="Search markets"');
    for (const path of ["src/app/dashboard/stocks/page.tsx", "src/app/dashboard/crypto/page.tsx", "src/app/dashboard/transactions/page.tsx"]) {
      const page = read(path);
      expect(page).toContain("redirect(");
      expect(page).toContain("dashboardRedirectHref");
      expect(page).toContain("publicPageMetadata(");
      expect(page).not.toContain("notFound(");
    }
    for (const path of [
      "src/components/dashboard/DashboardCalculator.tsx",
      "src/components/dashboard/TransactionsTab.tsx",
      "src/components/dashboard/HoldingDetailDrawer.tsx",
      "src/components/dashboard/DashboardInsights.tsx",
      "src/components/dashboard/PaidPlanPrompt.tsx",
    ]) {
      const source = read(path);
      expect(source).not.toMatch(/\bgst\b/i);
      expect(source).not.toMatch(/gpt|claude|gemini|openai/i);
    }
  });

  it("keeps query params on the three old dashboard addresses and stays on a public page", () => {
    const stocks = new URL(dashboardRedirectHref({ hq: "AIR", hsort: "value", view: "crypto" }, { view: "shares" }), "http://localhost");
    expect(stocks.pathname).toBe("/dashboard");
    expect(stocks.searchParams.get("hq")).toBe("AIR");
    expect(stocks.searchParams.get("hsort")).toBe("value");
    expect(stocks.searchParams.get("view")).toBe("shares");
    const crypto = new URL(dashboardRedirectHref({ hq: "BTC", tab: "insights" }, { view: "crypto" }), "http://localhost");
    expect(crypto.searchParams.get("hq")).toBe("BTC");
    expect(crypto.searchParams.get("tab")).toBe("insights");
    expect(crypto.searchParams.get("view")).toBe("crypto");
    const ledger = new URL(dashboardRedirectHref({ hq: "AIR", hsort: "value" }, { tab: "transactions" }), "http://localhost");
    expect(ledger.searchParams.get("tab")).toBe("transactions");
    expect(ledger.searchParams.get("hq")).toBe("AIR");
    expect(ledger.searchParams.get("hsort")).toBe("value");
    for (const path of ["/dashboard/stocks", "/dashboard/crypto", "/dashboard/transactions", stocks.pathname, crypto.pathname, ledger.pathname]) {
      expect(documentAccess(path)).toBe("public");
    }
  });

  it("prints the monthly quota from the report response, and a dash before it loads", () => {
    expect(nextAucklandMonthLabel("2026-10")).toBe("1 Nov 2026");
    const waiting = headerQuotaCopy({ loaded: false, remaining: null, limit: null, monthKey: null, nextAllowedAt: null, monthly: true });
    expect(waiting.text).toBe("—");
    expect(waiting.reason).toMatch(/not loaded/i);
    const live = headerQuotaCopy({
      loaded: true,
      remaining: 4,
      limit: 10,
      monthKey: "2026-10",
      nextAllowedAt: null,
      monthly: true,
    });
    expect(live.text).toBe("4 of 10 left this month. Resets 1 Nov 2026.");
    expect(live.reason).toBeNull();
    const none = reportRunControl({
      loaded: true,
      name: "Stox",
      allowed: false,
      remaining: 0,
      limit: 10,
      cooldown: "Generated 1d ago · next refresh in 2d",
    });
    expect(none.disabled).toBe(true);
    expect(none.title).toMatch(/next refresh/);
    expect(none.label).toBe("Run Stox report · 0 of 10 left");
    expect(reportRunControl({ loaded: false, name: "Koins", allowed: null, remaining: null, limit: null, cooldown: null }).label).toBe(
      "Run Koins report"
    );
  });

  it("formats a ledger line as quantity times a unit price, with a dated label and a 4dp rate", () => {
    const row = (partial: SnapshotLedgerRow): SnapshotLedgerRow => ({
      asset_type: "stock",
      currency: "USD",
      fx_rate: 1.65432,
      fees: 0,
      fees_nzd: 0,
      ...partial,
    });
    const snap = buildPortfolioSnapshot({
      asOf: "2026-10-13T00:00:00.000Z",
      fxSourced: true,
      rows: [
        row({
          _id: "buy-1",
          type: "buy",
          ticker: "AAPL",
          trade_date: "2026-10-13",
          quantity: 1.5,
          price: 0.0042,
          cash_nzd: -1,
          total: -1,
        }),
      ],
    });
    const line = snap.ledger[0];
    expect(line.whenLabel).toBe("13 Oct 2026");
    expect(line.fxDisplay).toBe("1.6543");
    expect(line.currency).toBe("USD");
    const shown = formatLedgerQtyPrice(line);
    expect(shown.text).toContain("1.5");
    expect(shown.text).toContain("×");
    expect(shown.text).toMatch(/US\$/);
    expect(shown.reason).toBeNull();
    expect(formatLedgerQtyPrice({ quantity: 2, price: 10, currency: "NZD" }).text).toBe("2 × NZ$10.00");
    expect(formatNzd(10)).toBe("NZ$10.00");
    expect(formatFxInput(1.65432)).toBe("1.6543");
    expect(formatDisplayDate("2026-10-13")).toBe("13 Oct 2026");
  });
});
