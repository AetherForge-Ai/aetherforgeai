/**
 * H-10 FX gate: preview and confirm share reviewedFxAllowed.
 * An off-market broker rate is shown before Save. A realistic IBKR export passes.
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { REVIEWED_FX_REJECTED } from "@/lib/reviewed-book";

type Row = Record<string, unknown> & { _id: string };

const harness = vi.hoisted(() => {
  const collections = new Map<string, Row[]>();
  let seq = 0;
  function bucket(name: string): Row[] {
    let rows = collections.get(name);
    if (!rows) {
      rows = [];
      collections.set(name, rows);
    }
    return rows;
  }
  function copy(row: Row): Row {
    return { ...row };
  }
  const methods = {
    async query(collection: string, body?: { _filter?: Record<string, unknown> }) {
      const filter = body?._filter;
      const data = bucket(collection).filter((row) => {
        if (!filter) return true;
        return Object.entries(filter).every(([key, value]) => key.startsWith("_") || row[key] === value);
      });
      return { data: data.map(copy) };
    },
    async getRecordById(collection: string, id: string) {
      const row = bucket(collection).find((item) => item._id === id);
      return { data: row ? copy(row) : null };
    },
    async createRecord(collection: string, body?: Record<string, unknown>) {
      const row = { ...(body || {}), _id: `row-${++seq}` } as Row;
      bucket(collection).push(row);
      return { data: copy(row) };
    },
    async editRecordById(collection: string, id: string, body?: Record<string, unknown>) {
      const row = bucket(collection).find((item) => item._id === id);
      if (!row) throw new Error(`missing ${collection} ${id}`);
      Object.assign(row, body || {});
      return { data: copy(row) };
    },
    async deleteRecordById(collection: string, id: string) {
      const rows = bucket(collection);
      const at = rows.findIndex((item) => item._id === id);
      if (at >= 0) rows.splice(at, 1);
      return { data: { _id: id } };
    },
  };
  return {
    methods,
    bucket,
    reset() {
      collections.clear();
    },
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/session", () => ({
  getTradeSessionUser: async () => null,
  getStableSessionUser: async () => null,
}));
vi.mock("@/lib/totalum", () => ({ totalumSdk: { crud: harness.methods } }));
vi.mock("@/lib/fx", () => ({
  historicalNzdPerUnit: async (currency: string, day?: string | null) => {
    const ecb: Record<string, number> = {
      "AUD|2026-03-02": 1.1888,
      "AUD|2026-03-20": 1.2062,
      "USD|2026-04-01": 1.7322,
      "USD|2026-01-15": 1.7417,
    };
    if (currency === "NZD") return 1;
    return ecb[`${currency}|${day || ""}`] ?? null;
  },
  getFxSnapshot: async () => ({
    ratesToNZD: { NZD: 1, USD: 1.7322, AUD: 1.1888 },
    live: false,
    sourced: true,
    asOf: "2026-04-01T00:00:00.000Z",
    fetchedAt: "2026-04-01T00:00:00.000Z",
  }),
}));
vi.mock("@/lib/market-data", () => ({
  fetchLivePrice: async () => null,
  isLiveDataConfigured: () => false,
  fetchCryptoQuotes: async () => ({}),
}));
vi.mock("@/lib/crypto-board-store", () => ({
  confirmCryptoQuote: async () => null,
  priceFromSnapshot: async () => null,
}));
vi.mock("@/lib/metals", () => ({ getMetalsSpot: async () => ({}) }));

import { runH10Import } from "@/lib/import/persist";
import { previewImport } from "@/lib/import/plan";

const IBKR = readFileSync("src/lib/import/fixtures/ibkr.csv", "utf8");

interface GateBody {
  ok?: boolean;
  error?: string;
  data?: {
    fxBlocked?: boolean;
    written?: number;
    cashNzd?: number;
    toWrite?: { line: number; ticker: string; currency: string; fx: number }[];
    errors?: { line: number; message: string }[];
  };
}

function flagged(body: GateBody): number[] {
  return (body.data?.errors || [])
    .filter((error) => error.message.includes(REVIEWED_FX_REJECTED))
    .map((error) => error.line)
    .sort((a, b) => a - b);
}

let users = 0;
function openBook() {
  harness.reset();
  users += 1;
  const id = `fx-gate-${users}`;
  harness.bucket("user").push({ _id: id, cash_balance: 0, email: `${id}@example.test` });
  return {
    _id: id,
    email: `${id}@example.test`,
    name: "Member",
    cash_balance: 0,
    subscription_plan: "starter_monthly",
    ticker_limit: 50,
  };
}

async function run(text: string, action: "preview" | "commit") {
  const user = openBook();
  const res = await runH10Import(user as never, text, { engine: "h10", action });
  const body = (await res.json()) as GateBody;
  return { status: res.status, body, trades: harness.bucket("transaction").filter((row) => row.user === user._id && (row.type === "buy" || row.type === "sell")) };
}

beforeEach(() => {
  harness.reset();
});

describe("H-10 FX gate", () => {
  it("preview and confirm flag the same rows, using reviewedFxAllowed", async () => {
    const off = IBKR.replace(",AUD,1.1888,", ",AUD,1.1000,").replace(",USD,1.7322,", ",USD,1.6000,");
    const preview = await run(off, "preview");
    const confirm = await run(off, "commit");
    expect(flagged(preview.body).length).toBeGreaterThan(1);
    expect(flagged(confirm.body)).toEqual(flagged(preview.body));
    expect(confirm.status).toBe(400);
    expect(confirm.body.data?.written).toBe(0);
    expect(confirm.trades).toHaveLength(0);
    const persist = readFileSync("src/lib/import/persist.ts", "utf8");
    const booking = readFileSync("src/lib/transactions.ts", "utf8");
    expect(persist).toContain("reviewedFxAllowed(");
    expect(booking).toContain("reviewedFxAllowed(");
    expect(persist).not.toContain("REVIEWED_FX_BAND");
  });

  it("ibkr.csv previews and confirms cleanly", async () => {
    const preview = await run(IBKR, "preview");
    expect(preview.status).toBe(200);
    expect(preview.body.data?.fxBlocked).toBe(false);
    expect(flagged(preview.body)).toEqual([]);
    expect(preview.body.data?.toWrite).toHaveLength(3);
    expect(Math.abs((preview.body.data?.cashNzd || 0) - -634.29)).toBeLessThan(0.01);

    const saved = await run(IBKR, "commit");
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(saved.body.data?.written).toBe(3);
    expect(saved.trades).toHaveLength(3);
  });

  it("an off-market rate is flagged in preview and Save stays blocked", async () => {
    const off = IBKR.replace(",USD,1.7322,", ",USD,1.1000,");
    const preview = await run(off, "preview");
    expect(preview.status).toBe(200);
    expect(preview.body.data?.fxBlocked).toBe(true);
    expect(flagged(preview.body)).toEqual([4]);
    expect(preview.body.data?.errors?.[0]?.message).toMatch(/within 5%/);
    expect(preview.body.data?.toWrite?.some((row) => row.ticker === "NVDA")).toBe(false);
    expect(readFileSync("src/app/import/import-client.tsx", "utf8")).toContain("!preview.fxBlocked");

    const saved = await run(off, "commit");
    expect(saved.status).toBe(400);
    expect(saved.body.data?.written).toBe(0);
    expect(flagged(saved.body)).toEqual(flagged(preview.body));
    expect(saved.trades).toHaveLength(0);
  });

  it("a realistic IBKR activity statement passes, and FX Rate to Base stays NZD per unit", async () => {
    const statement = [
      "Statement,Header,Field Name,Field Value",
      "Statement,Data,BaseCurrency,NZD",
      "Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,C. Price,Proceeds,Comm/Fee,Basis,Realized P/L,MTM P/L,Code,FX Rate to Base",
      'Trades,Data,Order,Stocks,AUD,BHP.AX,"2026-03-02, 10:15:00",10,40.00,40.00,-400.00,-1.50,401.50,0,0,O,1.1888',
      'Trades,Data,Order,Stocks,USD,NVDA,"2026-04-01, 09:30:00",2,100.00,100.00,-200.00,-1.00,201.00,0,0,O,1.7322',
      "Trades,Data,SubTotal,,Stocks,USD,NVDA,,,,,,,,,,,",
    ].join("\n");
    const parsed = await previewImport(statement);
    const aud = parsed.toWrite.find((row) => row.currency === "AUD");
    const usd = parsed.toWrite.find((row) => row.currency === "USD");
    expect(aud?.fx).toBeCloseTo(1.1888, 4);
    expect(usd?.fx).toBeCloseTo(1.7322, 4);
    expect(aud?.fx).toBeGreaterThan(1);
    expect(usd?.fx).toBeGreaterThan(1);

    const preview = await run(statement, "preview");
    expect(preview.body.data?.fxBlocked).toBe(false);
    expect(flagged(preview.body)).toEqual([]);
    expect(preview.body.data?.toWrite).toHaveLength(2);
    const saved = await run(statement, "commit");
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(saved.body.data?.written).toBe(2);

    const otherPair = statement.replace(",1.7322", ",0.5773");
    const turned = await previewImport(otherPair);
    const turnedUsd = turned.toWrite.find((row) => row.currency === "USD");
    expect(turnedUsd?.fx).toBeGreaterThan(1);
    expect(Math.abs((turnedUsd?.fx || 0) - 1.7322) / 1.7322).toBeLessThanOrEqual(0.05);
    const turnedPreview = await run(otherPair, "preview");
    expect(flagged(turnedPreview.body).some((line) => line === turnedUsd?.line)).toBe(false);

    const audInverse = statement.replace(",1.1888", ",0.8412");
    const kept = await previewImport(audInverse);
    expect(kept.toWrite.find((row) => row.currency === "AUD")?.fx).toBeCloseTo(0.8412, 4);
    const rejected = await run(audInverse, "preview");
    expect(rejected.body.data?.fxBlocked).toBe(true);
    expect(flagged(rejected.body)).toEqual([kept.toWrite.find((row) => row.currency === "AUD")?.line]);
  });
});
