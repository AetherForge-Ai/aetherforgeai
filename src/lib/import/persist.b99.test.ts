/**
 * H-10-PERSIST: runH10Import against an in-memory store. No Totalum, no network.
 * The store throws if a method this path did not implement is called.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { headerIndex, parseCsv } from "@/lib/import/csv";
import { commitImport, emptyBook } from "@/lib/import/book";
import { IMPORT_MAX_BYTES, IMPORT_TOO_LARGE } from "@/lib/import/limits";
import { previewImport } from "@/lib/import/plan";
import type { ColumnMap } from "@/lib/import/types";
import { formatNzd } from "@/lib/currency";

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

const BROKERS = [
  "sharesies.csv",
  "hatch.csv",
  "ibkr.csv",
  "stake.csv",
  "asb.csv",
  "jarden.csv",
  "commsec.csv",
  "swyftx.csv",
  "easycrypto.csv",
] as const;

const BREAK_COLUMNS: Record<(typeof BROKERS)[number], { date: string[]; side: string[]; price: string[] }> = {
  "sharesies.csv": { date: ["trade date"], side: ["transaction type"], price: ["price"] },
  "hatch.csv": { date: ["date (nz)", "date"], side: ["side"], price: ["price (usd)", "price"] },
  "ibkr.csv": { date: ["tradedate", "trade date"], side: ["buy/sell"], price: ["tradeprice", "trade price"] },
  "stake.csv": { date: ["trade date"], side: ["side"], price: ["avg price"] },
  "asb.csv": { date: ["trade date"], side: ["buy/sell"], price: ["price"] },
  "jarden.csv": { date: ["transaction date"], side: ["type"], price: ["price"] },
  "commsec.csv": { date: ["trade date"], side: ["buy/sell"], price: ["average price ($)", "average price"] },
  "swyftx.csv": { date: ["date"], side: ["event"], price: ["rate"] },
  "easycrypto.csv": { date: ["created", "date"], side: ["from currency"], price: ["rate"] },
};

type Row = Record<string, unknown> & { _id: string };

const harness = vi.hoisted(() => {
  const collections = new Map<string, Row[]>();
  const fx = new Map<string, number>();
  const network: string[] = [];
  const cashTrail: number[] = [];
  let seq = 0;
  let fetchInstalled = false;
  let failBuyWrites = 0;

  function bucket(name: string): Row[] {
    let rows = collections.get(name);
    if (!rows) {
      rows = [];
      collections.set(name, rows);
    }
    return rows;
  }

  function matches(row: Row, filter: Record<string, unknown> | undefined): boolean {
    if (!filter) return true;
    for (const [key, value] of Object.entries(filter)) {
      if (key.startsWith("_")) continue;
      if (row[key] !== value) return false;
    }
    return true;
  }

  function copy(row: Row): Row {
    return { ...row };
  }

  const methods = {
    async query(collection: string, body?: { _filter?: Record<string, unknown> }) {
      return { data: bucket(collection).filter((row) => matches(row, body?._filter)).map(copy) };
    },
    async getRecordById(collection: string, id: string) {
      const row = bucket(collection).find((item) => item._id === id);
      return { data: row ? copy(row) : null };
    },
    async createRecord(collection: string, body?: Record<string, unknown>) {
      if (collection === "transaction" && body?.type === "buy" && failBuyWrites > 0) {
        failBuyWrites -= 1;
        throw new Error("trade commit failed");
      }
      const row = { ...(body || {}), _id: `row-${++seq}` } as Row;
      bucket(collection).push(row);
      return { data: copy(row) };
    },
    async editRecordById(collection: string, id: string, body?: Record<string, unknown>) {
      const row = bucket(collection).find((item) => item._id === id);
      if (!row) throw new Error(`missing ${collection} ${id}`);
      Object.assign(row, body || {});
      if (collection === "user" && body && "cash_balance" in body) cashTrail.push(Number(body.cash_balance));
      return { data: copy(row) };
    },
    async deleteRecordById(collection: string, id: string) {
      const rows = bucket(collection);
      const at = rows.findIndex((item) => item._id === id);
      if (at >= 0) rows.splice(at, 1);
      return { data: { _id: id } };
    },
  };

  const crud = new Proxy(methods, {
    get(target, prop) {
      if (typeof prop !== "string") return undefined;
      if (prop in target) return target[prop as keyof typeof target];
      return () => {
        throw new Error(`unmocked store method ${prop}`);
      };
    },
  });

  function reset() {
    collections.clear();
    cashTrail.length = 0;
    network.length = 0;
    failBuyWrites = 0;
  }

  function historical(currency: string, day: string | null | undefined): Promise<number | null> {
    if (currency === "NZD") return Promise.resolve(1);
    if (!day) return Promise.resolve(null);
    const rate = fx.get(`${currency}|${day}`);
    return Promise.resolve(rate != null && rate > 0 ? rate : null);
  }

  return {
    crud,
    fx,
    network,
    cashTrail,
    reset,
    historical,
    bucket,
    get fetchInstalled() { return fetchInstalled; },
    set fetchInstalled(value: boolean) { fetchInstalled = value; },
    get failBuyWrites() { return failBuyWrites; },
    set failBuyWrites(value: number) { failBuyWrites = value; },
  };
});

vi.mock("server-only", () => ({}));

vi.mock("@/lib/totalum", () => ({
  totalumSdk: new Proxy(
    { crud: harness.crud },
    {
      get(target, prop) {
        if (prop === "crud") return target.crud;
        if (typeof prop !== "string") return undefined;
        return () => {
          throw new Error(`unmocked totalum method ${prop}`);
        };
      },
    }
  ),
}));

vi.mock("@/lib/fx", () => ({
  historicalNzdPerUnit: (currency: string, day: string | null | undefined) => harness.historical(currency, day),
  getFxSnapshot: async () => ({
    ratesToNZD: { NZD: 1, USD: 1.65, AUD: 1.1 },
    live: false,
    sourced: true,
    asOf: "2026-01-01T00:00:00.000Z",
    fetchedAt: "2026-01-01T00:00:00.000Z",
  }),
}));

vi.mock("@/lib/market-data", () => ({
  fetchLivePrice: async () => {
    harness.network.push("fetchLivePrice");
    throw new Error("network");
  },
  isLiveDataConfigured: () => false,
  fetchCryptoQuotes: async () => {
    harness.network.push("fetchCryptoQuotes");
    throw new Error("network");
  },
}));

vi.mock("@/lib/crypto-board-store", () => ({
  confirmCryptoQuote: async () => null,
  priceFromSnapshot: async () => null,
}));

vi.mock("@/lib/metals", () => ({
  getMetalsSpot: async () => {
    harness.network.push("getMetalsSpot");
    throw new Error("network");
  },
}));

import { runH10Import } from "@/lib/import/persist";
import { applyFlexStatement } from "@/lib/broker-sync/ibkr-sync.server";
import { flexCashRows, flexTradesCsv } from "@/lib/broker-sync/ibkr-flex";
import { parseIbkr } from "@/lib/import/parsers/ibkr";

const previousFetch = globalThis.fetch;
if (!harness.fetchInstalled) {
  harness.fetchInstalled = true;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    harness.network.push(url);
    throw new Error(`network call in import persist test: ${url}`);
  }) as typeof fetch;
}

afterAll(() => {
  globalThis.fetch = previousFetch;
});

function optionsFor(file: string, want: Expected) {
  return {
    reviewedRates: want.rates,
    ...(file === "generic.csv" ? { mapping: {} as ColumnMap } : {}),
  };
}

function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function derivedBadRows(text: string, file: (typeof BROKERS)[number]): string {
  const grid = parseCsv(text);
  const headers = grid[0] || [];
  const spec = BREAK_COLUMNS[file];
  const dateAt = headerIndex(headers, spec.date);
  const sideAt = headerIndex(headers, spec.side);
  const priceAt = headerIndex(headers, spec.price);
  if (dateAt < 0 || sideAt < 0 || priceAt < 0 || grid.length < 2) throw new Error(`cannot derive bad rows for ${file}`);
  const source = grid[1];
  const broken = [
    source.map((cell, index) => (index === dateAt ? "not-a-date" : cell)),
    source.map((cell, index) => (index === sideAt ? "NOT-A-SIDE" : cell)),
    source.map((cell, index) => (index === priceAt ? "abc" : cell)),
  ];
  const body = [headers, ...grid.slice(1), ...broken].map((row) => row.map(csvCell).join(",")).join("\n");
  return `# DERIVED bad rows from ${file}. Three cells are broken. Good rows are the committed fixture.\n${body}\n`;
}

function sized(text: string, bytes: number): string {
  const head = text.endsWith("\n") ? text : `${text}\n`;
  const marked = `${head}# `;
  if (marked.length > bytes) throw new Error(`fixture is already ${marked.length} bytes`);
  const out = marked + "x".repeat(bytes - marked.length);
  if (out.length !== bytes) throw new Error(`sized fixture is ${out.length}, not ${bytes}`);
  return out;
}

let users = 0;

function openBook(cash: number) {
  harness.reset();
  users += 1;
  const id = `persist-user-${users}`;
  harness.bucket("user").push({ _id: id, cash_balance: cash, email: `${id}@example.test` });
  harness.cashTrail.push(cash);
  return {
    _id: id,
    email: `${id}@example.test`,
    name: "Member",
    cash_balance: cash,
    subscription_plan: "starter_monthly",
    ticker_limit: 50,
  };
}

async function seedRates(file: string, text: string, want: Expected) {
  for (const [key, rate] of Object.entries(want.rates || {})) harness.fx.set(key, rate);
  const preview = await previewImport(text, optionsFor(file, want));
  for (const row of preview.toWrite) {
    if (row.currency !== "NZD") harness.fx.set(`${row.currency}|${row.date}`, row.fx);
  }
}

function deps() {
  return { crud: harness.crud as never, historicalNzdPerUnit: harness.historical as never };
}

async function commit(user: ReturnType<typeof openBook>, text: string) {
  const res = await runH10Import(user as never, text, { engine: "h10", action: "commit" }, "manual", deps());
  const body = (await res.json()) as { ok?: boolean; error?: string; code?: string; data?: Record<string, unknown> };
  return { status: res.status, body };
}

function rowsOf(userId: string, type?: string): Row[] {
  return harness.bucket("transaction").filter((row) => row.user === userId && (type == null || row.type === type));
}

function cashOf(userId: string): number {
  const row = harness.bucket("user").find((item) => item._id === userId);
  return Number(row?.cash_balance) || 0;
}

function holdingsOf(userId: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of harness.bucket("stock")) {
    if (row.user !== userId) continue;
    const shares = Number(row.shares) || 0;
    if (Math.abs(shares) < 1e-8) continue;
    const ticker = String(row.ticker || "").toUpperCase();
    out[ticker] = Math.round(((out[ticker] || 0) + shares) * 1e8) / 1e8;
  }
  return out;
}

async function bookHash(userId: string): Promise<string> {
  const trades = rowsOf(userId)
    .map((row) => ({
      type: row.type,
      ticker: row.ticker ?? null,
      quantity: row.quantity ?? null,
      price: row.price ?? null,
      cash_nzd: row.cash_nzd ?? null,
      executed_at: row.executed_at ?? null,
      notes: row.notes ?? null,
    }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const holdings = Object.entries(holdingsOf(userId)).sort(([a], [b]) => a.localeCompare(b));
  const payload = JSON.stringify({ cash: Math.round(cashOf(userId) * 100) / 100, holdings, trades });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function minCash(): number {
  return harness.cashTrail.reduce((min, value) => Math.min(min, value), 0);
}

/** Statement cash signed by kind: a withdrawal subtracts. Trades keep their own signed effect. */
function statementCashNzd(xml: string): number {
  const draft = parseIbkr(parseCsv(flexTradesCsv(xml))) as unknown as { rows: Array<{ cashEffectNzd: number }> };
  const tradeCash = draft.rows.reduce((sum, row) => sum + row.cashEffectNzd, 0);
  const cash = flexCashRows(xml).reduce((sum, row) => {
    const nzd = Math.round(row.amount * (row.fxRateToBase ?? 1) * 100) / 100;
    return sum + (row.kind === "withdraw" ? -nzd : nzd);
  }, 0);
  return Math.round((tradeCash + cash) * 100) / 100;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const rel = path.join(dir, name.name);
    if (name.isDirectory()) out.push(...walk(rel));
    else out.push(rel);
  }
  return out;
}

