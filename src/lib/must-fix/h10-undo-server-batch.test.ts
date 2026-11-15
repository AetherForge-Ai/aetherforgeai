/**
 * H-10 undo after the session ends.
 * The server lists the member's own active import batches. sessionStorage is not required.
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listImportBatches, undoTarget } from "@/lib/import-batches";

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
      seq = 0;
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

const IBKR = readFileSync("src/lib/import/fixtures/ibkr.csv", "utf8");

interface BatchBody {
  ok?: boolean;
  error?: string;
  data?: {
    batches?: { batchId: string; date: string; broker: string; rows: number; status: string }[];
    batchId?: string;
    written?: number;
    undone?: number;
  };
}

let users = 0;
function openBook() {
  users += 1;
  const id = `batch-user-${users}`;
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

function cashOf(userId: string): number {
  return Number(harness.bucket("user").find((row) => row._id === userId)?.cash_balance) || 0;
}

function tradesOf(userId: string) {
  return harness.bucket("transaction").filter((row) => row.user === userId && (row.type === "buy" || row.type === "sell"));
}

async function call(user: ReturnType<typeof openBook>, body: Record<string, unknown>) {
  const res = await runH10Import(user as never, "", body);
  return { status: res.status, body: (await res.json()) as BatchBody };
}

beforeEach(() => {
  harness.reset();
  users = 0;
});

describe("H-10 undo from the server batch list", () => {
  it("a fresh session lists the latest active batch and undo restores the book", async () => {
    const user = openBook();
    const saved = await runH10Import(user as never, IBKR, { engine: "h10", action: "commit" });
    const savedBody = (await saved.json()) as BatchBody;
    expect(saved.status, JSON.stringify(savedBody)).toBe(200);

    const listed = await call(user, { engine: "h10", action: "batches" });
    expect(listed.status).toBe(200);
    const batch = listed.body.data?.batches?.[0];
    expect(batch?.status).toBe("active");
    expect(batch?.rows).toBe(3);
    expect(batch?.broker).toBe("ibkr");
    expect(batch?.batchId).toBe(savedBody.data?.batchId);
    expect(undoTarget(listed.body.data?.batches || [], "")).toBe(batch?.batchId);

    const undone = await call(user, { engine: "h10", action: "undo", batchId: batch?.batchId });
    expect(undone.status, JSON.stringify(undone.body)).toBe(200);
    expect(undone.body.data?.undone).toBe(3);
    expect(cashOf(user._id)).toBeCloseTo(0, 2);
    expect(tradesOf(user._id)).toHaveLength(0);
    expect(harness.bucket("stock").filter((row) => row.user === user._id)).toHaveLength(0);

    const client = readFileSync("src/app/import/import-client.tsx", "utf8");
    expect(client).toContain('action: "batches"');
    expect(client).toContain("undoTarget");
    expect(client).not.toContain("disabled={!batchId || busy}");
  });

  it("another member's batch id is refused and their rows stay", async () => {
    const owner = openBook();
    const saved = await runH10Import(owner as never, IBKR, { engine: "h10", action: "commit" });
    const savedBody = (await saved.json()) as BatchBody;
    const batchId = savedBody.data?.batchId;
    const other = openBook();

    const refused = await call(other, { engine: "h10", action: "undo", batchId });
    expect(refused.status).toBe(404);
    expect(tradesOf(owner._id)).toHaveLength(3);
    expect(cashOf(owner._id)).toBeCloseTo(-634.29, 2);
    expect(tradesOf(other._id)).toHaveLength(0);
  });

  it("an already-undone batch is not active, and a repeat undo changes nothing", async () => {
    const user = openBook();
    const saved = await runH10Import(user as never, IBKR, { engine: "h10", action: "commit" });
    const batchId = ((await saved.json()) as BatchBody).data?.batchId || "";
    const first = await call(user, { engine: "h10", action: "undo", batchId });
    expect(first.status).toBe(200);

    const listed = await call(user, { engine: "h10", action: "batches" });
    const again = listed.body.data?.batches?.find((batch) => batch.batchId === batchId);
    expect(again).toBeUndefined();
    expect(undoTarget([{ batchId, date: "2026-04-01", broker: "ibkr", rows: 0, status: "undone" }], batchId)).toBe("");

    const repeat = await call(user, { engine: "h10", action: "undo", batchId });
    expect(repeat.status).toBe(404);
    expect(cashOf(user._id)).toBeCloseTo(0, 2);
    expect(tradesOf(user._id)).toHaveLength(0);
  });

  it("lists the newest active batch first", () => {
    const older = { notes: "Imported from a Hatch file. batch=impaaaa broker", executed_at: "2026-01-02", broker: "hatch" };
    const newer = { notes: "Imported from a IBKR file. batch=impbbbb", executed_at: "2026-04-01", broker: "ibkr" };
    const listed = listImportBatches([older, newer, { ...newer, executed_at: "2026-03-02" }]);
    expect(listed.map((batch) => batch.batchId)).toEqual(["impbbbb", "impaaaa"]);
    expect(listed[0]).toMatchObject({ broker: "ibkr", rows: 2, status: "active", date: "2026-04-01" });
    expect(undoTarget(listed, "")).toBe("impbbbb");
    expect(undoTarget(listed, "impaaaa")).toBe("impaaaa");
  });
});
