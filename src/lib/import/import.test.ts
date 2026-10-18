import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { commitImport, emptyBook, undoImport, DUPLICATE_FILE } from "@/lib/import/book";
import { previewImport } from "@/lib/import/plan";
import { contentHash } from "@/lib/import/hash";
import { FORMAT_SOURCES } from "@/lib/import/formats";
import { IMPORT_TOO_LARGE } from "@/lib/import/limits";
import type { ColumnMap } from "@/lib/import/types";

const DIR = path.join(process.cwd(), "src/lib/import/fixtures");
const read = (name: string) => readFileSync(path.join(DIR, name), "utf8");

interface Expected {
  broker: string;
  rows: number;
  cashNzd: number;
  errors?: number;
  skipped?: number;
  rates?: Record<string, number>;
}

const expected = JSON.parse(read("expected.json")) as Record<string, Expected>;

const GENERIC_MAP: ColumnMap = {
  date: "Booked",
  ticker: "Instrument",
  side: "What",
  quantity: "Units",
  price: "Unit price",
  fee: "Charge",
  currency: "Money code",
  fx: "NZD per unit",
};

function optionsFor(file: string, want: Expected) {
  return {
    reviewedRates: want.rates,
    ...(file === "generic.csv" ? { mapping: GENERIC_MAP } : {}),
  };
}

describe("H-10 broker parsers", () => {
  for (const [file, want] of Object.entries(expected)) {
    if (file === "bad-rows.csv") continue;
    it(`${file} commits to the expected NZ$ total within NZ$0.01`, async () => {
      const text = read(file);
      const book = emptyBook(100_000);
      const before = book.cashNzd;
      const preview = await previewImport(text, optionsFor(file, want));
      expect(book.cashNzd).toBe(before);
      expect(preview.broker).toBe(want.broker);
      expect(preview.toWrite).toHaveLength(want.rows);
      if (want.skipped != null) expect(preview.skipped).toHaveLength(want.skipped);
      expect(Math.abs(preview.cashNzd - want.cashNzd)).toBeLessThan(0.01);

      const outcome = await commitImport(book, text, optionsFor(file, want));
      expect(outcome.ok).toBe(true);
      expect(outcome.written).toBe(want.rows);
      expect(Math.abs(book.cashNzd - (100_000 + want.cashNzd))).toBeLessThan(0.01);
      expect(outcome.batchId).toBeTruthy();
    });
  }

  it("names a published source for every broker layout", () => {
    const brokers = new Set(Object.values(expected).map((row) => row.broker));
    for (const broker of brokers) {
      const source = FORMAT_SOURCES.find((row) => row.broker === broker);
      expect(source?.source.length).toBeGreaterThan(40);
    }
  });
});

