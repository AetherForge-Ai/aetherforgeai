import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { importDuplicateKey, importWrites, planBrokerImport } from "@/lib/broker-import";
import { readSupportHold, supportHold } from "@/lib/broker-import-hold";

function fixture(name: string): string {
  return readFileSync(path.join(process.cwd(), "src/lib/fixtures/broker-import", name), "utf8");
}

function keysOf(text: string) {
  const plan = planBrokerImport(text);
  return plan.rows.map(importDuplicateKey);
}

describe("B2-1 broker import", () => {
  it("keeps the commit behind a clean plan", () => {
    const route = readFileSync(path.join(process.cwd(), "src/app/api/import/route.ts"), "utf8");
    const gate = route.indexOf("importWrites(preview)");
    const write = route.indexOf("await applyTransaction");
    expect(gate).toBeGreaterThan(0);
    expect(write).toBeGreaterThan(gate);
    expect(route).toContain('body.confirm !== true || !importWrites(preview)');
  });

  it("imports the synthetic Sharesies file and matches the source to the cent", () => {
    const plan = planBrokerImport(fixture("sharesies.csv"));
    expect(plan.error).toBeNull();
    expect(plan.broker).toBe("sharesies");
    expect(plan.toWrite.map((row) => `${row.side}:${row.ticker}`)).toEqual(["buy:AIR.NZ", "sell:AAPL"]);
    expect(plan.unsupported.map((row) => row.reason).join(" ")).toMatch(/Dividend/);
    expect(plan.unsupported.map((row) => row.reason).join(" ")).toMatch(/Split/);
    expect(plan.importedTotals).toEqual({ NZD: 65, USD: 361 });
    expect(plan.sourceTotals).toEqual(plan.importedTotals);
    expect(plan.toWrite[1].fx).toBe(1.67);
    expect(importWrites(plan)).toBe(true);
  });

  it("imports the synthetic Hatch file", () => {
    const plan = planBrokerImport(fixture("hatch.csv"));
    expect(plan.error).toBeNull();
    expect(plan.broker).toBe("hatch");
    expect(plan.toWrite).toHaveLength(2);
    expect(plan.importedTotals).toEqual({ USD: 500 });
    expect(plan.sourceTotals).toEqual({ USD: 500 });
    expect(plan.toWrite[0].fee).toBe(3);
  });

  it("imports the synthetic IBKR file", () => {
    const plan = planBrokerImport(fixture("ibkr.csv"));
    expect(plan.error).toBeNull();
    expect(plan.broker).toBe("ibkr");
    expect(plan.toWrite.map((row) => `${row.date}:${row.side}:${row.ticker}`)).toEqual([
      "2026-03-04:buy:NVDA",
      "2026-03-05:sell:BHP.AX",
    ]);
    expect(plan.importedTotals).toEqual({ USD: 300.75, AUD: 451 });
    expect(plan.sourceTotals).toEqual(plan.importedTotals);
    expect(plan.toWrite[0].fee).toBe(1);
    expect(plan.toWrite[1].quantity).toBe(10);
  });

  it("maps a generic file when the member names the columns", () => {
    const text = fixture("generic.csv");
    const unmapped = planBrokerImport(text);
    expect(unmapped.needsMapping).toBe(true);
    expect(importWrites(unmapped)).toBe(false);
    expect(unmapped.toWrite).toHaveLength(0);

    const plan = planBrokerImport(text, {
      mapping: {
        date: "When",
        ticker: "Code",
        side: "Direction",
        quantity: "Qty",
        price: "Px",
        fee: "Fee",
        currency: "Ccy",
        fx: "Rate",
        value: "Amount",
      },
    });
    expect(plan.error).toBeNull();
    expect(plan.broker).toBe("generic");
    expect(plan.toWrite).toHaveLength(1);
    expect(plan.importedTotals).toEqual({ AUD: 610 });
    expect(plan.sourceTotals).toEqual({ AUD: 610 });
    expect(plan.toWrite[0].costNzd).toBe(669.06);
  });

  it("adds no rows when the same file is imported again", () => {
    for (const name of ["sharesies.csv", "hatch.csv", "ibkr.csv"]) {
      const text = fixture(name);
      const again = planBrokerImport(text, { existingKeys: keysOf(text) });
      expect(again.toWrite).toHaveLength(0);
      expect(again.fundingDeposits).toHaveLength(0);
      expect(importWrites(again)).toBe(false);
    }
  });

  it("writes nothing for a malformed file", () => {
    const plan = planBrokerImport(fixture("malformed.txt"));
    expect(plan.error).toMatch(/Nothing was written/);
    expect(plan.toWrite).toHaveLength(0);
    expect(plan.fundingDeposits).toHaveLength(0);
    expect(importWrites(plan)).toBe(false);

    const empty = planBrokerImport("");
    expect(empty.error).toMatch(/Nothing was written/);
    expect(importWrites(empty)).toBe(false);
  });

  it("keeps an unrecognised file only with consent", () => {
    const text = fixture("malformed.txt");
    expect(supportHold(text, false).kept).toBe(false);
    expect(supportHold(text, false).sha256).toBeUndefined();
    const held = supportHold(text, true);
    expect(held.kept).toBe(true);
    expect(held.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(held.bytes).toBeGreaterThan(0);
    expect(readSupportHold(held.sha256 || "")).toBe(text);
    expect(supportHold("   ", true).kept).toBe(false);
    const refused = supportHold(text, false);
    expect(refused.sha256).toBeUndefined();
  });
});
