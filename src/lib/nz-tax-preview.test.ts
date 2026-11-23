import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { WhatIfSellLink } from "@/components/tax/WhatIfSellLink";
import { healthFlags, runtimeFlagState } from "@/lib/diag-flags";
import { nzTaxPreviewEnabled } from "@/lib/feature-flags";
import { buildFifPaper, fifTotals } from "@/lib/fif-working-paper";
import { buildIr3Helper } from "@/lib/ir3/ir3-helper";
import {
  NZ_TAX_PREVIEW_DISCLAIMER,
  NOT_ESTIMATED,
  previewNzTaxSale,
  previewSaleDate,
} from "@/lib/nz-tax-preview";
import { taxableIncome, type TaxLedgerRow } from "@/lib/taxable-income";

const read = (path: string) => readFileSync(path, "utf8");

const gate = vi.hoisted(() => ({
  calls: 0,
  user: null as null | {
    _id: string;
    name: string;
    email: string;
    image: null;
    subscription_status: null;
    subscription_plan: null;
    identityConflict?: boolean;
  },
  rows: [] as TaxLedgerRow[],
  yields: [] as { ticker: string; shares: number; purchasePrice: number | null; currentPrice: number | null }[],
  stocks: [] as { id: string; ticker: string; notes: string; shares: number; assetType: string }[],
  threshold: 50_000,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/components/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/lib/session", () => ({
  getCurrentUser: async () => {
    gate.calls += 1;
    return gate.user;
  },
  getStableSessionUser: async () => gate.user,
}));
vi.mock("@/lib/tax-book-server", () => ({
  loadTaxRows: async () => gate.rows,
  loadYieldHoldings: async () => gate.yields,
  loadStockNoteRows: async () => gate.stocks,
}));
vi.mock("@/lib/fif-setting.server", () => ({
  readFifThreshold: async () => gate.threshold,
}));

import { GET } from "@/app/api/tax/nz-preview/route";
import Page from "@/app/tax/what-if-sell/page";

function buy(partial: Partial<TaxLedgerRow> & Pick<TaxLedgerRow, "ticker" | "executed_at">): TaxLedgerRow {
  return {
    type: "buy",
    asset_type: "stock",
    quantity: 200,
    price: 100,
    currency: "USD",
    fx_rate: 1.6,
    ...partial,
  } as TaxLedgerRow;
}

const crossing: TaxLedgerRow[] = [
  buy({ ticker: "AAPL", executed_at: "2025-06-01" }),
  buy({ ticker: "MSFT", executed_at: "2025-06-01" }),
];

function sellRow(ticker: string, quantity: number, price: number, date: string, fx = 1.6): TaxLedgerRow {
  return {
    type: "sell",
    ticker,
    asset_type: "stock",
    executed_at: date,
    quantity,
    price,
    currency: "USD",
    fx_rate: fx,
  } as TaxLedgerRow;
}

afterEach(() => {
  vi.unstubAllEnvs();
  gate.calls = 0;
  gate.user = null;
  gate.rows = [];
  gate.yields = [];
  gate.stocks = [];
  gate.threshold = 50_000;
});

