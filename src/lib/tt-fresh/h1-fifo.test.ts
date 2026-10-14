import { describe, it, expect } from "vitest";
import { allRealisedLines, realisedByTaxYear } from "@/lib/tax-realised";
import { fifoTotals } from "@/lib/fifo-cost";
import { taxableIncome } from "@/lib/taxable-income";
import type { TaxLedgerRow } from "@/lib/taxable-income";

// TT trial: buy 20 FPH.NZ @ 48.70 with NZ$2 fee, sell 20 @ 48.70 with NZ$5 fee → −NZ$7.00 everywhere.
const rows = [
  { _id: "b1", type: "buy", ticker: "FPH.NZ", asset_type: "stock", quantity: 20, price: 48.7, fees: 2, currency: "NZD", executed_at: "2026-10-14T10:00:00+13:00" },
  { _id: "s1", type: "sell", ticker: "FPH.NZ", asset_type: "stock", quantity: 20, price: 48.7, fees: 5, currency: "NZD", executed_at: "2026-10-14T11:00:00+13:00" },
] as unknown as TaxLedgerRow[];

describe("TT fresh H1 — one fee-inclusive FIFO figure", () => {
  it("includes the buy fee in lot cost and the sell fee in the disposal", () => {
    const [line] = allRealisedLines(rows);
    expect(line.realisedNzd).toBe(-7);
    expect(line.lots[0].costBasisNzd).toBe(976);
  });
  it("dashboard totals, /tax/realised and /tax/income agree", () => {
    expect(fifoTotals(rows, 2026).all).toBe(-7);
    expect(realisedByTaxYear(rows, 2027).combinedNzd).toBe(-7);
    expect(taxableIncome(rows, 2027).realisedNzd).toBe(-7);
  });
});
