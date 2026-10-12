import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  annualisedAvailability,
  kpiView,
  periodSpanDays,
  readHeaderState,
  returnSplitWeights,
  writeHeaderState,
} from "@/lib/dashboard-kpi";
import {
  COLUMN_SETS,
  DEFAULT_HOLDINGS_QUERY,
  buildHoldingsTable,
  readHoldingsQuery,
  writeHoldingsQuery,
} from "@/lib/holdings-table";
import { buildPortfolioSnapshot, type SnapshotLedgerRow } from "@/lib/portfolio-snapshot";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function row(partial: SnapshotLedgerRow): SnapshotLedgerRow {
  return {
    asset_type: "stock",
    currency: "NZD",
    fx_rate: 1,
    fees: 0,
    fees_nzd: 0,
    ...partial,
  };
}

function book() {
  return buildPortfolioSnapshot({
    rows: [
      row({ _id: "dep", type: "deposit", trade_date: "2026-10-01", cash_nzd: 1000, total: 1000, ticker: "" }),
      row({
        _id: "aaa",
        type: "buy",
        ticker: "AAA.NZ",
        asset_name: "Alpha",
        trade_date: "2026-10-02",
        quantity: 1,
        price: 10,
        cash_nzd: -10,
        total: -10,
      }),
      row({
        _id: "bbb",
        type: "buy",
        ticker: "BBB.NZ",
        asset_name: "Beta",
        trade_date: "2026-10-03",
        quantity: 1,
        price: 10,
        cash_nzd: -10,
        total: -10,
      }),
    ],
    marks: [
      { ticker: "AAA.NZ", price: 20, currency: "NZD", source: "Test price", asOf: "2026-10-13" },
      { ticker: "BBB.NZ", price: 10, currency: "NZD", source: "Test price", asOf: "2026-10-13" },
    ],
    fxNow: { NZD: 1 },
    fxSourced: true,
    fxSource: "Test rate",
    asOf: "2026-10-13T00:00:00.000Z",
    priceSource: "Test price",
  });
}

describe("KPI header reads the snapshot", () => {
  it("uses the snapshot figures for All, including a blank today and benchmark", () => {
    const snapshot = book();
    const span = periodSpanDays("all", snapshot.asOf);
    const annualised = annualisedAvailability(snapshot, "all", span);
    const view = kpiView(snapshot, {
      period: "all",
      percentMode: "simple",
      benchmarkId: "nzx50",
      spanDays: span,
      annualisedEnabled: annualised.enabled,
    });
    expect(view.netWorth).toBe(snapshot.kpis.netWorth);
    expect(view.cash).toBe(snapshot.kpis.cash);
    expect(view.contributions).toBe(snapshot.kpis.contributions);
    expect(view.totalReturn).toBe(snapshot.kpis.totalReturn);
    expect(view.segments.map((segment) => segment.figure)).toEqual([
      snapshot.kpis.capital,
      snapshot.kpis.income,
      snapshot.kpis.currency,
      snapshot.kpis.fees,
    ]);
    expect(view.percent).toBe(snapshot.kpis.simplePct);
    expect(view.today).toBe(snapshot.kpis.today);
    expect(view.today.display).toBe("—");
    expect(view.todayPct.display).toBe("—");
    expect(view.todayPct.reason).toBeTruthy();
    expect(view.benchmark.display).toBe("—");
    expect(view.benchmark.reason).toMatch(/NZX 50/);
    expect(view.periodNote).toBeNull();
    expect(view.chartReason).toMatch(/no value history/i);
    expect(annualised.enabled).toBe(false);
    expect(annualised.reason).toMatch(/90 days/);
  });

  it("blanks a short period instead of relabelling the all-time return", () => {
    const snapshot = book();
    const span = periodSpanDays("1M", snapshot.asOf);
    expect(span).toBe(30);
    const annualised = annualisedAvailability(snapshot, "1M", span);
    expect(annualised.enabled).toBe(false);
    const view = kpiView(snapshot, {
      period: "1M",
      percentMode: "simple",
      benchmarkId: "nzx50",
      spanDays: span,
      annualisedEnabled: false,
    });
    expect(view.totalReturn.display).toBe("—");
    expect(view.totalReturn.reason).toMatch(/start of this period/i);
    expect(view.totalReturn.display).not.toBe(snapshot.kpis.totalReturn.display);
    expect(view.netWorth).toBe(snapshot.kpis.netWorth);
    expect(view.cash).toBe(snapshot.kpis.cash);
    expect(view.contributions.display).toBe("—");
    expect(view.periodNote).toMatch(/right now/);
    expect(returnSplitWeights(view.segments)).toBeNull();
  });

  it("offers per year from 90 days and still leaves the figure blank", () => {
    const snapshot = book();
    expect(periodSpanDays("3M", snapshot.asOf)).toBe(90);
    expect(annualisedAvailability(snapshot, "3M", 90).enabled).toBe(true);
    expect(annualisedAvailability(snapshot, "1D", 1).enabled).toBe(false);
    const view = kpiView(snapshot, {
      period: "3M",
      percentMode: "annualised",
      benchmarkId: "sp500",
      spanDays: 90,
      annualisedEnabled: true,
    });
    expect(view.percent.display).toBe("—");
    expect(view.percentLabel).toBe("% p.a.");
    expect(view.benchmark.reason).toMatch(/start of this period/i);
    const named = kpiView(snapshot, {
      period: "all",
      percentMode: "simple",
      benchmarkId: "sp500",
      spanDays: null,
      annualisedEnabled: false,
    });
    expect(named.benchmark.display).toBe("—");
    expect(named.benchmark.reason).toMatch(/S&P 500/);
  });

  it("round-trips the header query", () => {
    const params = new URLSearchParams();
    writeHeaderState(params, { period: "custom", from: "2026-01-01", to: "2026-10-13", percentMode: "annualised", benchmarkId: "btc" });
    expect(readHeaderState(params)).toEqual({
      period: "custom",
      from: "2026-01-01",
      to: "2026-10-13",
      percentMode: "annualised",
      benchmarkId: "btc",
    });
    expect(periodSpanDays("custom", "2026-10-13", { from: "2026-10-13", to: "2026-01-01" })).toBeLessThan(0);
  });
});

