import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { dividendDeleteEffect, holdingDeleteEffect, readDashboardTab, writeDashboardTab } from "@/lib/dashboard-tabs";
import { readHoldingsQuery } from "@/lib/holdings-table";
import { METAL_SPOT_DOWN, shownMetalSpot } from "@/lib/metal-spot-display";
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
    expect(dash).toContain("Run Stox report");
    expect(dash).toContain("Run Koins report");
    expect(dash).toContain("stay until PR5");
    expect(center).toContain("Choose {b.name} free");
    expect(center).toContain("The Headmaster");
    expect(center).toContain("Your reports");
    expect(center).toContain("stoxReviewCopy");
    expect(center).toContain("left this month");
    expect(read("src/app/dashboard/stocks/page.tsx")).toContain('href="/dashboard?view=shares"');
    expect(read("src/app/dashboard/stocks/page.tsx")).toContain('publicPageMetadata("/dashboard/stocks"');
    expect(read("src/app/dashboard/crypto/page.tsx")).toContain('href="/dashboard?view=crypto"');
    expect(read("src/app/dashboard/transactions/page.tsx")).toContain('href="/dashboard?tab=transactions"');
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
});
