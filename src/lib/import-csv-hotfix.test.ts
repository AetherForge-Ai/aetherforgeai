import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { detectBroker, importDuplicateKey, planBrokerImport } from "@/lib/broker-import";
import { preserveQuoteStamp } from "@/lib/dex-source";
import {
  columnMapStorageKey,
  commitImportInOrder,
  notesHaveBatch,
  readSavedColumnMap,
  stampImportNote,
  undoImportInOrder,
  writeSavedColumnMap,
  type ColumnMapStore,
  type ImportCommitTrade,
} from "@/lib/import-commit";
import { knownImportSymbol } from "@/lib/import-symbols";
import type { ImportWriteStep } from "@/lib/broker-import";

function fixture(name: string): string {
  return readFileSync(path.join(process.cwd(), "src/lib/fixtures/broker-import", name), "utf8");
}

function read(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

function memoryStore(): ColumnMapStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

describe("import csv hotfix", () => {
  it("detects Sharesies on sharesies-test.csv and the other broker shapes", () => {
    const text = fixture("sharesies-test.csv");
    const plan = planBrokerImport(text, { openingCashNzd: 1_000_000 });
    expect(plan.detection.label).toBe("Sharesies");
    expect(plan.detection.broker).toBe("sharesies");
    expect(plan.detection.confidence).toBe("high");
    expect(plan.detection.score).toBeGreaterThanOrEqual(0.9);
    expect(plan.broker).toBe("sharesies");

    const detected = (csv: string) => planBrokerImport(csv).detection;
    expect(detected("Date,Fund name,Type,Units,Price\n").label).toBe("Kernel");
    expect(detected("Trade Date,Symbol,Side,Units,Price,Brokerage,Currency\n").label).toBe("Stake");
    expect(detected("ClientAccountID,Buy/Sell,Symbol\n").label).toBe("IBKR");
    expect(detected("UTC Time,Pair,Side,Price,Executed\n").label).toBe("Binance");
    expect(detected("Date,From currency,To currency,From amount\n").label).toBe("Easy Crypto");
    expect(detected("Booked,What,Instrument,Units,Unit\n").label).toBe("Generic");
    expect(detected("Booked,What,Instrument,Units,Unit\n").confidence).toBe("low");
    expect(detectBroker).toBeTypeOf("function");
  });

  it("saves a column map per broker and uses it on the next file", () => {
    const store = memoryStore();
    const text = fixture("readable-generic.csv");
    const unmapped = planBrokerImport(text);
    expect(unmapped.needsMapping).toBe(true);
    expect(unmapped.detection.confidence).toBe("low");
    const mapping = {
      date: "Booked",
      ticker: "Instrument",
      side: "What",
      quantity: "Units",
      price: "Unit",
    };
    writeSavedColumnMap(store, "generic", mapping);
    expect(store.data.has(columnMapStorageKey("generic"))).toBe(true);
    const loaded = readSavedColumnMap(store, "generic");
    expect(loaded).toMatchObject(mapping);
    const planned = planBrokerImport(text, {
      mapping: {
        date: loaded?.date || "",
        ticker: loaded?.ticker || "",
        side: loaded?.side || "",
        quantity: loaded?.quantity || "",
        price: loaded?.price || "",
      },
      openingCashNzd: 10_000,
      reviewedRates: { "AUD|2026-04-02": 1.1 },
    });
    expect(planned.needsMapping).toBe(false);
    expect(planned.toWrite.map((row) => row.ticker)).toEqual(["WBC.AX"]);
    expect(read("src/components/import/BrokerImportPanel.tsx")).toContain("writeSavedColumnMap");
    expect(read("src/components/import/BrokerImportPanel.tsx")).toContain('data-testid="column-map"');
  });

  it("keeps AAPL and reports APPL as unknown on sharesies-test.csv", () => {
    expect(knownImportSymbol("AAPL")).toBe(true);
    expect(knownImportSymbol("APPL")).toBe(false);
    const text = fixture("sharesies-test.csv");
    const plan = planBrokerImport(text, { openingCashNzd: 1_000_000 });
    expect(plan.toWrite.map((row) => row.ticker)).toEqual(["AAPL"]);
    expect(plan.toWrite[0]?.brokerRef).toBe("ORD-AAPL-1");
    expect(plan.toWrite[0]?.cashEffectNzd).toBeLessThan(0);
    const unknown = plan.unsupported.find((row) => row.ticker === "APPL");
    expect(unknown?.reason).toMatch(/not on the symbol list/);
    expect(unknown?.reason).toMatch(/left as printed/);
    expect(plan.toWrite.some((row) => row.ticker === "APPL")).toBe(false);

    const named = planBrokerImport(
      ["ticker,units,price paid,date,fx", "APPL / APPLE INC,2,180,2026-03-04,1.65", "AAPL / APPLE INC,1,100,2026-03-05,1.65"].join("\n"),
      { openingCashNzd: 1_000_000 }
    );
    expect(named.toWrite.map((row) => row.ticker)).toEqual(["AAPL"]);
    expect(named.unsupported.some((row) => row.ticker === "APPL")).toBe(true);

    const line = String(unknown?.line || "");
    const fixed = planBrokerImport(text, { openingCashNzd: 1_000_000, tickerFixes: { [line]: "AAPL" } });
    expect(fixed.unsupported.some((row) => row.ticker === "APPL")).toBe(false);
    expect(fixed.toWrite.map((row) => row.ticker)).toEqual(["AAPL", "AAPL"]);
    expect(read("src/components/import/BrokerImportPanel.tsx")).toContain('data-testid="import-preview"');
    expect(read("src/components/dashboard/HoldingsCsvImport.tsx")).not.toContain('api.post("/api/stocks"');
  });

  it("skips duplicate hashes in the file and on the book", () => {
    const same = [
      "Date,Type,Instrument code,Quantity,Price,Currency,Order ID,Exchange rate",
      "12/10/2026,Buy,AAPL,1,180,USD,ORD-1,1.6700",
      "12/10/2026,Buy,AAPL,1,180,USD,ORD-1,1.6700",
    ].join("\n");
    const dupes = planBrokerImport(same, { openingCashNzd: 1_000_000 });
    expect(dupes.duplicates).toHaveLength(1);
    expect(dupes.toWrite).toHaveLength(1);

    const distinct = [
      "Date,Type,Instrument code,Quantity,Price,Currency,Order ID,Exchange rate",
      "12/10/2026,Buy,AAPL,1,180,USD,ORD-1,1.6700",
      "12/10/2026,Buy,AAPL,1,180,USD,ORD-2,1.6700",
    ].join("\n");
    const both = planBrokerImport(distinct, { openingCashNzd: 1_000_000 });
    expect(both.toWrite).toHaveLength(2);
    expect(importDuplicateKey(both.rows[0])).not.toBe(importDuplicateKey(both.rows[1]));
  });

  it("adds no rows when sharesies-test.csv is planned again", () => {
    const text = fixture("sharesies-test.csv");
    const first = planBrokerImport(text, { openingCashNzd: 1_000_000 });
    const again = planBrokerImport(text, {
      openingCashNzd: 1_000_000,
      existingKeys: first.rows.map(importDuplicateKey),
    });
    expect(again.toWrite).toHaveLength(0);
    expect(again.duplicates.map((row) => row.ticker)).toEqual(["AAPL"]);
    const route = read("src/app/api/import/route.ts");
    const gate = route.indexOf("body.confirm !== true || !importWrites");
    const commit = route.indexOf("await commitImportInOrder");
    expect(gate).toBeGreaterThan(0);
    expect(commit).toBeGreaterThan(gate);
    expect(route).toContain("deferCash: true");
  });

  it("keeps idem= when the batch stamp is added, and undoes that batch in order", async () => {
    const note = stampImportNote("Member note idem=trade-1", "impabc", "ORD-AAPL-1");
    expect(note).toContain("idem=trade-1");
    expect(note).toContain("batch=impabc");
    expect(note).toContain("ref=ORD-AAPL-1");
    const kept = preserveQuoteStamp(`${note} [audit 12 Oct 2026] FILLED buy qty=1 fill=180 USD live=n/a source=broker_import.`, null, null);
    expect(kept).toContain("idem=trade-1");
    expect(kept).toContain("batch=impabc");
    expect(kept).toContain("ref=ORD-AAPL-1");
    expect(kept).toContain("live=n/a");
    expect(notesHaveBatch(kept, "impabc")).toBe(true);
    expect(notesHaveBatch(kept, "other")).toBe(false);

    const calls: string[] = [];
    const outcome = await undoImportInOrder(["row-a", "row-b"], async (id) => {
      calls.push(id);
      if (id === "row-b") throw new Error("cash restore failed");
    });
    expect(calls).toEqual(["row-a", "row-b"]);
    expect(outcome.undone).toEqual(["row-a"]);
    expect(outcome.error).toMatch(/cash restore failed/);
    expect(read("src/app/api/import/route.ts")).toContain("planOrApplyLedgerReversal");
    expect(read("src/components/import/BrokerImportPanel.tsx")).toContain("Undo import");
  });

  it("writes the trade row before cash, and deletes that id when cash fails", async () => {
    const steps: ImportWriteStep[] = [
      { kind: "trade", date: "2026-10-12", line: 2, trade: undefined },
      { kind: "trade", date: "2026-10-13", line: 3, trade: undefined },
    ];
    const order: string[] = [];
    let tradeSettled = false;
    const result = await commitImportInOrder(steps, {
      writeTrade: async (step) => {
        order.push(`trade:${step.line}`);
        await new Promise((resolve) => setTimeout(resolve, 5));
        tradeSettled = true;
        const trade: ImportCommitTrade = { id: `tx-${step.line}`, pendingCash: 10, previousCash: 100 };
        return trade;
      },
      writeCash: async (step) => {
        order.push(`cash:${step.line}`);
        if (!tradeSettled) throw new Error("cash started before the trade id existed");
        throw new Error("cash write failed");
      },
      rollbackTrade: async (trade) => {
        order.push(`rollback:${trade.id}`);
      },
    });
    expect(order).toEqual(["trade:2", "cash:2", "rollback:tx-2"]);
    expect(result.rolledBack).toBe("tx-2");
    expect(result.written).toHaveLength(0);
    expect(result.error).toMatch(/cash write failed/);
    expect(order.includes("trade:3")).toBe(false);
  });
});
