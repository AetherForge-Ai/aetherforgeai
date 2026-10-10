import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { formatDisplayDate } from "@/lib/currency";
import { buildDividendRecord, withDividendNotes } from "@/lib/dividend-ledger";
import { nzTaxYearEnding, nzTaxYearLabel } from "@/lib/nz-tax-year";
import { taxableIncome, taxableIncomeCsv, type TaxLedgerRow } from "@/lib/taxable-income";

function read(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

function audDividend(when: string): TaxLedgerRow {
  const built = buildDividendRecord({
    grossNative: 100,
    imputationNzd: 0,
    withholdingNative: 15,
    drpNative: 20,
    currency: "AUD",
    fx: 1.0912,
  });
  if (!built.ok) throw new Error("fixture");
  return {
    type: "dividend",
    ticker: "CBA.AX",
    asset_type: "stock",
    executed_at: when,
    notes: withDividendNotes("", built.parts),
    cash_nzd: built.parts.netCashNzd,
  };
}

function nzDividend(when: string): TaxLedgerRow {
  const built = buildDividendRecord({
    grossNative: 100,
    imputationNzd: 28,
    withholdingNative: 33,
    drpNative: 0,
    currency: "NZD",
    fx: 1,
  });
  if (!built.ok) throw new Error("fixture");
  return {
    type: "dividend",
    ticker: "FBU.NZ",
    asset_type: "stock",
    executed_at: when,
    notes: withDividendNotes("", built.parts),
    cash_nzd: built.parts.netCashNzd,
  };
}

describe("NZ tax year", () => {
  it("runs from 1 April to 31 March and names the year by 31 March", () => {
    expect(nzTaxYearEnding("2026-03-31")).toBe(2026);
    expect(nzTaxYearEnding("2026-04-01")).toBe(2027);
    expect(nzTaxYearEnding("2026-10-10")).toBe(2027);
    expect(nzTaxYearEnding("2027-03-31")).toBe(2027);
    expect(nzTaxYearEnding("2027-04-01")).toBe(2028);
    expect(nzTaxYearLabel(2027)).toBe("1 Apr 2026 to 31 Mar 2027");
  });
});

describe("taxable income", () => {
  const rows: TaxLedgerRow[] = [
    nzDividend("2026-04-01"),
    audDividend("2026-10-10"),
    nzDividend("2026-03-31"),
    { type: "dividend", ticker: "AIR.NZ", asset_type: "stock", executed_at: "2026-05-20", cash_nzd: 25, notes: "" },
    { type: "sell", ticker: "AAPL", asset_type: "stock", executed_at: "2027-01-15", realized_pnl: 40.5 },
    { type: "sell", ticker: "MSFT", asset_type: "stock", executed_at: "2027-04-01", realized_pnl: 9 },
    { type: "sell", ticker: "ETH", asset_type: "crypto", executed_at: "2026-09-01" },
  ];

  it("sums the year ending 31 Mar 2027 and leaves the next year out", () => {
    // In the year: FBU gross 100.00 credits 28.00 withholding 33.00,
    // CBA gross 109.12 withholding 16.37 DRP 21.82, sell 40.50.
    // Totals: gross 209.12, credits 28.00, withholding 49.37, DRP 21.82, realised 40.50.
    // 31 Mar 2026 and 1 Apr 2027 are the neighbouring year.
    // Cash of 25.00 has no breakdown and is not added to gross.
    // The crypto sell stored no realised amount, so it is not counted as zero.
    const report = taxableIncome(rows, 2027);
    expect(report.label).toBe("1 Apr 2026 to 31 Mar 2027");
    expect(report.grossNzd).toBe(209.12);
    expect(report.imputationNzd).toBe(28);
    expect(report.withholdingNzd).toBe(49.37);
    expect(report.drpNzd).toBe(21.82);
    expect(report.realisedNzd).toBe(40.5);
    expect(report.legacyCashNzd).toBe(25);
    expect(report.legacyCount).toBe(1);
    expect(report.realisedMissing).toBe(1);
    expect(report.dividends.map((row) => row.ticker)).toEqual(["FBU.NZ", "AIR.NZ", "CBA.AX"]);
    expect(report.realised.map((row) => row.ticker)).toEqual(["ETH", "AAPL"]);

    const prior = taxableIncome(rows, 2026);
    expect(prior.grossNzd).toBe(100);
    expect(prior.realisedNzd).toBe(0);
    expect(prior.dividends).toHaveLength(1);

    const next = taxableIncome(rows, 2028);
    expect(next.realisedNzd).toBe(9);
    expect(next.grossNzd).toBe(0);
  });

  it("writes the year CSV with blank cells where a figure was not stored", () => {
    const report = taxableIncome(rows, 2027);
    const csv = taxableIncomeCsv(report, (value) => {
      const shown = formatDisplayDate(value);
      return shown === "—" ? "" : shown;
    });
    expect(csv.split("\n")[0]).toBe(
      "Tax year,Date,Holding,Kind,Gross NZD,Imputation credits NZD,Withholding NZD,DRP reinvestment NZD,Realised NZD,Label"
    );
    expect(csv).toContain(
      '1 Apr 2026 to 31 Mar 2027,1 Apr 2026,FBU.NZ,dividend,100.00,28.00,33.00,0.00,,"Indicative, not tax advice."'
    );
    expect(csv).toContain(
      '1 Apr 2026 to 31 Mar 2027,10 Oct 2026,CBA.AX,dividend,109.12,0.00,16.37,21.82,,"Indicative, not tax advice."'
    );
    expect(csv).toContain(
      '1 Apr 2026 to 31 Mar 2027,15 Jan 2027,AAPL,realised,,,,,40.50,"Indicative, not tax advice."'
    );
    expect(csv).toContain(
      '1 Apr 2026 to 31 Mar 2027,,,total,209.12,28.00,49.37,21.82,40.50,"Indicative, not tax advice."'
    );
    expect(csv).not.toContain("MSFT");
    expect(csv).not.toContain("[DIV:");
  });

  it("keeps the indicative label on the income page", () => {
    const page = read("src/app/tax/income/page.tsx");
    const taxWord = ["G", "ST"].join("");
    expect(page).toContain("TAX_INDICATIVE_LABEL");
    expect(page).not.toContain(taxWord);
    expect(page).not.toContain("does not yet produce tax reports");
  });
});
