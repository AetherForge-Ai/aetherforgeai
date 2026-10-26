import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { readFileSync } from "node:fs";
import { withTimeout } from "@/lib/with-timeout";
import { keywordSentiment } from "@/lib/news-sentiment";
import { searchAssets, isWrappedName } from "@/lib/asset-search";
import { markToMarketBullionNZD } from "@/lib/metal-valuation";
import { onboardingProgress } from "@/lib/onboarding-steps";
import { holdingsColumnWidth } from "@/lib/holdings-columns";
import { buyLotFee } from "@/lib/tax-realised";
import { railCardsFor, usageLine, usagePercent, RAIL_ASIDE_CLASS, RAIL_GRID_CLASS } from "@/lib/dashboard-rail";

const r = (f: string) => readFileSync(f, "utf8");

describe("fresh2 — review + leftovers", () => {
  it("H1: one shared buy-fee lot helper", () => {
    expect(buyLotFee({ fees_nzd: 10 } as never, 1, 4)).toEqual({ feePerUnitNzd: 2.5, missingFee: false });
    expect(r("src/lib/tax-realised.ts").match(/feePerUnitNzd: \(\(\) =>/g)).toBeNull();
  });
  it("H6: slow fetches fall back in time", async () => {
    const slow = new Promise<number>((res) => setTimeout(() => res(1), 200));
    expect(await withTimeout(slow, 20, null)).toBeNull();
    expect(await withTimeout(Promise.reject(new Error("x")), 20, "fb")).toBe("fb");
    expect(r("src/app/markets/crypto/[id]/page.tsx")).toContain("withTimeout(() => loadPublicCryptoPrint(coinId), 1_000, null)");
  });
  it("M5: billing explains the assistant counter", () => {
    expect(r("src/app/settings/billing/page.tsx")).toContain("The Assistant Guide on the dashboard is not counted.");
  });
  it("M8: holdings columns always sum to 100%", () => {
    const cols = ["asset", "qty", "price", "value", "pnl", "weight", "ret", "actions"];
    const sum = cols.reduce((s, c) => s + holdingsColumnWidth(c, cols), 0);
    expect(Math.abs(sum - 100)).toBeLessThan(0.5);
    expect(r("src/components/dashboard/UnifiedHoldingsTable.tsx")).toContain("holdingsColumnWidth(column, tableColumns)");
  });
  it("M11: deterministic headline-first tone (UNH is bullish)", () => {
    const a = keywordSentiment("UNH Stock Outpaces S&P 500, Eyes Best Year", "pressure and concern remain");
    expect(a.sentiment).toBe("Bullish");
    expect(keywordSentiment("Shares plunge", "").sentiment).toBe("Bearish");
    expect(keywordSentiment("Kiwis avoid big supermarkets", "").sentiment).toBe("Neutral");
    expect(r("src/components/dashboard/NewsFeed.tsx")).toContain("Keyword tone ·");
  });
  it("LOW: bitcoin search ranks BTC first", () => {
    const hits = searchAssets("bitcoin", {
      dex: [{ symbol: "CBBTC", name: "Circle Wrapped Bitcoin", market: "DEX", assetType: "crypto" } as never],
      coins: [
        { symbol: "WBTC", name: "Wrapped Bitcoin", market: "Crypto", assetType: "crypto" } as never,
        { symbol: "BTC", name: "Bitcoin", market: "Crypto", assetType: "crypto" } as never,
      ],
    });
    expect(hits[0].symbol).toBe("BTC");
    expect(isWrappedName("Wrapped Bitcoin")).toBe(true);
  });
  it("LOW: gold uses the ledger's cent rounding", () => {
    expect(markToMarketBullionNZD(0.5, 7391.47)).toBe(3695.74);
  });
  it("LOW: onboarding counts required steps only", () => {
    const p = onboardingProgress({ hasHoldings: true, hasBuy: false, plan: "free" });
    expect(p.requiredDone).toBe(0);
    expect(r("src/components/dashboard/OnboardingChecklist.tsx")).toContain("required steps done");
  });
  it("LOW: stock change keeps its sign, chart ticks carry currency, metals say bullion", () => {
    const s = r("src/components/dashboard/StockDetailView.tsx");
    expect(s).toContain('q.changePct < 0 ? "−"');
    expect(s).toContain("tickFormatter={(v) => formatMarketPrice(Number(v), currency)}");
    expect(r("src/components/dashboard/TransactionCenter.tsx")).toContain('label: "Silver bullion"');
    expect(r("src/lib/plan-usage.ts")).not.toContain("same holdings cap as the dashboard and profile");
  });
  it("LOW: ticker has one screen-reader list; both marquee copies hidden", () => {
    const s = r("src/components/MarketTicker.tsx");
    expect(s).toContain('<ul className="sr-only"');
    expect(s).toContain('data-ticker-copy={copy} aria-hidden="true"');
  });
  it("LOW: coin page prints the price in first HTML", () => {
    expect(r("src/app/markets/crypto/[id]/page.tsx")).toContain("data-server-price");
  });
});

describe("dashboard right column D1–D10", () => {
  it("D2/D3: Free gets one unlock card last; paid gets one alerts card", () => {
    expect(railCardsFor(true)).toEqual(["watchlist", "usage", "unlock"]);
    expect(railCardsFor(false)).toEqual(["drift", "alerts", "watchlist", "usage"]);
    const rail = r("src/components/dashboard/rail/DashboardRail.tsx");
    expect(rail.match(/See plans/g)?.length).toBe(1);
    expect(rail.match(/<PriceAlerts/g)?.length).toBe(1);
  });
  it("D1/D9: one card system", () => {
    const c = r("src/components/dashboard/rail/RailCard.tsx");
    expect(c).toContain("rounded-2xl border border-border/70 bg-card p-5");
    expect(c).toContain('className="text-base font-semibold leading-6"');
    expect(r("src/components/dashboard/WatchlistPanel.tsx")).not.toContain("rounded-3xl");
  });
  it("D5/D10: watchlist input labelled, × is 32px with focus ring", () => {
    const w = r("src/components/dashboard/WatchlistPanel.tsx");
    expect(w).toContain('placeholder={bot === "crypto" ? "Add coin (e.g. SOL)" : "Add ticker (e.g. TSLA)"}');
    expect(w).toContain("htmlFor={inputId}");
    expect(w).toContain("grid size-8 shrink-0");
    expect(w).toContain("focus-visible:ring-2");
  });
  it("D6/D7/D8: sticky internal scroll on xl, grid under summary below xl, clear of header and Guide", () => {
    // M-6 kept D6/D7: sticky with internal scroll on xl, now only when the window fits.
    expect(RAIL_ASIDE_CLASS).toContain("rail-aside-fit");
    expect(RAIL_ASIDE_CLASS).toContain("lg:order-first");
    const css = require("node:fs").readFileSync(require("node:path").join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).toMatch(/@media \(min-width: 1280px\) and \(min-height: 720px\)\s*\{\s*\.rail-aside-fit \{\s*position: sticky;/);
    expect(css).toContain("max-height: calc(100vh - 7rem);");
    expect(css).toContain("overflow-y: auto;");
    expect(RAIL_GRID_CLASS).toContain("xl:grid-cols-[minmax(0,1fr)_22rem]");
  });
  it("D-usage: plan usage lines", () => {
    expect(usageLine(4, 10)).toBe("4 of 10");
    expect(usageLine(null, 3)).toBe("— of 3");
    expect(usagePercent(1, 3)).toBe(33);
  });
  it("D10: small-text accent passes 4.5:1", () => {
    const lum = (hex: string) => {
      const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const ratio = (1 + 0.05) / (lum("#047857") + 0.05);
    expect(ratio).toBeGreaterThan(4.5);
    expect((1 + 0.05) / (lum("#64748b") + 0.05)).toBeGreaterThan(4.5);
  });
});
describe("fresh2 version pin", () => {
  it("build version and marker", () => {
    expect(r("public/build-version.txt").trim()).toBe("v3-m7-b74-2026-10-27");
    expect(r("qa/PULL-CHECK-2026-10-12.md")).toContain("pull-check:v3-tt-fresh2-2026-10-15");
  });
});
describe("fresh3 marker", () => {
  it("pull-check marker present", () => {
    expect(r("qa/PULL-CHECK-2026-10-12.md")).toContain("pull-check:v3-tt-fresh3-2026-10-15");
    expect(r("src/components/dashboard/GuestDashboardGate.tsx")).toContain("{MEMBER_DASHBOARD_HEADING}</h1>");
  });
});
