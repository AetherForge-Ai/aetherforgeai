import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildDividendRecord, withDividendNotes } from "@/lib/dividend-ledger";
import {
  buildFifPaper,
  comparativeValue,
  fdrIncome,
  fifThreshold,
  fifThresholdSentence,
  readFifMarkets,
  stripFifMarketNotes,
  withFifMarketNotes,
} from "@/lib/fif-working-paper";
import type { TaxLedgerRow } from "@/lib/taxable-income";

function read(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

function buy(partial: Partial<TaxLedgerRow> & Pick<TaxLedgerRow, "ticker" | "executed_at">): TaxLedgerRow {
  return {
    type: "buy",
    asset_type: "stock",
    quantity: 100,
    price: 10,
    currency: "USD",
    fx_rate: 1.6,
    ...partial,
  };
}

function paperFor(
  rows: TaxLedgerRow[],
  markets: { ticker: string; openingNzd: number | null; closingNzd: number | null }[] = [],
  year = 2027
) {
  return buildFifPaper({ rows, markets, endingYear: year });
}

function grossDividend(ticker: string, when: string, grossNative: number): TaxLedgerRow {
  const built = buildDividendRecord({
    grossNative,
    imputationNzd: 0,
    withholdingNative: 0,
    drpNative: 0,
    currency: "NZD",
    fx: 1,
  });
  if (!built.ok) throw new Error("fixture");
  return {
    type: "dividend",
    ticker,
    asset_type: "stock",
    executed_at: when,
    notes: withDividendNotes("", built.parts),
    cash_nzd: built.parts.netCashNzd,
  };
}

describe("FIF working paper", () => {
  it("uses 5% of the entered opening value and the comparative value formula", () => {
    const paper = paperFor(
      [
        buy({ ticker: "AAPL", executed_at: "2025-06-01", quantity: 100, price: 10, fx_rate: 1.6 }),
        grossDividend("AAPL", "2026-09-01", 50),
      ],
      [{ ticker: "AAPL", openingNzd: 1800, closingNzd: 2000 }]
    );
    expect(paper.attributing).toHaveLength(1);
    const aapl = paper.attributing[0];
    expect(aapl.costNzd).toBe(1600);
    expect(aapl.fdrNzd).toBe(90);
    expect(aapl.gainsNzd).toBe(50);
    expect(aapl.costsInYearNzd).toBe(0);
    expect(aapl.cvNzd).toBe(250);
    expect(fdrIncome(1800)).toBe(90);
    expect(comparativeValue({ openingNzd: 1800, closingNzd: 2000, gainsNzd: 50, costsNzd: 0 })).toBe(250);
    expect(paper.peakCostNzd).toBe(1600);
    expect(paper.threshold).toBe("under");
    expect(fifThresholdSentence(paper)).toBe(
      "Highest attributing cost in this income year is NZ$1,600.00. That is under NZ$50,000.00."
    );
  });

  it("leaves Australian, New Zealand, crypto and metals out of the $50,000 total", () => {
    const paper = paperFor([
      buy({ ticker: "AAPL", executed_at: "2025-06-01", quantity: 100, price: 10, fx_rate: 1.6 }),
      buy({ ticker: "CBA.AX", executed_at: "2025-06-01", quantity: 100, price: 100, currency: "AUD", fx_rate: 1 }),
      buy({ ticker: "FBU.NZ", executed_at: "2025-06-01", quantity: 100, price: 5, currency: "NZD", fx_rate: 1 }),
      buy({ ticker: "ETH", asset_type: "crypto", executed_at: "2025-06-01", quantity: 2, price: 100, currency: "USD", fx_rate: 1.6 }),
      buy({ ticker: "GOLD", asset_type: "metal", executed_at: "2025-06-01", quantity: 1, price: 4000, currency: "NZD", fx_rate: 1 }),
    ]);
    expect(paper.peakCostNzd).toBe(1600);
    expect(paper.australian.map((row) => row.ticker)).toEqual(["CBA.AX"]);
    expect(paper.australian[0].costNzd).toBe(10000);
    expect(paper.australian[0].fdrNzd).toBeNull();
    expect(paper.australian[0].cvNzd).toBeNull();
    expect(paper.newZealand).toEqual(["FBU.NZ"]);
    expect(paper.notShares).toEqual(["ETH", "GOLD"]);
  });

  it("reports exactly NZ$50,000.00 as at the limit, and one cent over as over", () => {
    const at = paperFor([
      buy({ ticker: "MSFT", executed_at: "2026-05-01", quantity: 4000, price: 10, fx_rate: 1.25 }),
    ]);
    expect(at.peakCostNzd).toBe(50000);
    expect(fifThreshold(50000)).toBe("at-limit");
    expect(fifThresholdSentence(at)).toBe(
      "Highest attributing cost in this income year is NZ$50,000.00. That is exactly NZ$50,000.00."
    );

    const over = paperFor([
      buy({ ticker: "MSFT", executed_at: "2026-05-01", quantity: 4000, price: 10, fx_rate: 1.25 }),
      buy({ ticker: "MSFT", executed_at: "2026-05-02", quantity: 1, price: 10, fx_rate: 1.25 }),
    ]);
    expect(over.peakCostNzd).toBe(50012.5);
    expect(over.threshold).toBe("over");
    expect(over.attributing[0].costNzd).toBe(50012.5);
  });

  it("keeps the peak at the pre-sale cost and does not apply a quick sale adjustment", () => {
    const paper = paperFor(
      [
        buy({ ticker: "AAPL", executed_at: "2026-05-01", quantity: 100, price: 10, fx_rate: 1.6 }),
        {
          type: "sell",
          ticker: "AAPL",
          asset_type: "stock",
          executed_at: "2026-06-01",
          quantity: 40,
          price: 12,
          currency: "USD",
          fx_rate: 1.6,
        },
      ],
      [{ ticker: "AAPL", openingNzd: 1800, closingNzd: 2000 }]
    );
    const aapl = paper.attributing[0];
    expect(aapl.costNzd).toBe(960);
    expect(paper.peakCostNzd).toBe(1600);
    expect(aapl.costsInYearNzd).toBe(1600);
    expect(aapl.gainsNzd).toBe(768);
    expect(aapl.fdrNzd).toBe(90);
    expect(aapl.cvNzd).toBe(-632);
  });

  it("does not guess a rate, does not treat a blank opening as zero, and ignores corrections", () => {
    const missing = paperFor([
      buy({ ticker: "MSFT", executed_at: "2026-05-01", quantity: 1, price: 10, fx_rate: null }),
    ]);
    expect(missing.peakCostNzd).toBeNull();
    expect(missing.threshold).toBe("unknown");
    expect(missing.attributing[0].costNzd).toBeNull();
    expect(fifThresholdSentence(missing)).toBe(
      "The $50,000 cost test is not calculated because a foreign attributing buy has no stored exchange rate."
    );

    const blank = paperFor(
      [buy({ ticker: "AAPL", executed_at: "2025-06-01" })],
      [{ ticker: "AAPL", openingNzd: null, closingNzd: 2000 }]
    );
    expect(blank.attributing[0].fdrNzd).toBeNull();
    expect(blank.attributing[0].cvNzd).toBeNull();
    expect(fdrIncome(0)).toBe(0);

    const zero = paperFor(
      [buy({ ticker: "AAPL", executed_at: "2025-06-01" })],
      [{ ticker: "AAPL", openingNzd: 0, closingNzd: 2000 }]
    );
    expect(zero.attributing[0].fdrNzd).toBe(0);

    const corrected = paperFor([
      buy({ ticker: "AAPL", executed_at: "2025-06-01", quantity: 100, price: 10, fx_rate: 1.6 }),
      {
        type: "correction",
        ticker: "AAPL",
        asset_type: "stock",
        executed_at: "2026-05-01",
        quantity: 100000,
        price: 10,
        currency: "USD",
        fx_rate: 1.6,
      },
    ]);
    expect(corrected.peakCostNzd).toBe(1600);

    const legacy = paperFor([
      buy({ ticker: "AAPL", executed_at: "2025-06-01" }),
      { type: "dividend", ticker: "AAPL", asset_type: "stock", executed_at: "2026-08-01", cash_nzd: 25, notes: "" },
    ]);
    expect(legacy.attributing[0].gainsNzd).toBe(0);
    expect(legacy.attributing[0].omittedDividendCash).toBe(true);
  });

  it("stores market values in stock notes and keeps the rest of the note", () => {
    const notes = withFifMarketNotes("broker lot", 2027, 1800, 2000);
    expect(notes).toBe("[FIFMV:2027:o=1800.00;c=2000.00] broker lot");
    expect(readFifMarkets(notes)).toEqual([{ ticker: "", year: 2027, openingNzd: 1800, closingNzd: 2000 }]);
    expect(stripFifMarketNotes(notes)).toBe("broker lot");
    const closingOnly = withFifMarketNotes(notes, 2027, null, 2000);
    expect(closingOnly).toBe("[FIFMV:2027:c=2000.00] broker lot");
    expect(withFifMarketNotes(notes, 2027, null, null)).toBe("broker lot");
    const bothYears = withFifMarketNotes(notes, 2026, 100, null);
    expect(bothYears.startsWith("[FIFMV:2026:o=100.00][FIFMV:2027:o=1800.00;c=2000.00]")).toBe(true);
  });

  it("does not call an empty book under the threshold", () => {
    const paper = paperFor([]);
    expect(paper.peakCostNzd).toBe(0);
    expect(fifThresholdSentence(paper)).toBe("No attributing overseas shares on this book.");
  });

  it("cites the Inland Revenue pages and stays indicative", () => {
    const lib = read("src/lib/fif-working-paper.ts");
    const page = read("src/app/tax/fif/page.tsx");
    const view = read("src/components/tax/FifWorkingPaper.tsx");
    const taxWord = ["G", "ST"].join("");
    expect(lib + page + view).not.toContain(taxWord);
    expect(page).toContain("TAX_INDICATIVE_LABEL");
    expect(page).not.toContain("does not yet produce tax reports");
    expect(lib).toContain("pull-check:track-b-2-2026-10-11");
    expect(lib).toContain("https://www.ird.govt.nz/foreign-investment-funds");
    expect(lib).toContain("https://www.taxtechnical.ird.govt.nz/technical-decision-summaries/2026/tds-26-01");
    expect(lib).toContain("https://www.taxtechnical.ird.govt.nz/technical-decision-summaries/2023/tds-23-13");
    expect(lib).not.toContain("NZ$100.00");
    expect(view).not.toContain("[FIFMV:");
  });
});
