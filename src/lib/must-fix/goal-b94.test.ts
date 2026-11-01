/** b94: H-10 all seven brokers committed to the cent, Easy Crypto dated-import check, H-9 CV golden cases through the working paper, P3 ticker height. pull-check:v3-b94-2026-11-01 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildDividendRecord, withDividendNotes } from "@/lib/dividend-ledger";
import { buildFifPaper, fifTotals } from "@/lib/fif-working-paper";
import { checkFillSanity, aucklandDateISO } from "@/lib/fill-integrity";
import { individualFifIncome } from "@/lib/ir3/ir461";
import type { TaxLedgerRow } from "@/lib/taxable-income";

const read = (p: string) => readFileSync(p, "utf8");

describe("b94 pins", () => {
  it("pins the build", () => {
    expect(read("public/build-version.txt").trim()).toBe("v3-b96-2026-11-02");
    expect(read("qa/PULL-CHECK-2026-10-12.md")).toContain("pull-check:v3-b94-2026-11-01");
  });
});

// ECB reference rates to NZD (frankfurter.dev, read 29 and 31 Oct 2026; 15 Mar 2026 is a Sunday: the 13 Mar rate).
const RATES = {
  "AUD|2026-03-15": 1.2086, "AUD|2026-06-16": 1.213, "AUD|2026-01-15": 1.1648, "AUD|2026-02-20": 1.1836,
  "USD|2026-01-15": 1.7417, "USD|2026-01-20": 1.7137, "AUD|2026-03-02": 1.1888, "AUD|2026-03-20": 1.2062,
  "USD|2026-04-01": 1.7322, "USD|2026-03-02": 1.6848,
};

// Hand-worked net cash in NZ$ (see goal-b90 and goal-b93 for the line-by-line working).
// IBKR: -477.30 + 191.18 - 348.17 = -634.29. Stake: -505.44 + 277.15 = -228.29.
const SEVEN = [
  { f: "asb", broker: "asb", cash: -202, hold: { "FPH.NZ": 6 } },
  { f: "jarden", broker: "jarden", cash: -458, hold: { "MFT.NZ": 6 } },
  { f: "commsec", broker: "commsec", cash: -723.19, hold: { "CBA.AX": 6 } },
  { f: "swyftx", broker: "swyftx", cash: -524.72, hold: { BTC: 0.005 } },
  { f: "easycrypto", broker: "easycrypto", cash: -931, hold: { BTC: 0.01 } },
  { f: "ibkr-commit", broker: "ibkr", cash: -634.29, hold: { "BHP.AX": 6, NVDA: 2 } },
  { f: "stake-commit", broker: "stake", cash: -228.29, hold: { AAPL: 1 } },
];

describe("b94 H-10 committed totals for all seven brokers", () => {
  it("each broker commits to its hand-worked cash to the cent; duplicate refused; undo restores", async () => {
    const { commitImport, emptyBook, undoImport } = await import("@/lib/import/book");
    let total = 0;
    for (const k of SEVEN) {
      const book = emptyBook(10000);
      const text = read(`src/lib/import/fixtures/${k.f}.csv`);
      const out = await commitImport(book, text, { reviewedRates: RATES });
      expect(out.ok, k.f).toBe(true);
      expect(Math.round((book.cashNzd - 10000) * 100), k.f).toBe(Math.round(k.cash * 100));
      for (const [t, q] of Object.entries(k.hold)) expect(book.holdings[t], `${k.f} ${t}`).toBeCloseTo(q, 8);
      total += book.cashNzd - 10000;
      expect((await commitImport(book, text, { reviewedRates: RATES })).duplicate).toBe(true);
      expect(undoImport(book, out.batchId!).ok).toBe(true);
      expect(Math.abs(book.cashNzd - 10000)).toBeLessThan(0.005);
    }
    expect((Math.round(total * 100) / 100).toFixed(2)).toBe("-3701.49");
  });
});

describe("b94 Easy Crypto: dated imports are not checked against today's crypto price", () => {
  const past = "2026-01-10";
  it("a past-dated broker import with live spot far away is OK when cash matches the fill", () => {
    const r = checkFillSanity({ ticker: "BTC", assetType: "crypto", quantity: 0.01, fillPrice: 101000, cashOrNotional: 1010, liveSpot: 180000, priceSource: "broker_import", tradeDate: past });
    expect(r.ok).toBe(true);
    expect(r.blocked).toBe(false);
  });
  it("a past-dated import whose cash disagrees with its own fill price is still blocked", () => {
    const r = checkFillSanity({ ticker: "BTC", assetType: "crypto", quantity: 0.01, fillPrice: 101000, cashOrNotional: 2500, liveSpot: 180000, priceSource: "broker_import", tradeDate: past });
    expect(r.blocked).toBe(true);
    expect(r.code).toBe("implied_mismatch");
  });
  it("a same-day import is still checked against the live price", () => {
    const r = checkFillSanity({ ticker: "BTC", assetType: "crypto", quantity: 0.01, fillPrice: 101000, cashOrNotional: 1010, liveSpot: 180000, priceSource: "broker_import", tradeDate: aucklandDateISO() });
    expect(r.ok).toBe(false);
  });
});

function hold(ticker: string, day: string, nzd: number, currency = "USD"): TaxLedgerRow {
  return { type: "buy", asset_type: "stock", ticker, executed_at: day, quantity: 1, price: nzd, currency, fx_rate: 1 } as TaxLedgerRow;
}
function dividend(ticker: string, day: string, grossNzd: number): TaxLedgerRow {
  const b = buildDividendRecord({ grossNative: grossNzd, imputationNzd: 0, withholdingNative: 0, drpNative: 0, currency: "NZD", fx: 1 });
  if (!b.ok) throw new Error("fixture");
  return { type: "dividend", ticker, asset_type: "stock", executed_at: day, notes: withDividendNotes("", b.parts), cash_nzd: b.parts.netCashNzd } as TaxLedgerRow;
}
function pick(rows: TaxLedgerRow[], markets: { ticker: string; openingNzd: number; closingNzd: number }[]) {
  const paper = buildFifPaper({ rows, markets, endingYear: 2026 });
  const t = fifTotals(paper.attributing);
  return { paper, t, choice: individualFifIncome(t.fdrNzd, t.cvNzd)! };
}

describe("b94 H-9 comparative value golden cases through the working paper", () => {
  it("G10 US + UK: FDR 5,000.00, CV 100.00, CV chosen", () => {
    const { paper, t, choice } = pick(
      [hold("VOO", "2024-06-01", 50000), hold("VOD.L", "2024-06-01", 35000, "GBP"), hold("VOO", "2025-08-01", 5000), dividend("VOO", "2025-09-01", 900), dividend("VOD.L", "2025-10-01", 1200)],
      [{ ticker: "VOO", openingNzd: 60000, closingNzd: 66000 }, { ticker: "VOD.L", openingNzd: 40000, closingNzd: 37000 }]
    );
    const by = Object.fromEntries(paper.attributing.map((p) => [p.ticker, p]));
    expect([by.VOO.cvNzd, by["VOD.L"].cvNzd]).toEqual([1900, -1800]);
    expect([t.fdrNzd, t.cvNzd]).toEqual([5000, 100]);
    expect([choice.method, choice.incomeNzd.toFixed(2)]).toEqual(["CV", "100.00"]);
  });
  it("G06 CV loss floored at zero", () => {
    const { t, choice } = pick([hold("VOO", "2024-06-01", 90000), hold("VTI", "2024-06-01", 50000)],
      [{ ticker: "VOO", openingNzd: 100000, closingNzd: 90000 }, { ticker: "VTI", openingNzd: 60000, closingNzd: 62000 }]);
    expect([t.fdrNzd, t.cvNzd]).toEqual([8000, -8000]);
    expect([choice.method, choice.incomeNzd.toFixed(2)]).toEqual(["CV", "0.00"]);
  });
  it("G08 CV below FDR with the dividend in gains: 3,000.00", () => {
    const { t, choice } = pick([hold("VOO", "2024-06-01", 90000), dividend("VOO", "2025-09-01", 1000)],
      [{ ticker: "VOO", openingNzd: 100000, closingNzd: 102000 }]);
    expect([t.fdrNzd, t.cvNzd]).toEqual([5000, 3000]);
    expect([choice.method, choice.incomeNzd.toFixed(2)]).toEqual(["CV", "3000.00"]);
  });
});

describe("b94 P3 home ticker height", () => {
  it("reserves the measured final ticker height at each breakpoint (284 / 201 / 179 px)", () => {
    for (const f of ["src/app/page.tsx", "src/components/LazyMarketTicker.tsx"]) {
      expect(read(f)).toMatch(/min-h-\[284px\][^"]*md:min-h-\[201px\][^"]*lg:min-h-\[179px\]/);
    }
  });
});