describe("H-10 import rules", () => {
  it("rejects a duplicate upload by content hash and leaves the totals alone", async () => {
    const text = read("asb.csv");
    const book = emptyBook(50_000);
    const first = await commitImport(book, text);
    expect(first.ok).toBe(true);
    const cash = book.cashNzd;
    const holdings = { ...book.holdings };
    const again = await commitImport(book, text.replace(/\n/g, "\r\n"));
    expect(again.ok).toBe(false);
    expect(again.duplicate).toBe(true);
    expect(again.error).toBe(DUPLICATE_FILE);
    expect(again.written).toBe(0);
    expect(book.cashNzd).toBe(cash);
    expect(book.holdings).toEqual(holdings);
    expect(await contentHash(text)).toBe(await contentHash(text.replace(/\n/g, "\r\n")));
  });

  it("undo restores the cash and the holdings", async () => {
    const text = read("jarden.csv");
    const book = emptyBook(20_000);
    const outcome = await commitImport(book, text);
    expect(outcome.ok).toBe(true);
    expect(book.cashNzd).not.toBe(20_000);
    expect(book.holdings["MFT.NZ"]).toBeGreaterThan(0);
    const undone = undoImport(book, outcome.batchId || "");
    expect(undone.ok).toBe(true);
    expect(book.cashNzd).toBe(20_000);
    expect(book.holdings).toEqual({});
    expect(book.fileHashes).toEqual([]);
    const repeat = await commitImport(book, text);
    expect(repeat.ok).toBe(true);
    expect(Math.abs(book.cashNzd - (20_000 - 458))).toBeLessThan(0.01);
  });

  it("keeps 3 row errors and still commits the good rows", async () => {
    const text = read("bad-rows.csv");
    const book = emptyBook(1_000);
    const outcome = await commitImport(book, text);
    expect(outcome.ok).toBe(true);
    expect(outcome.preview.errors).toHaveLength(3);
    for (const error of outcome.preview.errors) {
      expect(error.message).toMatch(/^Line \d+: .+/);
      expect(error.message).toMatch(/not saved/i);
    }
    expect(outcome.written).toBe(2);
    expect(Math.abs(book.cashNzd - (1_000 - 125))).toBeLessThan(0.01);
    expect(book.holdings["AIR.NZ"]).toBe(100);
    expect(book.holdings["FPH.NZ"]).toBe(2);
  });

  it("rejects a 6 MB file before it is parsed", async () => {
    const text = `x`.repeat(6 * 1024 * 1024);
    const book = emptyBook(10);
    const outcome = await commitImport(book, text);
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toBe(IMPORT_TOO_LARGE);
    expect(outcome.written).toBe(0);
    expect(book.cashNzd).toBe(10);
    expect(book.batches).toHaveLength(0);
    const preview = await previewImport(text);
    expect(preview.unreadable).toBe(true);
    expect(preview.rows).toHaveLength(0);
  });

  it("does not use Math.random anywhere in the import path", () => {
    const files = walk("src/lib/import").concat(["src/app/api/import/route.ts", "src/app/import/page.tsx", "src/app/import/import-client.tsx"]);
    for (const file of files) {
      if (!/\.(ts|tsx)$/.test(file) || file.endsWith(".test.ts")) continue;
      expect(readFileSync(path.join(process.cwd(), file), "utf8"), file).not.toContain("Math.random");
    }
  });

  it("asks for a column map and then commits the generic file", async () => {
    const text = read("generic.csv");
    const unmapped = await previewImport(text);
    expect(unmapped.needsMapping).toBe(true);
    expect(unmapped.toWrite).toHaveLength(0);
    const book = emptyBook(0);
    expect((await commitImport(book, text)).written).toBe(0);
    expect(book.cashNzd).toBe(0);
    const mapped = await commitImport(book, text, { mapping: GENERIC_MAP });
    expect(mapped.ok).toBe(true);
    expect(Math.abs(book.cashNzd - -206.28)).toBeLessThan(0.01);
  });

  it("reads an IBKR activity statement when a reviewed rate is supplied", async () => {
    const text = [
      "Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,C. Price,Proceeds,Comm/Fee,Basis,Realized P/L,MTM P/L,Code",
      'Trades,Data,Order,Stocks,USD,AAPL,"2026-01-15, 10:30:00",2,180.00,180.00,-360.00,-1.00,361.00,0,0,O',
    ].join("\n");
    const missing = await previewImport(text);
    expect(missing.broker).toBe("ibkr");
    expect(missing.toWrite).toHaveLength(0);
    expect(missing.errors[0]?.message).toMatch(/No NZD rate/);
    const priced = await previewImport(text, { reviewedRates: { "USD|2026-01-15": 1.65 } });
    expect(priced.toWrite).toHaveLength(1);
    expect(priced.toWrite[0]).toMatchObject({ ticker: "AAPL", side: "buy", quantity: 2, price: 180 });
    expect(Math.abs(priced.cashNzd - -(360 + 1) * 1.65)).toBeLessThan(0.01);
  });
});

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const rel = path.join(dir, name.name);
    if (name.isDirectory()) out.push(...walk(rel));
    else out.push(rel);
  }
  return out;
}
