import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { planBrokerImport } from "@/lib/broker-import";
import { documentAccess } from "@/lib/route-gate";
import { applyFifoToLedgerRows, backdatedRealisedNote, fifoTotals } from "@/lib/fifo-cost";
import { performanceReport, performanceSourceLine } from "@/lib/performance-math";
import { holdingBookValuation } from "@/lib/book-valuation";
import { splitReturns } from "@/lib/returns-split";
import { buildDividendRecord, dividendNotesPrefix } from "@/lib/dividend-ledger";
import { taxBookSummary, taxGrossDividendSentence } from "@/lib/tax-book";
import { fifoRemainingCostFx } from "@/lib/tax-realised";
import type { TaxLedgerRow } from "@/lib/taxable-income";

function read(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

function fixture(name: string): string {
  return readFileSync(path.join(process.cwd(), "src/lib/fixtures/broker-import", name), "utf8");
}

describe("pull-check:v3-retest8-2026-10-12", () => {
  it("keeps the marker and the already-fixed Sharesies and column-map behaviour", () => {
    expect(read("qa/PULL-CHECK-2026-10-12.md")).toContain("pull-check:v3-retest8-2026-10-12");
    const docs = read("docs/import-formats-2026-10-12.md");
    expect(docs).toContain("Instrument code");
    expect(docs).toContain("column map");
    const sharesies = planBrokerImport(fixture("sharesies.csv"), { fundBuys: true });
    expect(sharesies.broker).toBe("sharesies");
    expect(sharesies.toWrite.map((row) => row.ticker)).toEqual(["AIR.NZ", "AAPL"]);
    const named = planBrokerImport(fixture("sharesies-name.csv"), { openingCashNzd: 10000 });
    expect(named.broker).toBe("sharesies");
    const generic = planBrokerImport(fixture("readable-generic.csv"));
    expect(generic.broker).toBeNull();
    expect(generic.needsMapping).toBe(true);
    const panel = read("src/components/import/BrokerImportPanel.tsx");
    expect(panel).toContain("Match the columns");
    expect(panel).toContain("const [fundBuys, setFundBuys] = useState(false)");
    expect(panel).not.toContain("setFundBuys(false)");
    expect(panel).toContain("formatFxInput(row.fx)");
    expect(panel).toContain("row.fxLabel");
    expect(panel).toContain("The import did not answer in time.");
    expect(panel).toContain('role="alert"');
    const route = read("src/app/api/import/route.ts");
    expect(route).toContain("existingKeys: keysFrom(stored)");
    expect(route).toContain("backdatedRealisedNote");
  });

  it("withholds annualised XIRR under 90 days and does not double the source stop", () => {
    const report = performanceReport({
      points: [{ date: "2026-09-01", valueBeforeNzd: 0, flowNzd: 1000 }],
      endingNzd: 1100,
      asOf: "2026-10-01",
      source: "Example series",
    });
    expect(report.xirr.annualised).toBe(false);
    expect(report.xirr.value).toBeCloseTo(0.1, 4);
    expect(report.xirr.reason).toMatch(/under 90 days/);
    expect(report.twr.value).toBeCloseTo(0.1, 6);

    const absent = performanceReport({
      points: [{ date: "2026-01-15", valueBeforeNzd: 0, flowNzd: 100, valueKnown: false }],
      endingNzd: 110,
      asOf: "2026-10-12",
      source: "Stored mark on the holding.",
    });
    expect(absent.xirr.annualised).toBe(true);
    expect(absent.twr.value).toBeNull();
    expect(absent.twr.reason).toMatch(/book value before each deposit/);

    const priced = holdingBookValuation(
      [{ ticker: "AIR.NZ", shares: 10, currentPrice: 0.7, currency: "NZD", updatedAt: "2026-10-12T00:00:00.000Z" }],
      { NZD: 1, USD: 1.7, AUD: 1.1 },
      "2026-10-12"
    );
    expect(priced.ok).toBe(true);
    if (priced.ok) {
      const line = performanceSourceLine({
        value: 0.1,
        reason: null,
        asOf: priced.asOf,
        source: priced.source,
      });
      expect(line).toBe(
        "As of 12 Oct 2026. Source: Stored mark on the holding. NZ dollars use the exchange rate on the book. This is not a live price."
      );
      expect(line).not.toContain("..");
    }
  });

  it("maps gross 0.45 and withholding 0.07 onto the tax page sentence", () => {
    const built = buildDividendRecord({
      grossNative: 0.45,
      imputationNzd: 0,
      withholdingNative: 0.07,
      drpNative: 0,
      currency: "NZD",
      fx: 1,
    });
    expect(built.ok).toBe(true);
    if (built.ok === false) return;
    expect(built.parts.grossNzd).toBe(0.45);
    expect(built.parts.withholdingNzd).toBe(0.07);
    const book = taxBookSummary([
      {
        type: "dividend",
        cash_nzd: built.parts.netCashNzd,
        notes: dividendNotesPrefix(built.parts),
      },
    ]);
    expect(book.dividendsGrossNzd).toBe(0.45);
    expect(taxGrossDividendSentence(book.dividendsGrossNzd)).toBe(
      "Gross dividend, before withholding: NZ$0.45."
    );
    expect(read("src/lib/tax-book-server.ts")).toContain("dividendsGrossNzd: summary.dividendsGrossNzd");
    expect(read("src/app/tax/page.tsx")).toContain("dividendsGrossNzd");
  });

  it("sends /tax/income-summary to the income summary", () => {
    expect(documentAccess("/tax/income-summary")).toBe("public");
    expect(read("src/app/tax/income-summary/page.tsx")).toContain('redirect("/tax/income")');
  });

  it("computes the currency effect from the stored buy rate", () => {
    const rows: TaxLedgerRow[] = [
      {
        type: "buy",
        ticker: "AAPL",
        asset_type: "stock",
        executed_at: "2026-01-15",
        quantity: 10,
        price: 10,
        currency: "USD",
        fx_rate: 1.6,
      },
    ];
    expect(fifoRemainingCostFx(rows).get("AAPL")).toBeCloseTo(1.6, 4);
    const split = splitReturns(
      [
        {
          quantity: 10,
          costPrice: 10,
          markPrice: 12,
          currency: "USD",
          fxAtCost: fifoRemainingCostFx(rows).get("AAPL"),
          fxNow: 1.7,
          purchaseDate: "2020-01-15",
        },
      ],
      0
    );
    expect(split.currencyEffectNzd).toBe(10);
    expect(split.currencyNote).toMatch(/exchange rate/);
  });

  it("puts the FIFO read on a sell row that stored zero", () => {
    const rows: TaxLedgerRow[] = [
      {
        _id: "buy-air",
        type: "buy",
        ticker: "AIR.NZ",
        asset_type: "stock",
        executed_at: "2026-01-15",
        quantity: 100,
        price: 1,
        currency: "NZD",
        fx_rate: 1,
      },
      {
        _id: "sell-air",
        type: "sell",
        ticker: "AIR.NZ",
        asset_type: "stock",
        executed_at: "2026-06-01",
        quantity: 100,
        price: 1.5608,
        currency: "NZD",
        fx_rate: 1,
        fees_nzd: 0,
        realized_pnl: 0,
      },
    ];
    const shown = applyFifoToLedgerRows(rows, rows);
    expect(shown[1].realized_pnl).toBe(56.08);
    expect(fifoTotals(rows, 2026).all).toBe(56.08);
  });

  it("notes when a backdated fill changes an earlier FIFO sell", () => {
    const existing: TaxLedgerRow[] = [
      {
        _id: "june",
        type: "buy",
        ticker: "AIR.NZ",
        executed_at: "2026-06-01",
        quantity: 10,
        price: 2,
        currency: "NZD",
        fx_rate: 1,
      },
      {
        _id: "august",
        type: "sell",
        ticker: "AIR.NZ",
        executed_at: "2026-08-01",
        quantity: 10,
        price: 4,
        currency: "NZD",
        fx_rate: 1,
        fees_nzd: 0,
        realized_pnl: 0,
      },
    ];
    const later = backdatedRealisedNote(existing, [
      { date: "2026-09-01", ticker: "AIR.NZ", side: "buy", quantity: 10, price: 1, currency: "NZD", fx: 1 },
    ]);
    expect(later).toBeNull();
    const note = backdatedRealisedNote(existing, [
      { date: "2026-01-01", ticker: "AIR.NZ", side: "buy", quantity: 10, price: 1, currency: "NZD", fx: 1 },
    ]);
    expect(note).toMatch(/FIFO matches oldest lots first/);
    expect(note).toMatch(/AIR\.NZ on 1 Aug 2026 was \+NZ\$20\.00 and would be \+NZ\$30\.00/);
  });
});
