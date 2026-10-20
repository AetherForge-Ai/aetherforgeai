import { describe, expect, it } from "vitest";
import { buildFifPaper, fifTotals, type FifPaper } from "@/lib/fif-working-paper";
import { fifCsv, fifPaperLines } from "@/lib/tax-pack";
import { dividendNotesPrefix } from "@/lib/dividend-ledger";
import { taxableIncome, type TaxLedgerRow } from "@/lib/taxable-income";
import { buildIr3Helper, ir3HelperCsv, ir3PaperLines, IR3_LABEL } from "./ir3-helper";
import { fdrForHolding, foreignTaxCredit, individualFifIncome, quickSaleAdjustment } from "./ir461";

const div = (ticker: string, when: string, g: number, w: number, i = 0, currency: "NZD" | "USD" | "AUD" = "USD"): TaxLedgerRow =>
  ({
    type: "dividend",
    ticker,
    asset_type: "stock",
    executed_at: when,
    currency,
    notes: dividendNotesPrefix({ grossNzd: g, imputationNzd: i, withholdingNzd: w, drpNzd: 0, fx: 1, currency, grossNative: g, withholdingNative: w, drpNative: 0, netCashNzd: g - w }),
  }) as unknown as TaxLedgerRow;

describe("G-31 IR461 (April 2026) worked examples", () => {
  it("(a) IR461 Company A quick sale: 5% x 2,000 x $22 = $2,200; FIF income $10,000 + $2,200 = $12,200", () => {
    const qsa = quickSaleAdjustment(10_000, [
      { kind: "buy", shares: 5_000, amountNzd: 110_000 },
      { kind: "sell", shares: 4_000, amountNzd: 100_000 },
      { kind: "buy", shares: 2_000, amountNzd: 44_000 },
    ]);
    expect(qsa.peakHoldingDifferential).toBe(2_000);
    expect(qsa.quickSaleAdjustmentNzd).toBe(2_200);
    expect(fdrForHolding({ openingNzd: 200_000, quickSaleNzd: qsa.quickSaleAdjustmentNzd })).toBe(12_200);
  });
  it("(b) Bill Murphy: FDR $15,000 vs CV below zero -> CV 0 is used (no FIF loss)", () => {
    expect(individualFifIncome(15000, -4000)).toEqual({ method: "CV", incomeNzd: 0 });
    expect(individualFifIncome(15000, 0)).toEqual({ method: "CV", incomeNzd: 0 });
    expect(individualFifIncome(1000, 2500.55)).toEqual({ method: "FDR", incomeNzd: 1000 });
  });
  it("(c) Swiss FTC: 30% withheld, credit capped at 15%", () => {
    expect(foreignTaxCredit({ jurisdiction: "CH", grossNzd: 1000, taxPaidNzd: 300 })).toBe(150);
    expect(foreignTaxCredit({ jurisdiction: "CH", grossNzd: 1000, taxPaidNzd: 300, nzTaxOnIncomeNzd: 105 })).toBe(105);
    expect(foreignTaxCredit({ jurisdiction: "XX", grossNzd: 1000, taxPaidNzd: 300 })).toBeNull();
  });
});

const overBook: TaxLedgerRow[] = [
  { type: "buy", ticker: "AAPL", asset_type: "stock", executed_at: "2025-01-10", quantity: 500, price: 200, currency: "USD", fx_rate: 1.7 },
  div("AAPL", "2025-08-15", 1000, 150),
  div("BHP.AX", "2025-09-20", 400, 0, 0, "AUD"),
  div("FBU.NZ", "2025-10-01", 72, 0, 28, "NZD"),
];
const overMarkets = [{ ticker: "AAPL", openingNzd: 180000, closingNzd: 190000 }];

describe("G-31 IR3 helper matches the H-9 pack to the cent", () => {
  const income = taxableIncome(overBook, 2026);
  const fif = buildFifPaper({ rows: overBook, markets: overMarkets, endingYear: 2026 });
  const h = buildIr3Helper({ income, fif });

  it("(e) FIF line = H-9 FDR total; 17B/17A = sums of IR1261 lines", () => {
    expect(fif.threshold).toBe("over");
    const t = fifTotals(fif.attributing);
    const fifLine = h.lines.find((l) => l.incomeType === "FIF income")!;
    expect(fifLine.grossNzd).toBe(individualFifIncome(t.fdrNzd, t.cvNzd)!.incomeNzd);
    expect(fifLine.jurisdiction).toBe("overseas");
    expect(fifLine.creditNzd).toBe(150); // US 15% cap on $1,000 gross; $150 withheld
    expect(h.lines.some((l) => l.incomeType === "Dividends" && l.jurisdiction === "US")).toBe(false); // not added again
    const asx = h.lines.find((l) => l.jurisdiction === "AU")!;
    expect(asx.grossNzd).toBe(400);
    const g = h.totals.find((x) => x.key === "overseas-income")!;
    const c = h.totals.find((x) => x.key === "overseas-tax")!;
    expect(g.box).toBe("17B");
    expect(c.box).toBe("17A");
    expect(g.valueNzd).toBe(Math.round((fifLine.grossNzd! + 400) * 100) / 100);
    expect(c.valueNzd).toBe(150);
  });
  it("NZ dividends stay out of Question 17", () => {
    expect(h.lines.some((l) => l.jurisdiction === "NZ")).toBe(false);
  });
  it("(f) label in page-facing lines, PDF lines and CSV header", () => {
    expect(IR3_LABEL).toBe("Indicative, not tax advice");
    expect(ir3PaperLines(h)[0]).toBe(IR3_LABEL);
    expect(ir3HelperCsv(h).split("\n")[0]).toContain(IR3_LABEL);
    expect(ir3HelperCsv(h)).toContain(`${String(g17(h))}`);
  });
  it("(f) tax year 2027 shows item names only", () => {
    const h27 = buildIr3Helper({ income: taxableIncome(overBook, 2027), fif: buildFifPaper({ rows: overBook, markets: overMarkets, endingYear: 2027 }) });
    expect(h27.boxesKnown).toBe(false);
    expect(h27.totals.every((t) => t.box === null)).toBe(true);
    expect(ir3PaperLines(h27).join("\n")).not.toMatch(/Box 17/);
    expect(ir3HelperCsv(h27)).not.toMatch(/Box 17/);
  });
});

