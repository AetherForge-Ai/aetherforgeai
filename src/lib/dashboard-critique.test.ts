import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { COLUMN_SETS, buildHoldingsTable, DEFAULT_HOLDINGS_QUERY, ledgerForCash } from "@/lib/holdings-table";
import { incomeTaxSummary } from "@/lib/income-tax-summary";
import { buildPortfolioSnapshot, type SnapshotLedgerRow } from "@/lib/portfolio-snapshot";
import { isStoxOrKoinsRun, illustratedPathReportText, listedReportBody, plainReportPdf, reportBodyIsEmpty } from "@/lib/report-body";
import { planningAssumptionPct } from "@/lib/totalum-engine";

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

describe("dashboard critique", () => {
  it("does not list or save an empty Headmaster path", () => {
    expect(reportBodyIsEmpty("Headmaster illustrated path")).toBe(true);
    expect(listedReportBody({ executiveSummary: "Headmaster illustrated path" })).toBeNull();
    expect(illustratedPathReportText({ illustrated7dPct: Number.NaN, netWorthNZD: 1, issuedAtMs: Date.now() })).toBeNull();
    const text = illustratedPathReportText({
      illustrated7dPct: 1.25,
      netWorthNZD: 250000,
      issuedAtMs: Date.parse("2026-10-13T00:00:00.000Z"),
    });
    expect(text).toContain("Illustrated 7-day path +1.25%");
    expect(text).toContain("not a forecast");
    expect(text).toContain("13 Oct 2026");
    expect(text).toContain("Net worth then NZ$250,000.00");
    expect(text).toContain(
      `equities ${planningAssumptionPct("equities")}%, crypto ${planningAssumptionPct("crypto")}%, metals ${planningAssumptionPct("metals")}% a year`
    );
    expect(text).not.toMatch(/\b[A-Z]{1,5}\.(NZ|AX|L)\b/);
    const listed = listedReportBody({ payload: { illustratedPath: { illustrated7dPct: 1.25, netWorthNZD: 250000, issuedAtMs: Date.parse("2026-10-13T00:00:00.000Z") } } });
    expect(listed).toContain(text);
    expect(listed).toContain("Holdings");
    expect(listed).toContain("— Holding lines were not stored with this report.");
    expect(listed).not.toMatch(/\b[A-Z]{1,5}\.(NZ|AX|L)\b/);
    const pdf = plainReportPdf("Headmaster intelligence report", [text || ""]);
    expect(pdf.startsWith("%PDF")).toBe(true);
    const pdfText = [...pdf.matchAll(/\((?:\\.|[^\\)])*\) Tj/g)]
      .map((match) => match[0].slice(1, match[0].lastIndexOf(")")).replace(/\\([()\\])/g, "$1"))
      .join(" ");
    expect(pdfText).toContain("not a forecast");
    expect(pdfText).toContain("Issued 13 Oct 2026");
    expect(pdfText).not.toMatch(/\b[A-Z]{1,5}\.(NZ|AX|L)\b/);
    expect(isStoxOrKoinsRun({ bot: "headmaster", executiveSummary: text, textBody: text })).toBe(false);
    expect(isStoxOrKoinsRun({ bot: "stock", executiveSummary: "Stox wrote this book.", textBody: "Stox wrote this book." })).toBe(true);
    const saver = read("src/lib/totalum-service.ts");
    expect(saver).toContain("if (!body) return");
    expect(saver).not.toContain('executive_summary: "Headmaster illustrated path"');
  });

  it("puts a cash deposit on the cash row and keeps seven summary columns", () => {
    const snapshot = buildPortfolioSnapshot({
      rows: [row({ _id: "dep", type: "deposit", trade_date: "2026-10-01", cash_nzd: 250000, total: 250000, ticker: "" })],
      marks: [],
      fxNow: { NZD: 1 },
      fxSourced: true,
      fxSource: "Test rate",
      asOf: "2026-10-13T00:00:00.000Z",
      priceSource: "Test price",
    });
    const table = buildHoldingsTable(snapshot, DEFAULT_HOLDINGS_QUERY, COLUMN_SETS.summary);
    expect(COLUMN_SETS.summary).toHaveLength(7);
    expect(COLUMN_SETS.summary[0]).toBe("asset");
    const cash = table.groups.flatMap((group) => group.rows).find((item) => item.kind === "cash");
    expect(cash?.ledger.some((line) => line.type === "deposit" && line.cashNzd === 250000)).toBe(true);
    expect(ledgerForCash(snapshot, "NZD").some((line) => line.type === "deposit")).toBe(true);
    expect(cash?.cells.unrealised?.figures).toHaveLength(1);
    const drawer = read("src/components/dashboard/HoldingDetailDrawer.tsx");
    expect(drawer).toContain("Cash movements");
    expect(drawer).toContain("cash ? null");
  });

  it("keeps income and FIF as a dash until the ledger has the figures", () => {
    const snapshot = buildPortfolioSnapshot({
      rows: [row({ _id: "dep", type: "deposit", trade_date: "2026-10-01", cash_nzd: 250000, total: 250000, ticker: "" })],
      marks: [],
      fxNow: { NZD: 1 },
      fxSourced: true,
      asOf: "2026-10-13T00:00:00.000Z",
    });
    const summary = incomeTaxSummary(snapshot, 2027);
    expect(summary.empty).toBe(true);
    expect(summary.fif.display).toBe("—");
    expect(summary.fif.reason).toMatch(/no FIF figure/);
    expect(summary.dividends.display).toBe("—");
    expect(summary.realised.display).toBe("—");
    const panel = read("src/components/dashboard/IncomeTaxPanel.tsx");
    expect(panel).not.toContain("NZ$0.00");
    expect(panel).toContain("summary.fif.reason");
  });

  it("labels an older saved path from the payload and keeps a real Stox body", () => {
    const issuedAtMs = Date.parse("2026-10-13T00:00:00.000Z");
    const old = "Illustrated 7-day path +1.25%. Net worth on 13 Oct 2026: NZ$250,000.00.";
    const saved = listedReportBody({
      executiveSummary: old,
      textBody: old,
      payload: { illustratedPath: { illustrated7dPct: 1.25, netWorthNZD: 250000, issuedAtMs, holdsCrypto: true } },
    });
    expect(saved).toContain("not a forecast");
    expect(saved).toContain("Crypto projections are paused; the crypto sleeve uses the planning assumption only.");
    expect(saved).not.toMatch(/\b[A-Z]{1,5}\.(NZ|AX|L)\b/);
    expect(saved).not.toMatch(/\b(BTC|ETH|SOL|XRP)\b/);
    expect(saved).not.toContain("AIR.NZ");
    const stox = listedReportBody({
      textBody: "Stox wrote this book.",
      payload: { illustratedPath: { illustrated7dPct: 1.25, netWorthNZD: 250000, issuedAtMs } },
    });
    expect(stox).toBe("Stox wrote this book.");
  });

  it("freezes a market snapshot per exchange session, not the Auckland day", () => {
    const route = read("src/app/api/market-snapshot/route.ts");
    expect(route).toContain("pull-check:retest4-2026-10-11");
    expect(route).toContain('private, max-age=60');
    expect(route).toContain("commitExchangeBlock");
    expect(route).not.toContain("snapshotCloseKey");
    expect(route).not.toContain("max-age=3600");
    expect(read("src/lib/market-close-cache.ts")).toContain("45_000");
  });

  it("lands redirects on the tab bar and leaves API calls out of the offline worker", () => {
    const calc = read("src/components/dashboard/DashboardCalculator.tsx");
    expect(calc).toContain('id="dashboard-tabs"');
    expect(calc).toContain("overflow-x-auto");
    expect(calc).toContain("dashboard-tabs-interactive");
    const worker = read("src/lib/pwa-worker.ts");
    expect(worker).toContain('url.pathname.startsWith("/api/")');
    const tx = read("src/components/dashboard/TransactionsTab.tsx");
    expect(tx).toContain("The ledger did not load.");
    expect(tx).toContain("Try again");
    expect(tx).not.toContain("min-w-[48rem]");
    const center = read("src/components/dashboard/ReportCenter.tsx");
    expect(center).toContain("Next Stox run available now");
    expect(center).toContain("xl:grid-cols-3");
    expect(center).not.toContain("tracked independently");
    const dash = read("src/components/dashboard/PortfolioDashboard.tsx");
    expect(dash).toContain("hasBuy=");
    expect(dash).toContain("tradeCashInput");
    expect(dash).toContain('className="w-full md:hidden"');
    expect(dash).not.toContain("data-report-quota");
  });
});