beforeEach(() => {
  harness.fx.clear();
});

describe("H-10 live write path", () => {
  const opening = 100_000;

  for (const file of BROKERS) {
    const want = expected[file];

    it(`${file} commits through runH10Import to the expected cash and holdings`, async () => {
      const text = read(file);
      await seedRates(file, text, want);
      const user = openBook(opening);
      const before = await bookHash(user._id);
      const paper = emptyBook(opening);
      const paperOut = await commitImport(paper, text, optionsFor(file, want));
      expect(paperOut.ok).toBe(true);

      const outcome = await commit(user, text);
      expect(outcome.status, JSON.stringify(outcome.body)).toBe(200);
      expect(outcome.body.ok).toBe(true);
      expect(outcome.body.data?.written).toBe(want.rows);
      expect(Math.abs(cashOf(user._id) - (opening + want.cashNzd))).toBeLessThan(0.01);
      expect(Math.abs(cashOf(user._id) - paper.cashNzd)).toBeLessThan(0.01);
      expect(holdingsOf(user._id)).toEqual(paper.holdings);
      expect(rowsOf(user._id, "deposit")).toHaveLength(0);
      expect(minCash()).toBeGreaterThanOrEqual(-0.01);
      expect(harness.network).toEqual([]);

      const again = await commit(user, text.replace(/\n/g, "\r\n"));
      expect(again.status).toBe(409);
      expect(again.body.data?.written).toBe(0);
      expect(rowsOf(user._id).filter((row) => row.type === "buy" || row.type === "sell")).toHaveLength(want.rows);
      expect(cashOf(user._id)).toBeCloseTo(opening + want.cashNzd, 2);

      const undone = await runH10Import(
        user as never,
        text,
        { engine: "h10", action: "undo", batchId: outcome.body.data?.batchId },
        "manual",
        deps()
      );
      const undoneBody = (await undone.json()) as { ok?: boolean; error?: string; data?: { undone?: number } };
      expect(undone.status, JSON.stringify(undoneBody)).toBe(200);
      expect(undoneBody.data?.undone).toBe(want.rows);
      expect(await bookHash(user._id)).toBe(before);
      expect(rowsOf(user._id)).toHaveLength(0);
      expect(holdingsOf(user._id)).toEqual({});

      const refused = await runH10Import(
        user as never,
        text,
        { engine: "h10", action: "undo", batchId: outcome.body.data?.batchId },
        "manual",
        deps()
      );
      expect(refused.status).toBe(404);
      expect(await bookHash(user._id)).toBe(before);
    });

    it(`${file} credits a paper deposit before a buy would take cash below zero, in one batch`, async () => {
      const text = read(file);
      await seedRates(file, text, want);
      const user = openBook(0);
      const emptyHash = await bookHash(user._id);
      const outcome = await commit(user, text);
      expect(outcome.status, JSON.stringify(outcome.body)).toBe(200);
      expect(outcome.body.data?.written).toBe(want.rows);
      const batchId = String(outcome.body.data?.batchId || "");
      expect(batchId).toMatch(/^imp/);
      const saved = rowsOf(user._id);
      const deposits = saved.filter((row) => row.type === "deposit");
      const trades = saved.filter((row) => row.type === "buy" || row.type === "sell");
      expect(deposits.length).toBeGreaterThan(0);
      expect(trades).toHaveLength(want.rows);
      for (const row of saved) expect(String(row.notes || "")).toContain(`batch=${batchId}`);
      expect(minCash()).toBeGreaterThanOrEqual(-0.01);
      const tradeCash = trades.reduce((sum, row) => sum + Number(row.cash_nzd || 0), 0);
      expect(Math.abs(tradeCash - want.cashNzd)).toBeLessThan(0.01);
      expect(cashOf(user._id)).toBeGreaterThanOrEqual(-0.01);
      const paper = emptyBook(opening);
      await commitImport(paper, text, optionsFor(file, want));
      expect(holdingsOf(user._id)).toEqual(paper.holdings);

      const importedHash = await bookHash(user._id);
      const undone = await runH10Import(user as never, text, { action: "undo", batchId }, "manual", deps());
      const undoneBody = (await undone.json()) as { error?: string; data?: { undone?: number } };
      expect(undone.status, JSON.stringify(undoneBody)).toBe(200);
      expect(undoneBody.data?.undone).toBe(saved.length);
      const restored = await bookHash(user._id);
      expect(restored).toBe(emptyHash);
      expect(restored).not.toBe(importedHash);
      expect(rowsOf(user._id)).toHaveLength(0);
      expect(cashOf(user._id)).toBe(0);
      expect(holdingsOf(user._id)).toEqual({});
      const refused = await runH10Import(user as never, text, { action: "undo", batchId }, "manual", deps());
      expect(refused.status).toBe(404);
      expect(await bookHash(user._id)).toBe(restored);
    });

    it(`${file} keeps exactly 3 derived row errors and commits the good rows`, async () => {
      const text = derivedBadRows(read(file), file);
      await seedRates(file, text, want);
      const user = openBook(opening);
      const outcome = await commit(user, text);
      expect(outcome.status, JSON.stringify(outcome.body)).toBe(200);
      const errors = outcome.body.data?.errors as { line: number; message: string }[];
      expect(errors).toHaveLength(3);
      const lines = errors.map((error) => error.line);
      expect(new Set(lines).size).toBe(3);
      for (const error of errors) {
        expect(error.line).toBeGreaterThan(1);
        expect(error.message).toMatch(new RegExp(`Line ${error.line}:`));
      }
      expect(outcome.body.data?.written).toBe(want.rows);
      expect(Math.abs(cashOf(user._id) - (opening + want.cashNzd))).toBeLessThan(0.01);
    });

    it(`${file} rejects one byte over 5 MB and accepts exactly 5 MB`, async () => {
      const raw = read(file);
      await seedRates(file, raw, want);
      const user = openBook(opening);
      const over = await commit(user, sized(raw, IMPORT_MAX_BYTES + 1));
      expect(over.status).toBe(413);
      expect(over.body.error).toBe(IMPORT_TOO_LARGE);
      expect(rowsOf(user._id)).toHaveLength(0);
      expect(cashOf(user._id)).toBe(opening);

      const exactUser = openBook(opening);
      await seedRates(file, raw, want);
      const exact = await commit(exactUser, sized(raw, IMPORT_MAX_BYTES));
      expect(exact.status, JSON.stringify(exact.body)).toBe(200);
      expect(exact.body.error).not.toBe(IMPORT_TOO_LARGE);
      expect(exact.body.data?.written).toBe(want.rows);
    }, 60_000);
  }

  it("an IBKR Flex sync on a short book keeps the statement cash and does not invent a deposit", async () => {
    const xml = readFileSync("src/lib/broker-sync/fixtures/ibkr-flex-statement.xml", "utf8");
    const user = openBook(0);
    for (const day of ["2026-03-02", "2026-03-15", "2026-03-20"]) harness.fx.set(`USD|${day}`, 1.7);
    const out = await applyFlexStatement(user as never, xml);
    expect(out.trades).toBe(2);
    expect(out.cash).toBe(2);
    const invented = rowsOf(user._id).filter((row) => /would otherwise make paper cash negative/.test(String(row.notes || "")));
    expect(invented).toHaveLength(0);
    expect(Math.abs(cashOf(user._id) - statementCashNzd(xml))).toBeLessThanOrEqual(0.01);
    expect(harness.network).toEqual([]);
  });

  it("a Flex withdrawal subtracts, and final cash still matches the statement", async () => {
    const xml = readFileSync("src/lib/broker-sync/fixtures/ibkr-flex-statement.xml", "utf8").replace(
      "</CashTransactions>",
      '<CashTransaction accountId="U0000000" currency="NZD" fxRateToBase="1" type="Deposits/Withdrawals" transactionID="2003" dateTime="20260301" amount="-100" symbol=""/></CashTransactions>'
    );
    expect(flexCashRows(xml).some((row) => row.kind === "withdraw" && row.amount === 100)).toBe(true);
    const user = openBook(0);
    for (const day of ["2026-03-02", "2026-03-15", "2026-03-20"]) harness.fx.set(`USD|${day}`, 1.7);
    const out = await applyFlexStatement(user as never, xml);
    expect(out.cash).toBe(3);
    expect(rowsOf(user._id, "withdraw")).toHaveLength(1);
    expect(Math.abs(cashOf(user._id) - statementCashNzd(xml))).toBeLessThanOrEqual(0.01);
    const withoutWithdrawal = statementCashNzd(readFileSync("src/lib/broker-sync/fixtures/ibkr-flex-statement.xml", "utf8"));
    expect(Math.abs(cashOf(user._id) - (withoutWithdrawal - 100))).toBeLessThanOrEqual(0.01);
  });

  it("a failed trade commit leaves no statement cash, and a retry matches the statement", async () => {
    const xml = readFileSync("src/lib/broker-sync/fixtures/ibkr-flex-statement.xml", "utf8");
    const user = openBook(0);
    for (const day of ["2026-03-02", "2026-03-15", "2026-03-20"]) harness.fx.set(`USD|${day}`, 1.7);
    harness.failBuyWrites = 1;
    await expect(applyFlexStatement(user as never, xml)).rejects.toThrow(/trade commit failed/);
    expect(rowsOf(user._id).filter((row) => /Synced from IBKR Flex/.test(String(row.notes || "")))).toHaveLength(0);
    expect(rowsOf(user._id)).toHaveLength(0);
    expect(holdingsOf(user._id)).toEqual({});
    expect(cashOf(user._id)).toBe(0);
    const retried = await applyFlexStatement(user as never, xml);
    expect(retried.trades).toBe(2);
    expect(retried.cash).toBe(2);
    expect(Math.abs(cashOf(user._id) - statementCashNzd(xml))).toBeLessThanOrEqual(0.01);
    const again = await applyFlexStatement(user as never, xml);
    expect(again.trades).toBe(0);
    expect(again.cash).toBe(0);
    expect(Math.abs(cashOf(user._id) - statementCashNzd(xml))).toBeLessThanOrEqual(0.01);
  });

  it("a broker-sync input that is not Flex XML is refused and writes nothing", async () => {
    const user = openBook(50);
    await expect(applyFlexStatement(user as never, read("ibkr.csv"))).rejects.toThrow(/Flex XML statement/);
    expect(rowsOf(user._id)).toHaveLength(0);
    expect(cashOf(user._id)).toBe(50);
    expect(rowsOf(user._id).filter((row) => /would otherwise make paper cash negative/.test(String(row.notes || "")))).toHaveLength(0);
  });

  it("a CSV commit on a short book still records a paper deposit and names the amount", async () => {
    const file = "ibkr.csv";
    const text = read(file);
    const want = expected[file];
    await seedRates(file, text, want);
    const user = openBook(0);
    const outcome = await commit(user, text);
    expect(outcome.status, JSON.stringify(outcome.body)).toBe(200);
    const deposits = rowsOf(user._id, "deposit");
    expect(deposits.length).toBeGreaterThan(0);
    for (const row of deposits) expect(String(row.notes || "")).toMatch(/would otherwise make paper cash negative/);
    const deposited = deposits.reduce((sum, row) => sum + Number(row.cash_nzd || 0), 0);
    expect(String(outcome.body.data?.summary || "")).toContain(`Paper deposit ${formatNzd(deposited)}`);
    expect(minCash()).toBeGreaterThanOrEqual(-0.01);
  });

  it("does not use Math.random in the import path and the fake store rejects an unknown method", () => {
    const files = walk("src/lib/import").concat(["src/app/api/import/route.ts", "src/app/import/page.tsx", "src/app/import/import-client.tsx"]);
    for (const file of files) {
      if (!/\.(ts|tsx)$/.test(file) || file.endsWith(".test.ts")) continue;
      expect(readFileSync(path.join(process.cwd(), file), "utf8"), file).not.toContain("Math.random");
    }
    const crud = harness.crud as unknown as Record<string, () => void>;
    expect(() => crud.dropCollection()).toThrow(/unmocked store method dropCollection/);
    expect(harness.network).toEqual([]);
  });
});
