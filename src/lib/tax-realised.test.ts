import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { formatDisplayDate } from "@/lib/currency";
import { realisedByTaxYear, realisedCsv, type RealisedReport } from "@/lib/tax-realised";
import type { TaxLedgerRow } from "@/lib/taxable-income";

function read(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

function row(partial: TaxLedgerRow): TaxLedgerRow {
  return partial;
}

const shareBook: TaxLedgerRow[] = [
  row({ type: "buy", ticker: "FBU.NZ", asset_type: "stock", executed_at: "2026-05-01", quantity: 10, price: 2, currency: "NZD", fx_rate: 1 }),
  row({ type: "buy", ticker: "FBU.NZ", asset_type: "stock", executed_at: "2026-06-01", quantity: 10, price: 3, currency: "NZD", fx_rate: 1 }),
  row({ type: "sell", ticker: "FBU.NZ", asset_type: "stock", executed_at: "2026-08-01", quantity: 15, price: 4, currency: "NZD", fx_rate: 1, fees_nzd: 0 }),
];

const cryptoBook: TaxLedgerRow[] = [
  row({ type: "buy", ticker: "ETH", asset_type: "crypto", executed_at: "2026-04-02", quantity: 2, price: 100, currency: "USD", fx_rate: 1.6 }),
  row({ type: "sell", ticker: "ETH", asset_type: "crypto", executed_at: "2026-09-01", quantity: 1, price: 150, currency: "USD", fx_rate: 1.7 }),
];

describe("realised profit and loss", () => {
  it("closes share lots oldest first", () => {
    const report = realisedByTaxYear(shareBook, 2027);
    expect(report.other).toHaveLength(1);
    const line = report.other[0];
    expect(line.pricePnlNzd).toBe(25);
    expect(line.fxPnlNzd).toBe(0);
    expect(line.feeNzd).toBe(0);
    expect(line.realisedNzd).toBe(25);
    expect(report.otherTotalNzd).toBe(25);
    expect(report.cryptoTotalNzd).toBe(0);
    expect(report.combinedNzd).toBe(25);
  });

  it("subtracts a NZ$1.00 sell fee from the FIFO gain", () => {
    const report = realisedByTaxYear(
      shareBook.map((entry) => (entry.type === "sell" ? { ...entry, fees_nzd: 1 } : entry)),
      2027
    );
    expect(report.other[0].pricePnlNzd).toBe(25);
    expect(report.other[0].feeNzd).toBe(1);
    expect(report.other[0].realisedNzd).toBe(24);
  });

  it("splits crypto price gain and FX gain in NZ$", () => {
    const report = realisedByTaxYear(cryptoBook, 2027);
    const line = report.crypto[0];
    expect(line.pricePnlNzd).toBe(85);
    expect(line.fxPnlNzd).toBe(10);
    expect(line.realisedNzd).toBe(95);
    expect(report.cryptoTotalNzd).toBe(95);
    expect(report.combinedNzd).toBe(95);
    expect(report.other).toHaveLength(0);
  });

  it("adds the two sections and keeps a disposal outside the year out", () => {
    const report = realisedByTaxYear(
      [
        ...shareBook,
        ...cryptoBook,
        row({ type: "sell", ticker: "FBU.NZ", asset_type: "stock", executed_at: "2027-04-01", quantity: 5, price: 4, currency: "NZD", fx_rate: 1 }),
        row({ type: "correction", ticker: "FBU.NZ", asset_type: "stock", executed_at: "2026-07-01", quantity: 100, price: 9, currency: "NZD", fx_rate: 1 }),
      ],
      2027
    );
    expect(report.otherTotalNzd).toBe(25);
    expect(report.cryptoTotalNzd).toBe(95);
    expect(report.combinedNzd).toBe(120);
    const next = realisedByTaxYear(
      [
        ...shareBook,
        row({ type: "sell", ticker: "FBU.NZ", asset_type: "stock", executed_at: "2027-04-01", quantity: 5, price: 4, currency: "NZD", fx_rate: 1 }),
      ],
      2028
    );
    expect(next.other[0].realisedNzd).toBe(5);
    expect(next.label).toBe("1 Apr 2027 to 31 Mar 2028");
  });

  it("leaves a missing rate blank and does not use a guessed rate", () => {
    const report = realisedByTaxYear(
      [
        row({ type: "buy", ticker: "AAPL", asset_type: "stock", executed_at: "2026-05-01", quantity: 1, price: 10, currency: "USD", fx_rate: null }),
        row({ type: "sell", ticker: "AAPL", asset_type: "stock", executed_at: "2026-06-01", quantity: 1, price: 12, currency: "USD", fx_rate: 1.6 }),
      ],
      2027
    );
    expect(report.other[0].realisedNzd).toBeNull();
    expect(report.otherTotalNzd).toBe(0);
    expect(report.blankCount).toBe(1);
  });

  it("writes the hand-worked CSV lines", () => {
    const report: RealisedReport = realisedByTaxYear([...shareBook, ...cryptoBook], 2027);
    const csv = realisedCsv(report, (value) => formatDisplayDate(value));
    expect(csv).toContain(
      '1 Apr 2026 to 31 Mar 2027,1 Aug 2026,FBU.NZ,other,15,25.00,0.00,0.00,25.00,"Indicative, not tax advice."'
    );
    expect(csv).toContain(
      '1 Apr 2026 to 31 Mar 2027,1 Sep 2026,ETH,crypto,1,85.00,10.00,0.00,95.00,"Indicative, not tax advice."'
    );
    expect(csv).toContain(
      '1 Apr 2026 to 31 Mar 2027,,,combined,,,,,120.00,"Indicative, not tax advice."'
    );
  });

  it("points the tax page at the working papers", () => {
    const page = read("src/components/tax/TaxPageContent.tsx");
    const realised = read("src/app/tax/realised/page.tsx");
    const taxWord = ["G", "ST"].join("");
    expect(page).not.toContain("does not yet produce tax reports");
    expect(page).toContain("TAX_INDICATIVE_LABEL");
    expect(page).toContain("/tax/dividends");
    expect(page).toContain("/tax/income");
    expect(page).toContain("/tax/fif");
    expect(page).toContain("/tax/realised");
    expect(page + realised).not.toContain(taxWord);
    expect(realised).toContain("TAX_INDICATIVE_LABEL");
    expect(read("src/lib/tax-realised.ts")).toContain("pull-check:track-b-2-2026-10-11");
  });
});