describe("unified holdings table reads the snapshot", () => {
  it("keeps the unfiltered grand total equal to net worth", () => {
    const snapshot = book();
    const table = buildHoldingsTable(snapshot, DEFAULT_HOLDINGS_QUERY, COLUMN_SETS.summary);
    expect(table.grand).toBe(snapshot.grand);
    expect(table.grand.value).toBe(snapshot.kpis.netWorth.value);
    expect(table.grand.display).toBe(snapshot.kpis.netWorth.display);
    expect(table.grandLabel).toBe("Grand total");
    expect(table.filteredNote).toBeNull();
    expect(table.matchesFullBook).toBe(true);
    for (const group of snapshot.groups) {
      const shown = table.groups.find((item) => item.id === group.id);
      expect(shown?.subtotal).toBe(group.marketValue);
    }
    const cash = table.groups.find((group) => group.id === "cash");
    expect(cash?.rows.map((row) => row.name)).toEqual(["Cash"]);
    expect(cash?.rows[0]?.cells.price?.figures[0]?.display).toBe("1.0000");
    expect(table.reconciliationLabel).toBe(snapshot.reconciliation.label);
  });

  it("sorts by market value without moving equal quantities", () => {
    const snapshot = book();
    const byValue = buildHoldingsTable(snapshot, { ...DEFAULT_HOLDINGS_QUERY, sortKey: "marketValue", sortDir: "desc" }, COLUMN_SETS.summary);
    expect(byValue.groups.find((group) => group.id === "shares")?.rows.map((row) => row.ticker)).toEqual(["AAA.NZ", "BBB.NZ"]);
    const byQty = buildHoldingsTable(snapshot, { ...DEFAULT_HOLDINGS_QUERY, sortKey: "qty", sortDir: "desc" }, COLUMN_SETS.summary);
    const order = snapshot.groups.find((group) => group.id === "shares")?.positions.map((position) => position.ticker);
    expect(byQty.groups.find((group) => group.id === "shares")?.rows.map((row) => row.ticker)).toEqual(order);
  });

  it("filters without changing the snapshot header", () => {
    const snapshot = book();
    const net = snapshot.kpis.netWorth.display;
    const table = buildHoldingsTable(snapshot, { ...DEFAULT_HOLDINGS_QUERY, q: "beta" }, COLUMN_SETS.summary);
    expect(snapshot.kpis.netWorth.display).toBe(net);
    expect(snapshot.filteredNote).toBeNull();
    expect(table.filteredNote).toBe("Filtered: 1 of 3");
    expect(table.grandLabel).toBe("Visible total");
    expect(table.groups.flatMap((group) => group.rows).map((row) => row.ticker)).toEqual(["BBB.NZ"]);
    expect(table.grand.value).toBe(snapshot.groups.find((group) => group.id === "shares")?.positions.find((position) => position.ticker === "BBB.NZ")?.marketValue.value);
  });

  it("shows a dash and a reason when a price is missing, and crypto stats say the source has no data", () => {
    const snapshot = buildPortfolioSnapshot({
      rows: [
        row({ _id: "dep", type: "deposit", trade_date: "2026-10-01", cash_nzd: 100, total: 100, ticker: "" }),
        row({
          _id: "btc",
          type: "buy",
          ticker: "BTC",
          asset_type: "crypto",
          asset_name: "Bitcoin",
          trade_date: "2026-10-02",
          quantity: 1,
          price: 10,
          currency: "USD",
          fx_rate: 1.7,
          cash_nzd: -17,
          total: -17,
        }),
      ],
      marks: [{ ticker: "BTC", price: null, currency: "USD", assetType: "crypto", reason: "No price is stored for this holding.", source: "Crypto quote" }],
      fxNow: { USD: 1.7, NZD: 1 },
      fxSourced: true,
      asOf: "2026-10-13",
    });
    expect(snapshot.kpis.netWorth.display).toBe("—");
    const table = buildHoldingsTable(snapshot, DEFAULT_HOLDINGS_QUERY, COLUMN_SETS.crypto);
    const btc = table.groups.flatMap((group) => group.rows).find((row) => row.ticker === "BTC");
    expect(btc?.cells.mktCap?.figures[0]?.display).toBe("—");
    expect(btc?.cells.mktCap?.figures[0]?.reason).toBe("source has no data");
    expect(btc?.cells.supply?.figures[0]?.reason).toBe("source has no data");
    const summary = buildHoldingsTable(snapshot, DEFAULT_HOLDINGS_QUERY, COLUMN_SETS.summary);
    const priced = summary.groups.flatMap((group) => group.rows).find((row) => row.ticker === "BTC");
    expect(priced?.cells.marketValue?.figures[0]?.display).toBe("—");
    expect(priced?.cells.marketValue?.figures[0]?.reason).toBeTruthy();
    expect(priced?.cells.day?.figures[0]?.display).toBe("—");
    expect(priced?.cells.unrealised?.figures[1]?.reason).toMatch(/not on this snapshot/);
  });

  it("groups a missing broker without inventing one", () => {
    const table = buildHoldingsTable(book(), { ...DEFAULT_HOLDINGS_QUERY, groupBy: "broker" }, COLUMN_SETS.summary);
    expect(table.groups.map((group) => group.label)).toEqual(["Broker was not stored"]);
    expect(table.grand.value).toBe(book().kpis.netWorth.value);
  });

  it("round-trips the table query", () => {
    const params = new URLSearchParams();
    writeHoldingsQuery(
      params,
      { ...DEFAULT_HOLDINGS_QUERY, q: "AAA", assetClass: "shares", market: "NZX", currency: "NZD", gain: "gain", open: "open", groupBy: "currency", sortKey: "qty", sortDir: "asc" },
      "income",
      ["income"]
    );
    const readBack = readHoldingsQuery(params);
    expect(readBack.q).toBe("AAA");
    expect(readBack.assetClass).toBe("shares");
    expect(readBack.groupBy).toBe("currency");
    expect(readBack.columnSet).toBe("income");
    expect(readBack.sortDir).toBe("asc");
  });
});