function g17(h: ReturnType<typeof buildIr3Helper>): string {
  return h.totals[0].valueNzd!.toFixed(2);
}

describe("G-31 (d) under NZ$50k cost", () => {
  const book: TaxLedgerRow[] = [
    { type: "buy", ticker: "MSFT", asset_type: "stock", executed_at: "2025-01-10", quantity: 10, price: 400, currency: "USD", fx_rate: 1.7 },
    div("MSFT", "2025-06-10", 50, 7.5),
  ];
  const fif = buildFifPaper({ rows: book, markets: [{ ticker: "MSFT", openingNzd: 7000, closingNzd: 8000 }], endingYear: 2026 });
  const h = buildIr3Helper({ income: taxableIncome(book, 2026), fif });
  it("shows the exemption note, no FIF figure, dividends as overseas income", () => {
    expect(h.fifExempt).toBe(true);
    expect(h.lines.some((l) => l.incomeType === "FIF income")).toBe(false);
    expect(h.notes.join(" ")).toMatch(/FIF exemption note/);
    const us = h.lines.find((l) => l.jurisdiction === "US")!;
    expect(us.grossNzd).toBe(50);
    expect(us.creditNzd).toBe(7.5);
    expect(h.totals[0].valueNzd).toBe(50);
    expect(h.totals[1].valueNzd).toBe(7.5);
  });
});

describe("G-31 blank when the FIF paper cannot be calculated", () => {
  it("missing opening value leaves totals blank", () => {
    const fif = buildFifPaper({ rows: overBook, markets: [], endingYear: 2026 }) as FifPaper;
    const h = buildIr3Helper({ income: taxableIncome(overBook, 2026), fif });
    expect(h.totals[0].valueNzd).toBeNull();
  });
});

describe("G-31 quick sale wired into the FIF paper and IR3 17B", () => {
  const usd = (type: "buy" | "sell", executed_at: string, quantity: number, price: number): TaxLedgerRow =>
    ({ type, ticker: "AAPL", asset_type: "stock", executed_at, quantity, price, currency: "USD", fx_rate: 2 }) as TaxLedgerRow;
  // Company A in a ledger: 10,000 held at 1 Apr; buy 5,000 at $11 (x2 = $110,000); sell 4,000 at $12.50 ($100,000); buy 2,000 at $11 ($44,000).
  const book = [usd("buy", "2024-06-01", 10_000, 10), usd("buy", "2025-10-01", 5_000, 11), usd("sell", "2025-12-01", 4_000, 12.5), usd("buy", "2025-12-23", 2_000, 11)];
  const markets = [{ ticker: "AAPL", openingNzd: 200_000, closingNzd: 400_000 }];
  it("FDR = $10,000 + $2,200 quick sale = $12,200, shown as its own line, IR3 17B uses it", () => {
    const fif = buildFifPaper({ rows: book, markets, endingYear: 2026 });
    const p = fif.attributing[0];
    expect(p.fdrBaseNzd).toBe(10_000);
    expect(p.quickSaleNzd).toBe(2_200);
    expect(p.fdrNzd).toBe(12_200);
    const h = buildIr3Helper({ income: taxableIncome(book, 2026), fif });
    expect(h.lines.find((l) => l.incomeType === "FIF income")!.grossNzd).toBe(12_200);
    expect(fifPaperLines(fif).join("\n")).toMatch(/quick sale adjustment NZD 2200\.00 \(IR461/);
    expect(fifCsv(fif)).toMatch(/quick-sale adjustment \(IR461, in FDR\)",,,,2200\.00/);
  });
  it("no quick sale (buys only): totals unchanged, no quick-sale line", () => {
    const only = [usd("buy", "2024-06-01", 10_000, 10), usd("buy", "2025-10-01", 5_000, 11)];
    const fif = buildFifPaper({ rows: only, markets, endingYear: 2026 });
    expect(fif.attributing[0].quickSaleNzd).toBe(0);
    expect(fif.attributing[0].fdrNzd).toBe(10_000);
    expect(fifCsv(fif)).not.toMatch(/quick-sale/);
    expect(fifPaperLines(fif).join("\n")).not.toMatch(/quick sale adjustment NZD/);
  });
});
