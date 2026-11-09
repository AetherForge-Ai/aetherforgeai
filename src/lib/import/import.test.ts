import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { commitImport, emptyBook, undoImport, DUPLICATE_FILE } from "@/lib/import/book";
import { headerIndex, parseCsv } from "@/lib/import/csv";
import { previewImport } from "@/lib/import/plan";
import { contentHash } from "@/lib/import/hash";
import { FORMAT_SOURCES } from "@/lib/import/formats";
import { IMPORT_MAX_BYTES, IMPORT_TOO_LARGE, bytesTooLarge, textTooLarge } from "@/lib/import/limits";
import { IMPORT_MAX_BYTES as routeCap, IMPORT_TOO_LARGE as routeTooLarge, importFileProblem, importTextTooLarge } from "@/lib/import-limits";
import type { ColumnMap } from "@/lib/import/types";

const DIR = path.join(process.cwd(), "src/lib/import/fixtures");
const read = (name: string) => readFileSync(path.join(DIR, name), "utf8");

/** Committed ASB fixture plus one trailing note, sized in memory to `bytes`. ASCII, so length is the UTF-8 size. */
function sizedAsb(bytes: number): string {
  const base = read("asb.csv");
  const head = base.endsWith("\n") ? base : `${base}\n`;
  const marked = `${head}# `;
  if (marked.length > bytes) throw new Error(`asb.csv is already ${marked.length} bytes`);
  const text = marked + "x".repeat(bytes - marked.length);
  if (text.length !== bytes) throw new Error(`sized fixture is ${text.length}, not ${bytes}`);
  return text;
}

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

  it("treats one byte under the cap as a file to parse", async () => {
    const text = sizedAsb(IMPORT_MAX_BYTES - 1);
    const preview = await previewImport(text);
    expect(preview.error).not.toBe(IMPORT_TOO_LARGE);
    expect(preview.unreadable).toBe(false);
    expect(preview.broker).toBe("asb");
    const book = emptyBook(10);
    const outcome = await commitImport(book, text);
    expect(outcome.error).not.toBe(IMPORT_TOO_LARGE);
    expect(outcome.ok).toBe(true);
    expect(outcome.written).toBe(expected["asb.csv"].rows);
  }, 30_000);

  it("accepts a file exactly at the cap because the check is greater-than", async () => {
    const text = sizedAsb(IMPORT_MAX_BYTES);
    expect(textTooLarge(text)).toBe(false);
    expect(importTextTooLarge(text)).toBe(false);
    expect(bytesTooLarge(text.length)).toBe(false);
    expect(importFileProblem({ size: text.length, type: "text/csv", name: "asb.csv" })).toBeNull();
    const preview = await previewImport(text);
    expect(preview.error).not.toBe(IMPORT_TOO_LARGE);
    expect(preview.unreadable).toBe(false);
    expect(preview.broker).toBe("asb");
    const outcome = await commitImport(emptyBook(10), text);
    expect(outcome.ok).toBe(true);
    expect(outcome.error).not.toBe(IMPORT_TOO_LARGE);
    expect(outcome.written).toBe(expected["asb.csv"].rows);
  }, 30_000);

  it("rejects one byte over the cap with the size error before parse", async () => {
    const text = sizedAsb(IMPORT_MAX_BYTES + 1);
    expect(textTooLarge(text)).toBe(true);
    expect(importTextTooLarge(text)).toBe(true);
    expect(bytesTooLarge(text.length)).toBe(true);
    expect(importFileProblem({ size: text.length, type: "text/csv", name: "asb.csv" })).toBe(routeTooLarge);
    const book = emptyBook(10);
    const outcome = await commitImport(book, text);
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toBe(IMPORT_TOO_LARGE);
    expect(outcome.written).toBe(0);
    expect(book.cashNzd).toBe(10);
    expect(book.batches).toHaveLength(0);
    const preview = await previewImport(text);
    expect(preview.unreadable).toBe(true);
    expect(preview.error).toBe(IMPORT_TOO_LARGE);
    expect(preview.rows).toHaveLength(0);
  });

  it("uses the same byte cap on the browser file check and the server text check", () => {
    expect(IMPORT_MAX_BYTES).toBe(routeCap);
    expect(IMPORT_TOO_LARGE).toBe(routeTooLarge);
    expect(bytesTooLarge(IMPORT_MAX_BYTES - 1)).toBe(importTextTooLarge("x".repeat(IMPORT_MAX_BYTES - 1)));
    expect(bytesTooLarge(IMPORT_MAX_BYTES)).toBe(false);
    expect(importFileProblem({ size: IMPORT_MAX_BYTES, type: "text/csv", name: "a.csv" })).toBeNull();
    expect(importFileProblem({ size: IMPORT_MAX_BYTES + 1, type: "text/csv", name: "a.csv" })).toBe(routeTooLarge);
  });

  it("does not use Math.random anywhere in the import path", () => {
    const files = walk("src/lib/import").concat([
      "src/lib/broker-import.ts",
      "src/app/api/import/route.ts",
      "src/app/import/page.tsx",
      "src/app/import/import-client.tsx",
      "src/components/import/BrokerImportPanel.tsx",
    ]);
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

/**
 * Brokers with a committed fixture and a recorded total in expected.json.
 * Hatch uses hatch.csv and expected.json cashNzd -158.4. InvestNow, Kernel,
 * Binance and the AetherForge export have no committed fixture with a recorded total.
 * Bad rows and the 6 MB file are derived from that fixture and labelled as such.
 */
const COVERED_FIXTURES = [
  "sharesies.csv",
  "hatch.csv",
  "ibkr.csv",
  "stake.csv",
  "asb.csv",
  "jarden.csv",
  "commsec.csv",
  "swyftx.csv",
  "easycrypto.csv",
  "generic.csv",
] as const;

const BREAK_COLUMNS: Record<(typeof COVERED_FIXTURES)[number], { date: string[]; side: string[]; price: string[] }> = {
  "sharesies.csv": { date: ["trade date"], side: ["transaction type"], price: ["price"] },
  "hatch.csv": { date: ["date (nz)", "date"], side: ["side"], price: ["price (usd)", "price"] },
  "ibkr.csv": { date: ["tradedate", "trade date"], side: ["buy/sell"], price: ["tradeprice", "trade price"] },
  "stake.csv": { date: ["trade date"], side: ["side"], price: ["avg price"] },
  "asb.csv": { date: ["trade date"], side: ["buy/sell"], price: ["price"] },
  "jarden.csv": { date: ["transaction date"], side: ["type"], price: ["price"] },
  "commsec.csv": { date: ["trade date"], side: ["buy/sell"], price: ["average price ($)", "average price"] },
  "swyftx.csv": { date: ["date"], side: ["event"], price: ["rate"] },
  "easycrypto.csv": { date: ["created", "date"], side: ["from currency"], price: ["rate"] },
  "generic.csv": { date: ["booked"], side: ["what"], price: ["unit price"] },
};

function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Three broken copies of the first trade. The committed rows are not edited. */
function derivedBadRows(text: string, file: (typeof COVERED_FIXTURES)[number]): string {
  const grid = parseCsv(text);
  const headers = grid[0] || [];
  const spec = BREAK_COLUMNS[file];
  const dateAt = headerIndex(headers, spec.date);
  const sideAt = headerIndex(headers, spec.side);
  const priceAt = headerIndex(headers, spec.price);
  if (dateAt < 0 || sideAt < 0 || priceAt < 0 || grid.length < 2) {
    throw new Error(`cannot derive bad rows for ${file}`);
  }
  const source = grid[1];
  const broken = [
    source.map((cell, index) => (index === dateAt ? "not-a-date" : cell)),
    source.map((cell, index) => (index === sideAt ? "NOT-A-SIDE" : cell)),
    source.map((cell, index) => (index === priceAt ? "abc" : cell)),
  ];
  const body = [headers, ...grid.slice(1), ...broken].map((row) => row.map(csvCell).join(",")).join("\n");
  return `# DERIVED bad rows from ${file}. Three cells are broken. Good rows are the committed fixture.\n${body}\n`;
}

/** The committed fixture, then padding, so the file is 6 MB. */
function derivedOversize(text: string, file: string): string {
  const note = `# DERIVED oversize from ${file}. Padding is not a broker row.\n`;
  const target = 6 * 1024 * 1024;
  const body = note + text;
  if (body.length >= target) return body;
  return body + "x".repeat(target - body.length);
}

describe("H-10 each covered broker fixture", () => {
  const opening = 100_000;

  for (const file of COVERED_FIXTURES) {
    const want = expected[file];

    it(`${file} commits, rejects a duplicate, and undo restores the totals`, async () => {
      const text = read(file);
      const book = emptyBook(opening);
      const outcome = await commitImport(book, text, optionsFor(file, want));
      expect(outcome.ok).toBe(true);
      expect(outcome.written).toBe(want.rows);
      expect(Math.abs(book.cashNzd - (opening + want.cashNzd))).toBeLessThan(0.01);
      const cash = book.cashNzd;
      const holdings = { ...book.holdings };

      const again = await commitImport(book, text, optionsFor(file, want));
      expect(again.ok).toBe(false);
      expect(again.duplicate).toBe(true);
      expect(again.error).toBe(DUPLICATE_FILE);
      expect(again.written).toBe(0);
      expect(book.cashNzd).toBe(cash);
      expect(book.holdings).toEqual(holdings);

      const undone = undoImport(book, outcome.batchId || "");
      expect(undone.ok).toBe(true);
      expect(book.cashNzd).toBe(opening);
      expect(book.holdings).toEqual({});
      expect(book.fileHashes).toEqual([]);
    });

    it(`${file} keeps exactly 3 derived row errors and commits the good rows`, async () => {
      const text = derivedBadRows(read(file), file);
      expect(text.startsWith("# DERIVED bad rows")).toBe(true);
      const book = emptyBook(opening);
      const outcome = await commitImport(book, text, optionsFor(file, want));
      expect(outcome.ok).toBe(true);
      expect(outcome.preview.errors).toHaveLength(3);
      expect(outcome.written).toBe(want.rows);
      expect(Math.abs(book.cashNzd - (opening + want.cashNzd))).toBeLessThan(0.01);
    });

    it(`${file} rejects a derived 6 MB file and writes nothing`, async () => {
      const text = derivedOversize(read(file), file);
      expect(text.startsWith("# DERIVED oversize")).toBe(true);
      expect(text.length).toBe(6 * 1024 * 1024);
      const book = emptyBook(opening);
      const outcome = await commitImport(book, text, optionsFor(file, want));
      expect(outcome.ok).toBe(false);
      expect(outcome.error).toBe(IMPORT_TOO_LARGE);
      expect(outcome.written).toBe(0);
      expect(book.cashNzd).toBe(opening);
      expect(book.batches).toHaveLength(0);
    });
  }
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
