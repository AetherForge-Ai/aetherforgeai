/** BS-02 (GOAL-LOCK row 68): InvestNow import against the EXAMPLE DATA fixture. Real layout unverified. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { importDuplicateKey, importWrites, planBrokerImport, type ColumnMap, type ImportTrade } from "@/lib/broker-import";
import { importFileProblem } from "@/lib/import-limits";
import { workbookToCsv } from "@/lib/import/xlsx";

const dir = path.join(process.cwd(), "src/lib/fixtures/broker-import/investnow");
const expected = JSON.parse(readFileSync(path.join(dir, "expected.json"), "utf8"));
const csv = (name: string) => readFileSync(path.join(dir, name), "utf8");
async function xlsxText(name: string): Promise<string> {
  const buf = readFileSync(path.join(dir, name));
  return workbookToCsv(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
}
const mapping = expected.mapping as ColumnMap;
const opts = { mapping, openingCashNzd: expected.openingCashNzd, broker: "investnow" as const };

type Book = { cashCents: number; holdings: Record<string, number>; costCents: number; batches: ImportTrade[][] };
const newBook = (): Book => ({ cashCents: Math.round(expected.openingCashNzd * 100), holdings: {}, costCents: 0, batches: [] });
function commit(book: Book, rows: ImportTrade[]) {
  for (const r of rows) {
    book.cashCents += Math.round(r.cashEffectNzd * 100);
    book.holdings[r.ticker] = (book.holdings[r.ticker] || 0) + (r.side === "buy" ? r.quantity : -r.quantity);
    if (r.side === "buy") book.costCents += Math.round(r.costNzd * 100);
  }
  book.batches.push(rows);
}
function undo(book: Book) {
  const rows = book.batches.pop() || [];
  for (const r of rows) {
    book.cashCents -= Math.round(r.cashEffectNzd * 100);
    book.holdings[r.ticker] = (book.holdings[r.ticker] || 0) - (r.side === "buy" ? r.quantity : -r.quantity);
    if (!book.holdings[r.ticker]) delete book.holdings[r.ticker];
    if (r.side === "buy") book.costCents -= Math.round(r.costNzd * 100);
  }
}

const sources: [string, () => Promise<string>][] = [
  ["CSV saved from the .xlsx", async () => csv("investnow-example.csv")],
  [".xlsx (values only)", () => xlsxText("investnow-example.xlsx")],
];

describe("BS-02 InvestNow EXAMPLE DATA (real-layout unverified)", () => {
  it("fixtures are labelled EXAMPLE DATA and real-layout unverified", () => {
    expect(csv("investnow-example.csv")).toMatch(/EXAMPLE DATA/);
    expect(csv("investnow-example.csv")).toMatch(/real-layout unverified/);
    expect(readFileSync(path.join(dir, "README.md"), "utf8")).toMatch(/Real-layout unverified/);
  });

  for (const [label, load] of sources) {
    it(`${label}: needs the column map until columns are matched (headers are not guessed)`, async () => {
      const plan = planBrokerImport(await load(), { broker: "investnow", openingCashNzd: expected.openingCashNzd });
      expect(plan.detection.broker).toBe("investnow");
      expect(plan.detection.label).toContain("Beta, layout not yet verified against a real export");
      expect(plan.detection.label).not.toMatch(/\bverified\b(?! against)/i);
      expect(importWrites(plan)).toBe(false);
    });

    it(`${label}: commits to the expected totals within NZ$0.01`, async () => {
      const plan = planBrokerImport(await load(), opts);
      expect(plan.error).toBeNull();
      expect(plan.broker).toBe("investnow");
      expect(plan.toWrite).toHaveLength(expected.rows);
      expect(importWrites(plan)).toBe(true);
      const book = newBook();
      commit(book, plan.toWrite);
      expect(book.holdings).toEqual(expected.holdings);
      expect(Math.abs(book.costCents / 100 - expected.buyCostNzd)).toBeLessThanOrEqual(0.01);
      expect(Math.abs(book.cashCents / 100 - expected.cashNzdAfter)).toBeLessThanOrEqual(0.01);
    });

    it(`${label}: re-upload adds 0 rows; undo restores totals to the cent`, async () => {
      const text = await load();
      const plan = planBrokerImport(text, opts);
      const again = planBrokerImport(text, { ...opts, existingKeys: plan.rows.map(importDuplicateKey) });
      expect(again.toWrite).toHaveLength(0);
      expect(importWrites(again)).toBe(false);
      const book = newBook();
      const before = JSON.stringify(book);
      commit(book, plan.toWrite);
      undo(book);
      expect(JSON.stringify({ ...book, batches: [] })).toBe(before);
    });
  }

  it("the InvestNow title row above the header is recognised without the picker", () => {
    const plan = planBrokerImport(csv("investnow-example.csv"), { mapping, openingCashNzd: expected.openingCashNzd });
    expect(plan.broker).toBe("investnow");
  });

  it("3 malformed rows give 3 row errors; the good rows still commit (CSV and .xlsx)", async () => {
    for (const text of [csv("investnow-example-bad-rows.csv"), await xlsxText("investnow-example-bad-rows.xlsx")]) {
      const plan = planBrokerImport(text, opts);
      expect(plan.unsupported).toHaveLength(expected.badRows);
      expect(plan.toWrite).toHaveLength(expected.rows);
      expect(importWrites(plan, true)).toBe(true);
    }
  });

  it("6 MB and non-xlsx/csv files are refused", () => {
    expect(importFileProblem({ size: 6 * 1024 * 1024, type: "", name: "ledger.xlsx" })).toMatch(/5 MB/);
    expect(importFileProblem({ size: 100, type: "", name: "ledger.xlsm" })).toMatch(/xlsx/);
    expect(importFileProblem({ size: 100, type: "", name: "ledger.xls" })).toMatch(/xlsx/);
    expect(importFileProblem({ size: 100, type: "application/pdf", name: "ledger.pdf" })).toMatch(/CSV/);
    expect(importFileProblem({ size: 100, type: "", name: "ledger.xlsx" })).toBeNull();
  });

  it("no Math.random in the import path", () => {
    for (const f of ["src/lib/broker-import.ts", "src/app/api/import/route.ts", "src/lib/import/xlsx.ts", "src/components/import/BrokerImportPanel.tsx", "src/lib/import-limits.ts"]) {
      expect(readFileSync(f, "utf8")).not.toContain("Math.random");
    }
  });
});

describe("BS-02 label (BS-02-VERIFY open)", () => {
  it("picker and import page show the Beta label and never claim verified", () => {
    const ui = readFileSync("src/components/import/BrokerImportPanel.tsx", "utf8");
    expect(ui).toContain("InvestNow (Beta, layout not yet verified against a real export)</option>");
    expect(ui.match(/Beta, layout not yet verified against a real export/g)?.length).toBe(2);
    expect(ui).not.toMatch(/InvestNow[^<\n]*\(verified|layout is verified/i);
  });
});
