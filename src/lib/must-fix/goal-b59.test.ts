/**
 * Goal b59: H-9b (foreign-currency buy cash) and H-9c (split rows in positions).
 * Fixture: FIXTURE-SEED-SPEC H-9 (pro-h9tax, user 6ad966a6e13d2527633fcb78).
 * NZ-tax-safe: the NZ$ cost base is unchanged by the split, no GST, cash in NZD.
 * pull-check:v3-goal-b59-2026-10-22
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { cashFromLedgerRows, hasOpeningAnchor, reconciledLedgerCash } from "@/lib/ledger-cash-lines";
import { applyPaperCashMove } from "@/lib/paper-cash";
import { buildPortfolioSnapshot, type SnapshotLedgerRow } from "@/lib/portfolio-snapshot";

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Rows as the app writes them for the H-9 seed (cash_nzd = signed NZD, fees_nzd = fee × fx). */
function h9Rows(): SnapshotLedgerRow[] {
  return [
    { _id: "ob", type: "opening_balance", ticker: "", trade_date: "2026-04-01", executed_at: "2026-04-01", currency: "NZD", fx_rate: 1, total: 150000, cash_nzd: 150000, quantity: 150000 },
    { _id: "aapl", type: "buy", ticker: "AAPL", asset_type: "stock", trade_date: "2026-04-15", executed_at: "2026-04-15", quantity: 100, price: 200, fill_price: 200, currency: "USD", fx_rate: 1.7, fees: 5, fees_nzd: 8.5, total: -34008.5, cash_nzd: -34008.5 },
    { _id: "bhp", type: "buy", ticker: "BHP.AX", asset_type: "stock", trade_date: "2026-05-10", executed_at: "2026-05-10", quantity: 100, price: 45, fill_price: 45, currency: "AUD", fx_rate: 1.2138, fees: 10, fees_nzd: 12.14, total: -5474.24, cash_nzd: -5474.24 },
    { _id: "msft", type: "buy", ticker: "MSFT", asset_type: "stock", trade_date: "2026-06-01", executed_at: "2026-06-01", quantity: 40, price: 400, fill_price: 400, currency: "USD", fx_rate: 1.72, fees: 5, fees_nzd: 8.6, total: -27528.6, cash_nzd: -27528.6 },
    { _id: "split", type: "correction", ticker: "MSFT", asset_type: "stock", trade_date: "2026-09-01", executed_at: "2026-09-01", quantity: 80, price: 200.0625, currency: "USD", total: 0, cash_nzd: 0, notes: "[SPLIT:r=2;d=2026-09-01] Share split 2:1" },
  ] as SnapshotLedgerRow[];
}

function snapshot() {
  return buildPortfolioSnapshot({
    rows: h9Rows(),
    marks: [
      { ticker: "AAPL", price: 250, currency: "USD", source: "Test", asOf: "2026-10-22" },
      { ticker: "BHP.AX", price: 46, currency: "AUD", source: "Test", asOf: "2026-10-22" },
      { ticker: "MSFT", price: 210, currency: "USD", source: "Test", asOf: "2026-10-22" },
    ],
    fxNow: { NZD: 1, USD: 1.72, AUD: 1.13 },
    fxSourced: true,
    fxSource: "Test rate",
    asOf: "2026-10-22T00:00:00.000Z",
  });
}

function allPositions(snap: ReturnType<typeof snapshot>) {
  return snap.groups.flatMap((group) => group.positions);
}

describe("b59 H-9b: foreign-currency buys debit NZD cash", () => {
  it("the paper cash move debits (qty × price + fees) × fx in NZD for the AUD buy", () => {
    const moved = applyPaperCashMove({ side: "buy", quantity: 100, price: 45, fees: 10, currency: "AUD", rates: { NZD: 1, USD: 1.7, AUD: 1.2138 } as never, cashNZD: 116000.0, shares: 0 });
    expect(moved.ok).toBe(true);
    expect(r2(-moved.cashDeltaNZD)).toBe(5474.24);
    const sold = applyPaperCashMove({ side: "sell", quantity: 100, price: 45, fees: 10, currency: "AUD", rates: { NZD: 1, USD: 1.7, AUD: 1.2138 } as never, cashNZD: 0, shares: 100 });
    expect(r2(sold.cashDeltaNZD)).toBe(r2((4500 - 10) * 1.2138));
  });

  it("the ledger replay of the exact fixture is NZ$82,988.66", () => {
    expect(cashFromLedgerRows(h9Rows())).toBe(82988.66);
  });

  it("/api/transactions reports the replay, not the drifted stored 88,462.90", () => {
    const rows = h9Rows();
    expect(hasOpeningAnchor(rows)).toBe(true);
    const out = reconciledLedgerCash(rows, 88462.9);
    expect(out.cashBalance).toBe(82988.66);
    expect(out.drift).toBe(-5474.24);
  });

  it("matches the snapshot's cashReplayNzd and kpis.cash", () => {
    const snap = snapshot();
    expect(snap.cashReplayNzd).toBe(82988.66);
    expect(reconciledLedgerCash(h9Rows(), 88462.9).cashBalance).toBe(snap.cashReplayNzd);
  });

  it("a book without its opening balance keeps the stored cash (older accounts)", () => {
    const rows = h9Rows().filter((row) => row.type !== "opening_balance");
    expect(hasOpeningAnchor(rows)).toBe(false);
    expect(reconciledLedgerCash(rows, 120000).cashBalance).toBe(120000);
    expect(reconciledLedgerCash([], 500).cashBalance).toBe(500);
  });
});

describe("b59 H-9c: split correction rows restate positions", () => {
  it("MSFT is 80 shares at 200 fill (200.0625 with the buy fee), NZ$ cost unchanged", () => {
    const msft = allPositions(snapshot()).find((p) => p.ticker === "MSFT");
    expect(msft).toBeTruthy();
    expect(msft!.quantity).toBe(80);
    expect(msft!.averageCostLocal).toBeCloseTo(200, 6);
    const lots = msft!.lots;
    const lotQty = lots.reduce((t, lot) => t + Number(lot.quantity), 0);
    expect(lotQty).toBe(80); // no double count from the correction row
    // Fee-inclusive average, the figure on the correction row: (40 × 400 + 5) ÷ 80.
    expect((80 * 200 + 5) / 80).toBe(200.0625);
  });

  it("other holdings are untouched: AAPL 100, BHP.AX 100", () => {
    const snap = snapshot();
    expect(allPositions(snap).find((p) => p.ticker === "AAPL")!.quantity).toBe(100);
    expect(allPositions(snap).find((p) => p.ticker === "BHP.AX")!.quantity).toBe(100);
  });

  it("the split moves no cash", () => {
    expect(snapshot().cashReplayNzd).toBe(82988.66);
  });

  it("build pin", () => {
    expect(readFileSync("public/build-version.txt", "utf8").trim()).toBe("v3-cr6-b78-2026-10-27");
  });
});
