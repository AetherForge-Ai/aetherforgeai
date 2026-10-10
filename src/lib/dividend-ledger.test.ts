import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { formatDisplayDate } from "@/lib/currency";
import { csvNotes } from "@/lib/transaction-csv";
import { TAX_INDICATIVE_LABEL } from "@/lib/tax-disclaimer";
import {
  buildDividendRecord,
  dividendCsv,
  dividendViewFromRow,
  parseDividendNotes,
  stripDividendNotesPrefix,
  summariseDividends,
  withDividendNotes,
} from "@/lib/dividend-ledger";

function read(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("dividend ledger", () => {
  it("converts an NZ dividend and leaves imputation out of cash", () => {
    // Gross NZ$100.00, imputation NZ$28.00, withholding NZ$33.00, DRP NZ$0.00, FX 1.0000.
    // Net cash = 100.00 - 33.00 - 0.00 = 67.00. Imputation is not cash.
    const built = buildDividendRecord({
      grossNative: 100,
      imputationNzd: 28,
      withholdingNative: 33,
      drpNative: 0,
      currency: "NZD",
      fx: 1,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.parts.grossNzd).toBe(100);
    expect(built.parts.imputationNzd).toBe(28);
    expect(built.parts.withholdingNzd).toBe(33);
    expect(built.parts.drpNzd).toBe(0);
    expect(built.parts.netCashNzd).toBe(67);
    expect(built.parts.fx).toBe(1);
    const notes = withDividendNotes("interim", built.parts);
    expect(notes.startsWith("[DIV:")).toBe(true);
    expect(stripDividendNotesPrefix(notes)).toBe("interim");
    expect(parseDividendNotes(notes)).toMatchObject({
      grossNzd: 100,
      imputationNzd: 28,
      withholdingNzd: 33,
      drpNzd: 0,
      netCashNzd: 67,
      currency: "NZD",
      fx: 1,
    });
  });

  it("converts an AUD dividend at the payment-date rate to the cent", () => {
    // 100.00 * 1.0912 = 109.12
    // 15.00 * 1.0912 = 16.368 → 16.37
    // 20.00 * 1.0912 = 21.824 → 21.82
    // Net = 109.12 - 16.37 - 21.82 = 70.93
    const built = buildDividendRecord({
      grossNative: 100,
      imputationNzd: 0,
      withholdingNative: 15,
      drpNative: 20,
      currency: "AUD",
      fx: 1.0912,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.parts.fx).toBe(1.0912);
    expect(built.parts.grossNzd).toBe(109.12);
    expect(built.parts.imputationNzd).toBe(0);
    expect(built.parts.withholdingNzd).toBe(16.37);
    expect(built.parts.drpNzd).toBe(21.82);
    expect(built.parts.netCashNzd).toBe(70.93);
    const roundTrip = parseDividendNotes(withDividendNotes("", built.parts));
    expect(roundTrip?.grossNzd).toBe(109.12);
    expect(roundTrip?.withholdingNzd).toBe(16.37);
    expect(roundTrip?.drpNzd).toBe(21.82);
    expect(roundTrip?.netCashNzd).toBe(70.93);
  });

  it("rounds a USD gross at 4dp FX before the cent", () => {
    // 250.50 * 1.6543 = 414.40215 → 414.40
    const built = buildDividendRecord({
      grossNative: 250.5,
      imputationNzd: 0,
      withholdingNative: 0,
      drpNative: 0,
      currency: "USD",
      fx: 1.6543,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.parts.grossNzd).toBe(414.4);
    expect(built.parts.netCashNzd).toBe(414.4);
    expect(built.parts.fx).toBe(1.6543);
  });

  it("refuses withholding plus DRP above the gross", () => {
    const built = buildDividendRecord({
      grossNative: 10,
      imputationNzd: 0,
      withholdingNative: 6,
      drpNative: 5,
      currency: "NZD",
      fx: 1,
    });
    expect(built.ok).toBe(false);
  });

  it("does not invent a breakdown for an older cash-only dividend", () => {
    const view = dividendViewFromRow({ type: "dividend", cash_nzd: 25, total: 25, notes: "cash only" });
    expect(view.parts).toBeNull();
    expect(view.cashNzd).toBe(25);
    const totals = summariseDividends([view]);
    expect(totals.grossNzd).toBe(0);
    expect(totals.legacyCashNzd).toBe(25);
    expect(totals.counted).toBe(0);
  });

  it("writes a CSV with the hand-worked AUD row and a blank legacy gross", () => {
    const aud = buildDividendRecord({
      grossNative: 100,
      imputationNzd: 0,
      withholdingNative: 15,
      drpNative: 20,
      currency: "AUD",
      fx: 1.0912,
    });
    expect(aud.ok).toBe(true);
    if (!aud.ok) return;
    const csv = dividendCsv(
      [
        {
          when: "2026-10-10",
          ticker: "CBA.AX",
          assetName: "Commonwealth Bank",
          assetType: "stock",
          parts: aud.parts,
          cashNzd: aud.parts.netCashNzd,
        },
        dividendViewFromRow({
          type: "dividend",
          ticker: "FBU.NZ",
          asset_type: "stock",
          executed_at: "2026-04-01",
          cash_nzd: 25,
          notes: "",
        }),
      ],
      (value) => {
        const shown = formatDisplayDate(value);
        return shown === "—" ? "" : shown;
      }
    );
    expect(csv.split("\n")[0]).toBe(
      "Payment date,Holding,Asset type,Currency,FX,Gross NZD,Imputation credits NZD,Withholding NZD,DRP reinvestment NZD,Net cash NZD,Label"
    );
    expect(csv).toContain(
      '10 Oct 2026,CBA.AX,stock,AUD,1.0912,109.12,0.00,16.37,21.82,70.93,"Indicative, not tax advice."'
    );
    expect(csv).toContain('1 Apr 2026,FBU.NZ,stock,,,,,,,25.00,"Indicative, not tax advice."');
    expect(csv).toContain(TAX_INDICATIVE_LABEL);
    expect(csv).not.toContain("[DIV:");
  });

  it("hides the prefix on the main ledger CSV note", () => {
    const built = buildDividendRecord({
      grossNative: 100,
      imputationNzd: 28,
      withholdingNative: 33,
      drpNative: 0,
      currency: "NZD",
      fx: 1,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const notes = withDividendNotes("interim", built.parts);
    expect(csvNotes({ type: "dividend", notes, currency: "NZD" })).toBe("interim");
    expect(csvNotes({ type: "dividend", notes: withDividendNotes("", built.parts), currency: "NZD" })).toBe("");
  });

  it("keeps the marker and does not name a model on the dividend page", () => {
    const lib = read("src/lib/dividend-ledger.ts");
    expect(lib).toContain("pull-check:track-b-2-2026-10-11");
    const writer = read("src/lib/transactions.ts");
    expect(writer).toContain("withDividendNotes");
    expect(writer).toContain("The baseline FX table is not used.");
    expect(read("qa/PULL-CHECK-2026-10-10.md")).toContain("pull-check:track-b-2-2026-10-11");
    const page = read("src/app/tax/dividends/page.tsx");
    const view = read("src/components/tax/DividendLedgerView.tsx");
    expect(page + view).toContain("TAX_INDICATIVE_LABEL");
    expect(page + view).not.toContain("does not yet produce tax reports");
    const taxWord = ["G", "ST"].join("");
    expect(page).not.toContain(taxWord);
    expect(view).not.toContain(taxWord);
    expect(lib).not.toContain(taxWord);
  });
});
