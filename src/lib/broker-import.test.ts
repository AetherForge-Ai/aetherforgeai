import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  importDuplicateKey,
  importFailureReport,
  importWriteOrder,
  importWrites,
  planBrokerImport,
  validateImportForWrite,
} from "@/lib/broker-import";
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
    const gate = route.indexOf("importWrites(preview, acknowledgeSkipped)");
    const check = route.indexOf("validateImportForWrite(committed");
    const write = route.indexOf("await applyTransaction");
    expect(gate).toBeGreaterThan(0);
    expect(check).toBeGreaterThan(gate);
    expect(write).toBeGreaterThan(check);
    expect(route).toContain("importFailureReport");
    expect(route).toContain("importWriteOrder");
    expect(route).toContain("fundBuys");
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
    expect(importWrites(plan)).toBe(false);
    expect(importWrites(plan, true)).toBe(true);
    expect(plan.totalsMessage).toMatch(/line \d+:/);
    expect(plan.totalsMessage).toMatch(/Dividend/);
    expect(plan.totalsMessage).toMatch(/Split/);
    expect(plan.fundingNeeded).toBe(true);
    expect(plan.fundingDeposits[0].note).toMatch(/paper cash negative/);
    expect(plan.fundingDeposits[0].note).toMatch(/XIRR/);
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

  it("keeps two identical same-day fills and drops only covered occurrences", () => {
    const text = [
      "Date,Type,Instrument code,Quantity,Price,Value,Currency",
      "15/01/2026,Buy,AIR.NZ,100,0.65,65.00,NZD",
      "15/01/2026,Buy,AIR.NZ,100,0.65,65.00,NZD",
    ].join("\n");
    const both = planBrokerImport(text, { openingCashNzd: 1000 });
    expect(both.duplicates).toHaveLength(0);
    expect(both.toWrite).toHaveLength(2);
    expect(both.importedTotals).toEqual({ NZD: 130 });
    expect(both.fundingDeposits).toHaveLength(0);

    const key = importDuplicateKey(both.rows[0]);
    const oneStored = planBrokerImport(text, { openingCashNzd: 1000, existingKeys: [key] });
    expect(oneStored.duplicates).toHaveLength(1);
    expect(oneStored.toWrite).toHaveLength(1);
    expect(oneStored.importedTotals).toEqual({ NZD: 65 });
    expect(oneStored.sourceTotals).toEqual({ NZD: 130 });
    expect(oneStored.totalsMessage).toMatch(/duplicate/);
    expect(oneStored.totalsMessage).toMatch(/not in the imported total/);

    const covered = planBrokerImport(text, { openingCashNzd: 1000, existingKeys: [key, key] });
    expect(covered.toWrite).toHaveLength(0);
    expect(covered.importedTotals).toEqual({});
    expect(importWrites(covered, true)).toBe(false);
  });

  it("lists skipped rows, blocks the save, and leaves them out of the imported total", () => {
    const text = [
      "Date,Type,Instrument code,Quantity,Price,Value,Currency",
      "15/01/2026,Buy,AIR.NZ,10,2.00,20.00,NZD",
      "16/01/2026,Split,AIR.NZ,10,2.00,20.00,NZD",
      "17/01/2026,Buy,FPH.NZ,not-a-number,2.00,20.00,NZD",
      "18/01/2026,Buy,MEL.NZ,4,5.00,99.00,NZD",
    ].join("\n");
    const plan = planBrokerImport(text, { openingCashNzd: 1000 });
    expect(plan.toWrite.map((row) => row.ticker)).toEqual(["AIR.NZ"]);
    expect(plan.importedTotals).toEqual({ NZD: 20 });
    expect(plan.unsupported.map((row) => row.reason).join(" ")).toMatch(/Split/);
    expect(plan.unsupported.map((row) => row.reason).join(" ")).toMatch(/could not be read/);
    expect(plan.unsupported.map((row) => row.reason).join(" ")).toMatch(/does not match/);
    expect(plan.totalsMessage).toMatch(/Split/);
    expect(plan.totalsMessage).toMatch(/could not be read/);
    expect(plan.totalsMessage).toMatch(/does not match/);
    expect(importWrites(plan)).toBe(false);
    expect(validateImportForWrite(plan, false)).toMatch(/Acknowledge/);
    expect(importWrites(plan, true)).toBe(true);
    expect(validateImportForWrite(plan, true)).toBeNull();
  });

  it("records a paper deposit only when chosen or required to avoid negative cash", () => {
    const text = ["Date,Type,Instrument code,Quantity,Price,Value,Currency", "15/01/2026,Buy,AIR.NZ,10,2.00,20.00,NZD"].join(
      "\n"
    );
    const funded = planBrokerImport(text, { openingCashNzd: 0 });
    expect(funded.fundingNeeded).toBe(true);
    expect(funded.fundingDeposits).toHaveLength(1);
    expect(funded.toWrite).toHaveLength(1);
    expect(funded.fundingDeposits[0].note).toMatch(/otherwise make paper cash negative/);
    expect(funded.fundingDeposits[0].note).toMatch(/XIRR/);
    expect(funded.importedTotals).toEqual({ NZD: 20 });

    const declined = planBrokerImport(text, { openingCashNzd: 0, fundBuys: false });
    expect(declined.fundingDeposits).toHaveLength(0);
    expect(declined.toWrite).toHaveLength(0);
    expect(declined.importedTotals).toEqual({});
    expect(declined.unsupported[0].reason).toMatch(/was not chosen/);
    expect(declined.unsupported[0].reason).toMatch(/XIRR/);
    expect(declined.totalsMessage).toMatch(/was not chosen/);

    const covered = planBrokerImport(text, { openingCashNzd: 50, fundBuys: false });
    expect(covered.fundingNeeded).toBe(false);
    expect(covered.fundingDeposits).toHaveLength(0);
    expect(covered.toWrite).toHaveLength(1);
  });

  it("validates before writing and reports a partial save", () => {
    const text = ["Date,Type,Instrument code,Quantity,Price,Value,Currency", "15/01/2026,Buy,AIR.NZ,10,2.00,20.00,NZD"].join(
      "\n"
    );
    const plan = planBrokerImport(text, { openingCashNzd: 100 });
    expect(validateImportForWrite(plan, true)).toBeNull();
    const order = importWriteOrder(plan);
    expect(order.map((step) => step.kind)).toEqual(["trade"]);
    const funded = planBrokerImport(text, { openingCashNzd: 0 });
    const fundedOrder = importWriteOrder(funded);
    expect(fundedOrder.map((step) => step.kind)).toEqual(["deposit", "trade"]);
    expect(fundedOrder[0].date <= fundedOrder[1].date).toBe(true);

    const broken = { ...plan, toWrite: [{ ...plan.toWrite[0], quantity: 0 }] };
    expect(validateImportForWrite(broken, true)).toMatch(/Nothing was written/);
    const report = importFailureReport({
      cause: "The book rejected the row.",
      writtenTrades: [{ date: "2026-01-15", side: "buy", ticker: "AIR.NZ" }],
      writtenDeposits: [{ date: "2026-01-15", amountNzd: 20 }],
    });
    expect(report).toContain("2026-01-15 buy AIR.NZ");
    expect(report).toContain("2026-01-15 NZ$20.00");
    expect(report).toMatch(/second import skips rows that match what was saved/);
    expect(
      importFailureReport({ cause: "The book rejected the row.", writtenTrades: [], writtenDeposits: [] })
    ).toMatch(/Nothing was saved/);
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
