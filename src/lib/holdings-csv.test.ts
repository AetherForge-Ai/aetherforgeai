import { describe, expect, it } from "vitest";
import { parseHoldingsCsv, parseHoldingsDate } from "@/lib/holdings-csv";

describe("holdings CSV import", () => {
  it("reads ticker, units, price paid, and a date when one is present", () => {
    const csv = [
      "ticker,units,price paid,date",
      "FPH.NZ,120,32.50,2026-03-04",
      "BTC,0.5,98000,4/3/2026",
      "AAPL,2,180",
    ].join("\n");
    const parsed = parseHoldingsCsv(csv);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toEqual([
      { ticker: "FPH.NZ", units: 120, pricePaid: 32.5, date: "2026-03-04", assetType: "stock" },
      { ticker: "BTC", units: 0.5, pricePaid: 98000, date: "2026-03-04", assetType: "crypto" },
      { ticker: "AAPL", units: 2, pricePaid: 180, assetType: "stock" },
    ]);
  });

  it("accepts a headerless file and quoted commas", () => {
    const parsed = parseHoldingsCsv('BHP.AX,10,"1,990.00",1/7/2026\n');
    expect(parsed.rows[0]).toMatchObject({
      ticker: "BHP.AX",
      units: 10,
      pricePaid: 1990,
      date: "2026-07-01",
    });
  });

  it("rejects an unreadable date instead of inventing one", () => {
    const parsed = parseHoldingsCsv("ticker,units,price paid,date\nFPH.NZ,1,10,not-a-date\n");
    expect(parsed.rows).toHaveLength(0);
    expect(parsed.errors[0]).toMatch(/date/i);
  });

  it("treats a slash date as day then month", () => {
    expect(parseHoldingsDate("4/10/2026")).toBe("2026-10-04");
  });
});