describe("NZ tax preview math uses the FIF paper", () => {
  it("crosses under NZ$50,000 of year-end cost while the year's peak test stays over", () => {
    const date = "2026-06-01";
    const before = buildFifPaper({ rows: crossing, markets: [], endingYear: 2027, thresholdNzd: 50_000 });
    const after = buildFifPaper({
      rows: [...crossing, sellRow("MSFT", 200, 10, date)],
      markets: [],
      endingYear: 2027,
      thresholdNzd: 50_000,
    });
    const beforeCost = fifTotals(before.attributing).costNzd;
    const afterCost = fifTotals(after.attributing).costNzd;
    expect(beforeCost).toBeGreaterThan(50_000);
    expect(afterCost).toBeLessThan(50_000);
    expect(before.threshold).toBe("over");
    expect(after.threshold).toBe("over");

    const preview = previewNzTaxSale({
      rows: crossing,
      markets: [],
      sale: { ticker: "msft", quantity: 200, price: 10, date },
      thresholdNzd: 50_000,
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.yearEndCostBeforeNzd).toBe(beforeCost);
    expect(preview.yearEndCostAfterNzd).toBe(afterCost);
    expect(preview.dropsUnderDeMinimis).toBe(true);
    expect(preview.peakCostBeforeNzd).toBe(before.peakCostNzd);
    expect(preview.peakCostAfterNzd).toBe(after.peakCostNzd);
    expect(preview.peakThresholdAfter).toBe("over");
    expect(preview.openingBeforeNzd).toBeNull();
    expect(preview.fdrBeforeNzd).toBeNull();
    expect(preview.cvBeforeNzd).toBeNull();
    expect(preview.ir3IncomeBeforeNzd).toBeNull();
    const text = preview.lines.join("\n");
    expect(text).toContain("drop under");
    expect(text).toContain("does not change the highest cost");
    expect(text).toContain(NOT_ESTIMATED);
    expect(text).not.toMatch(/\b(proven|accurate|IRD-ready)\b/i);
    expect(crossing).toHaveLength(2);
  });

  it("a small sale that stays over the threshold does not claim a drop under", () => {
    const preview = previewNzTaxSale({
      rows: crossing,
      markets: [],
      sale: { ticker: "MSFT", quantity: 1, price: 10, date: "2026-06-01" },
      thresholdNzd: 50_000,
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.yearEndCostAfterNzd).toBeGreaterThan(50_000);
    expect(preview.dropsUnderDeMinimis).toBe(false);
    expect(preview.lines.join("\n")).not.toContain("would drop under");
    expect(preview.lines.join("\n")).toContain("not under");
  });

  it("cost left exactly at NZ$50,000 is not under the de minimis", () => {
    const rows = [buy({ ticker: "AAPL", executed_at: "2025-06-01", quantity: 375, price: 100, fx_rate: 1.6 })];
    const preview = previewNzTaxSale({
      rows,
      markets: [],
      sale: { ticker: "AAPL", quantity: 62.5, price: 80, date: "2026-06-01" },
      thresholdNzd: 50_000,
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.yearEndCostBeforeNzd).toBe(60_000);
    expect(preview.yearEndCostAfterNzd).toBe(50_000);
    expect(preview.dropsUnderDeMinimis).toBe(false);
    expect(preview.lines.join("\n")).toContain("not under");
  });

  it("FDR, CV and IR3 match the existing helper when opening and closing values are stored", () => {
    const rows = [
      buy({ ticker: "AAPL", executed_at: "2025-01-10", quantity: 100, price: 10, fx_rate: 2 }),
      buy({ ticker: "AAPL", executed_at: "2025-10-01", quantity: 20, price: 11, fx_rate: 2 }),
    ];
    const markets = [{ ticker: "AAPL", openingNzd: 20_000, closingNzd: 21_000 }];
    const date = "2025-12-01";
    const booked = sellRow("AAPL", 20, 15, date, 2);
    const before = buildFifPaper({ rows, markets, endingYear: 2026, thresholdNzd: 50_000 });
    const after = buildFifPaper({ rows: [...rows, booked], markets, endingYear: 2026, thresholdNzd: 50_000 });
    const ir3After = buildIr3Helper({ income: taxableIncome([...rows, booked], 2026), fif: after });
    const preview = previewNzTaxSale({
      rows,
      markets,
      sale: { ticker: "AAPL", quantity: 20, price: 15, date },
      thresholdNzd: 50_000,
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(fifTotals(after.attributing).fdrNzd).not.toBe(fifTotals(before.attributing).fdrNzd);
    expect(preview.fdrBeforeNzd).toBe(fifTotals(before.attributing).fdrNzd);
    expect(preview.fdrAfterNzd).toBe(fifTotals(after.attributing).fdrNzd);
    expect(preview.cvBeforeNzd).toBe(fifTotals(before.attributing).cvNzd);
    expect(preview.cvAfterNzd).toBe(fifTotals(after.attributing).cvNzd);
    expect(preview.openingBeforeNzd).toBe(20_000);
    expect(preview.openingAfterNzd).toBe(20_000);
    expect(preview.ir3IncomeAfterNzd).toBe(ir3After.totals.find((row) => row.key === "overseas-income")?.valueNzd);
    expect(preview.ir3TaxAfterNzd).toBe(ir3After.totals.find((row) => row.key === "overseas-tax")?.valueNzd);
    expect(preview.lines.join("\n")).toContain("FDR opening value stays");
    expect(preview.lines.join("\n")).not.toContain(`Fair dividend rate income is ${NOT_ESTIMATED}`);
  });

  it("shows not estimated when the working paper cannot price the holding", () => {
    const missingRate = [buy({ ticker: "MSFT", executed_at: "2026-05-01", quantity: 10, price: 10, fx_rate: null })];
    const missing = previewNzTaxSale({
      rows: missingRate,
      markets: [],
      sale: { ticker: "MSFT", quantity: 1, price: 12, date: "2026-06-01" },
      thresholdNzd: 50_000,
    });
    expect(missing.ok).toBe(true);
    if (!missing.ok) return;
    expect(buildFifPaper({ rows: missingRate, markets: [], endingYear: 2027, thresholdNzd: 50_000 }).threshold).toBe("unknown");
    expect(missing.dropsUnderDeMinimis).toBeNull();
    expect(missing.peakThresholdAfter).toBe("unknown");
    expect(missing.lines.join("\n")).toContain(NOT_ESTIMATED);

    const nz = previewNzTaxSale({
      rows: [buy({ ticker: "FBU.NZ", executed_at: "2025-06-01", quantity: 10, price: 5, currency: "NZD", fx_rate: 1 })],
      markets: [{ ticker: "FBU.NZ", openingNzd: 100, closingNzd: 120 }],
      sale: { ticker: "FBU.NZ", quantity: 1, price: 6, date: "2026-06-01" },
      thresholdNzd: 50_000,
    });
    expect(nz.ok).toBe(true);
    if (!nz.ok) return;
    expect(nz.openingBeforeNzd).toBeNull();
    expect(nz.fdrAfterNzd).toBeNull();
    expect(nz.cvAfterNzd).toBeNull();
    expect(nz.lines.join("\n")).toContain(`The effect on the FDR opening value for this holding is ${NOT_ESTIMATED}`);
    expect(nz.lines.join("\n")).toContain(`Comparative value is ${NOT_ESTIMATED}`);
  });

  it("refuses an oversell and a blank price without inventing a figure", () => {
    expect(previewNzTaxSale({ rows: crossing, markets: [], sale: { ticker: "MSFT", quantity: 201, price: 10, date: "2026-06-01" } }).ok).toBe(false);
    expect(previewNzTaxSale({ rows: crossing, markets: [], sale: { ticker: "MSFT", quantity: 0, price: 10 } }).ok).toBe(false);
    expect(previewNzTaxSale({ rows: crossing, markets: [], sale: { ticker: "", quantity: 1, price: 10 } }).ok).toBe(false);
    expect(previewSaleDate("2026-11-23", 2026)).toBe("2026-03-31");
    expect(previewSaleDate("2026-11-23", 2027)).toBe("2026-11-23");
  });
});

describe("NZ_TAX_PREVIEW flag", () => {
  it("defaults off and is reported on the health flag list", () => {
    expect(nzTaxPreviewEnabled({})).toBe(false);
    expect(nzTaxPreviewEnabled({ NZ_TAX_PREVIEW: "true" })).toBe(false);
    expect(nzTaxPreviewEnabled({ NZ_TAX_PREVIEW: "1" })).toBe(true);
    expect(runtimeFlagState({}).NZ_TAX_PREVIEW).toBe(false);
    expect(runtimeFlagState({ NZ_TAX_PREVIEW: "1" }).NZ_TAX_PREVIEW).toBe(true);
    expect(healthFlags(null, {}).NZ_TAX_PREVIEW).toEqual({ runtime: false, edge: null });
    expect(healthFlags("NZ_TAX_PREVIEW=1", { NZ_TAX_PREVIEW: "1" }).NZ_TAX_PREVIEW).toEqual({ runtime: true, edge: true });
    expect(healthFlags("NZ_TAX_PREVIEW=yes", {}).NZ_TAX_PREVIEW.edge).toBe(false);
  });

  it("is not set in deploy config", () => {
    for (const file of ["wrangler.jsonc", "wrangler.toml", ".env", ".env.production", ".env.local", ".dev.vars"]) {
      if (!existsSync(file)) continue;
      expect(read(file), file).not.toContain("NZ_TAX_PREVIEW");
    }
  });

  it("the holding link and the tax nav stay hidden while the flag is off", () => {
    expect(renderToStaticMarkup(createElement(WhatIfSellLink, { enabled: false, ticker: "MSFT" }))).not.toContain("What if I sell");
    const on = renderToStaticMarkup(createElement(WhatIfSellLink, { enabled: true, ticker: "msft", year: 2027 }));
    expect(on).toContain("What if I sell?");
    expect(on).toContain("/tax/what-if-sell?ticker=MSFT");
    expect(on).toContain("year=2027");
    expect(read("src/components/tax/TaxSectionNav.tsx")).not.toContain("what-if-sell");
    expect(read("src/components/dashboard/PortfolioDashboard.tsx")).toContain("enabled={nzTaxPreview}");
    expect(read("src/components/dashboard/PortfolioDashboard.tsx")).toContain("nzTaxPreview = false");
    expect(read("src/app/tax/fif/page.tsx")).toContain("enabled={nzTaxPreviewEnabled()}");
    expect(read("src/lib/dashboard-page.tsx")).toContain("nzTaxPreviewEnabled()");
  });
});

describe("NZ tax preview route", () => {
  it("flag off is a 404 with no preview, and does not read the book", async () => {
    vi.stubEnv("NZ_TAX_PREVIEW", "");
    gate.user = { _id: "u1", name: "Ada", email: "ada@example.com", image: null, subscription_status: null, subscription_plan: null };
    await expect(Page({ searchParams: Promise.resolve({ ticker: "MSFT" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(gate.calls).toBe(0);
    const res = await GET(new NextRequest("https://aetherforgeai.co.nz/api/tax/nz-preview?ticker=MSFT&qty=1&price=10"));
    expect(res.status).toBe(404);
    const body = await res.text();
    expect(body).not.toContain(NZ_TAX_PREVIEW_DISCLAIMER);
    expect(body).not.toContain("What if I sell");
    expect(read("src/app/tax/what-if-sell/page.tsx")).toMatch(/if \(!nzTaxPreviewEnabled\(\)\) notFound\(\)/);
    expect(read("src/app/api/tax/nz-preview/route.ts")).not.toMatch(/editRecord|insertRecord|export async function POST/);
  });

  it("flag on renders the preview and the disclaimer", async () => {
    vi.stubEnv("NZ_TAX_PREVIEW", "1");
    gate.user = { _id: "u1", name: "Ada", email: "ada@example.com", image: null, subscription_status: null, subscription_plan: null };
    gate.rows = crossing;
    gate.yields = [
      { ticker: "AAPL", shares: 200, purchasePrice: 100, currentPrice: 12 },
      { ticker: "MSFT", shares: 200, purchasePrice: 100, currentPrice: 10 },
    ];
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ ticker: "MSFT", qty: "200", date: "2026-06-01" }) }),
    );
    expect(html).toContain('data-af-nz-tax-preview-disclaimer');
    expect(html).toContain(NZ_TAX_PREVIEW_DISCLAIMER);
    expect(html).toContain("What if I sell?");
    expect(html).toContain("would drop under");
    expect(html).toContain(NOT_ESTIMATED);
    expect(html).toContain("at 10 USD");
    expect(html).toContain("current price stored on this holding");
    expect(html).not.toMatch(/\b(proven|accurate|IRD-ready)\b/i);
    expect(gate.calls).toBe(1);

    const res = await GET(new NextRequest("https://aetherforgeai.co.nz/api/tax/nz-preview?ticker=MSFT&qty=200&date=2026-06-01"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; disclaimer: string; data: { dropsUnderDeMinimis: boolean; lines: string[] } };
    expect(body.ok).toBe(true);
    expect(body.disclaimer).toBe(NZ_TAX_PREVIEW_DISCLAIMER);
    expect(body.data.dropsUnderDeMinimis).toBe(true);
    expect(body.data.lines.join("\n")).toContain(NOT_ESTIMATED);
  });

  it("flag on and signed out is a 404", async () => {
    vi.stubEnv("NZ_TAX_PREVIEW", "1");
    await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_NOT_FOUND");
    const res = await GET(new NextRequest("https://aetherforgeai.co.nz/api/tax/nz-preview"));
    expect(res.status).toBe(404);
  });
});