describe("PR3 leaves the existing dashboard rules in place", () => {
  it("gates the new block to a signed-in home and does not recompute totals in the view", () => {
    const dash = read("src/components/dashboard/PortfolioDashboard.tsx");
    const kpi = read("src/components/dashboard/KpiHeader.tsx");
    const table = read("src/components/dashboard/UnifiedHoldingsTable.tsx");
    const calc = read("src/components/dashboard/DashboardCalculator.tsx");
    const maths = read("src/components/dashboard/ShowTheMaths.tsx");
    expect(dash).toContain("isHome && !preview");
    expect(dash).toContain("<DashboardCalculator");
    expect(dash).toContain("duplicateHomeFiguresVisible");
    expect(dash).toContain("hideValueCards={!legacyHomeTotals}");
    expect(dash).toContain("resolveHoldingAction");
    expect(dash).toContain("input.target.stockId");
    expect(dash).toContain("metalSourceId: metal._id");
    expect(dash).toContain("stay until PR5");
    expect(dash).not.toMatch(/allStocks\.find\(\(row\) => row\.ticker/);
    expect(dash).toContain("ledgerLoading={!preview && !ledgerLoaded}");
    expect(dash).toContain("PL_AT_LATEST_PRICE");
    expect(dash).toContain("/api/portfolio/snapshot");
    expect(read("src/components/dashboard/ReturnsSplitCard.tsx")).toContain('label: "Other"');
    for (const source of [kpi, table, calc, maths]) {
      expect(source).not.toMatch(/\bgst\b/i);
      expect(source).not.toMatch(/gpt|claude|gemini|openai|swyftx|dexscreener/i);
      expect(source).not.toContain("roundMoney");
      expect(source).not.toContain("buildPortfolioSnapshot");
      expect(source).not.toContain("reduce(");
    }
    expect(read("src/lib/holdings-table.ts")).not.toMatch(/\bgst\b/i);
    expect(read("src/lib/dashboard-kpi.ts")).not.toMatch(/\bgst\b/i);
  });
});
