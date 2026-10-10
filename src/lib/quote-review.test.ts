import { describe, expect, it, vi } from "vitest";
import {
  createQuoteBook,
  DATA_UNDER_REVIEW,
  LARGE_CAP_MONTH_MOVE_CAP_PCT,
  LARGE_CAP_SESSION_MOVE_CAP_PCT,
  LARGE_CAP_WEEK_MOVE_CAP_PCT,
  reviewSessionMove,
} from "@/lib/quote-review";

describe("quote review", () => {
  it("withholds large-cap 24-hour moves above the 20% guard", () => {
    for (const row of [
      { ticker: "STO.AX", reportedChangePct: 73.07 },
      { ticker: "CDW", reportedChangePct: 64.76 },
      { ticker: "JPM", reportedChangePct: 30.34 },
      { ticker: "META", reportedChangePct: 28.9 },
    ]) {
      const reviewed = reviewSessionMove({
        ticker: row.ticker,
        assetClass: "stock",
        price: 11.4,
        reportedChangePct: row.reportedChangePct,
        window: "1d",
      });
      expect(reviewed.withheld).toBe(true);
      expect(reviewed.display).toBe(DATA_UNDER_REVIEW);
      expect(reviewed.reason).toBe("above the large-cap session guard");
      expect(reviewed.changePct).toBe(0);
    }
    expect(LARGE_CAP_SESSION_MOVE_CAP_PCT).toBe(20);
    expect(LARGE_CAP_WEEK_MOVE_CAP_PCT).toBe(35);
    expect(LARGE_CAP_MONTH_MOVE_CAP_PCT).toBe(60);
  });

  it("withholds the retest's implausible moves on every window", () => {
    const cases: Array<{ ticker: string; assetClass: "stock" | "crypto"; window: "1d" | "7d" | "30d"; reportedChangePct: number; reason: string }> = [
      { ticker: "LRCX", assetClass: "stock", window: "1d", reportedChangePct: 43.68, reason: "above the large-cap session guard" },
      { ticker: "AMGN", assetClass: "stock", window: "1d", reportedChangePct: 42.23, reason: "above the large-cap session guard" },
      { ticker: "MDLZ", assetClass: "stock", window: "7d", reportedChangePct: 50.64, reason: "above the large-cap session guard" },
      { ticker: "WETH", assetClass: "crypto", window: "1d", reportedChangePct: 77.98, reason: "wrapped token does not track its underlying" },
      { ticker: "BTCB", assetClass: "crypto", window: "1d", reportedChangePct: 36.11, reason: "wrapped token does not track its underlying" },
      { ticker: "USDG", assetClass: "crypto", window: "1d", reportedChangePct: 27.66, reason: "stablecoin move is above a few percent" },
      { ticker: "CRVUSD", assetClass: "crypto", window: "1d", reportedChangePct: 29.82, reason: "stablecoin move is above a few percent" },
    ];
    for (const row of cases) {
      const reviewed = reviewSessionMove({ ...row, price: 10 });
      expect(reviewed.withheld, row.ticker).toBe(true);
      expect(reviewed.display).toBe(DATA_UNDER_REVIEW);
      expect(reviewed.reason).toBe(row.reason);
    }
    expect(
      reviewSessionMove({ ticker: "WETH", assetClass: "crypto", price: 3000, reportedChangePct: 3, window: "7d" }).withheld
    ).toBe(false);
    expect(
      reviewSessionMove({
        ticker: "WETH",
        assetClass: "crypto",
        price: 3000,
        reportedChangePct: 14,
        underlyingChangePct: 12,
        window: "1d",
      }).withheld
    ).toBe(false);
    expect(
      reviewSessionMove({ ticker: "USDC", assetClass: "crypto", price: 1, reportedChangePct: 0.4, window: "30d" }).withheld
    ).toBe(false);
    expect(
      reviewSessionMove({ ticker: "JPM", assetClass: "stock", price: 210, reportedChangePct: 31.01, window: "7d" }).withheld
    ).toBe(false);
    expect(
      reviewSessionMove({ ticker: "META", assetClass: "stock", price: 520, reportedChangePct: 32.46, window: "7d" }).withheld
    ).toBe(false);
    expect(
      reviewSessionMove({ ticker: "JPM", assetClass: "stock", price: 210, reportedChangePct: 25, window: "30d" }).withheld
    ).toBe(false);
  });

  it("withholds later windows when the 24-hour print is withheld, and keeps a 25% 30-day large-cap move", () => {
    const book = createQuoteBook();
    const jpmDay = book.review({ ticker: "JPM", assetClass: "stock", price: 210, reportedChangePct: 30.34, window: "1d" });
    const jpmWeek = book.review({ ticker: "JPM", assetClass: "stock", price: 210, reportedChangePct: 31.01, window: "7d" });
    const metaDay = book.review({ ticker: "META", assetClass: "stock", price: 520, reportedChangePct: 28.9, window: "1d" });
    const metaWeek = book.review({ ticker: "META", assetClass: "stock", price: 520, reportedChangePct: 32.46, window: "7d" });
    expect(jpmDay.withheld).toBe(true);
    expect(jpmWeek.withheld).toBe(true);
    expect(jpmWeek.reason).toBe("24-hour print is under review");
    expect(jpmWeek.display).toBe(DATA_UNDER_REVIEW);
    expect(metaDay.withheld).toBe(true);
    expect(metaWeek.withheld).toBe(true);
    expect(metaWeek.reason).toBe("24-hour print is under review");
    const keptDay = book.review({ ticker: "AAPL", assetClass: "stock", price: 220, reportedChangePct: 2, window: "1d" });
    const keptMonth = book.review({ ticker: "AAPL", assetClass: "stock", price: 220, reportedChangePct: 25, window: "30d" });
    expect(keptDay.withheld).toBe(false);
    expect(keptMonth.withheld).toBe(false);
    expect(keptMonth.display).toBe("+25%");
  });

  it("keeps a crypto 24-hour move under the crypto cap", () => {
    const reviewed = reviewSessionMove({
      ticker: "BAT",
      assetClass: "crypto",
      price: 0.25,
      reportedChangePct: 33.16,
      window: "1d",
    });
    expect(reviewed.withheld).toBe(false);
    expect(reviewed.display).toBe("+33.16%");
  });

  it("withholds a split-like jump, cents versus dollars, a stale print, and a second source that disagrees", () => {
    expect(
      reviewSessionMove({
        ticker: "ABC.AX",
        assetClass: "stock",
        price: 20,
        previousClose: 10,
        reportedChangePct: 100,
        window: "1d",
      }).reason
    ).toBe("possible share split");
    expect(
      reviewSessionMove({
        ticker: "ABC.AX",
        assetClass: "stock",
        price: 1234,
        previousClose: 12.34,
        reportedChangePct: 4,
        window: "1d",
      }).reason
    ).toBe("cents versus dollars");
    expect(
      reviewSessionMove({
        ticker: "ABC.AX",
        assetClass: "stock",
        price: 10,
        reportedChangePct: 4,
        window: "1d",
        quotedAtMs: 0,
        nowMs: 48 * 60 * 60 * 1000,
      }).reason
    ).toBe("stale price");
    expect(
      reviewSessionMove({
        ticker: "ABC.AX",
        assetClass: "stock",
        price: 10,
        reportedChangePct: 12,
        secondSourceChangePct: 1,
        window: "1d",
      }).reason
    ).toBe("second source disagrees");
    expect(
      reviewSessionMove({
        ticker: "ABC.AX",
        assetClass: "stock",
        market: "ASX",
        currency: "AUD",
        price: 15.4,
        previousClose: 10,
        reportedChangePct: 80,
        window: "1d",
      }).reason
    ).toBe("possible currency mix-up (AU versus US)");
    expect(
      reviewSessionMove({
        ticker: "ASXUSD.AX",
        assetClass: "stock",
        market: "ASX",
        currency: "USD",
        price: 10,
        reportedChangePct: 4,
        window: "1d",
      }).reason
    ).toBe("possible currency mix-up (AU versus US)");
    expect(
      reviewSessionMove({
        ticker: "SMALL.AX",
        assetClass: "stock",
        market: "ASX",
        currency: "AUD",
        price: 15.3,
        previousClose: 10,
        reportedChangePct: 53,
        window: "1d",
      }).reason
    ).toBe("above the session move guard");
    expect(
      reviewSessionMove({
        ticker: "SMALL.AX",
        assetClass: "stock",
        market: "ASX",
        currency: "AUD",
        price: 14,
        previousClose: 10,
        reportedChangePct: 40,
        window: "1d",
      }).reason
    ).toBeNull();
  });

  it("keeps one figure per ticker and window, and a withheld 24-hour clash covers the later window", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const book = createQuoteBook();
    const first = book.review({
      ticker: "BAT",
      assetClass: "crypto",
      price: 0.2,
      reportedChangePct: 33.16,
      window: "1d",
    });
    const clash = book.review({
      ticker: "bat",
      assetClass: "crypto",
      price: 0.2,
      reportedChangePct: 13.9,
      window: "1d",
    });
    const week = book.review({
      ticker: "BAT",
      assetClass: "crypto",
      price: 0.2,
      reportedChangePct: 13.9,
      window: "7d",
    });
    expect(first.withheld).toBe(false);
    expect(clash.withheld).toBe(true);
    expect(clash.display).toBe(DATA_UNDER_REVIEW);
    expect(week.withheld).toBe(true);
    expect(week.reason).toBe("24-hour print is under review");
    expect(week.display).toBe(DATA_UNDER_REVIEW);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
