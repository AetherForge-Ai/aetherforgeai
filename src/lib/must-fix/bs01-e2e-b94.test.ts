/**
 * b94 BS-01: end to end through the real POST /api/test-hooks/ibkr-fixture-sync handler:
 * connect (sandbox token stored encrypted), sync (fixture commits; a second sync adds 0),
 * invalid/expired token refused with nothing saved, disconnect deletes the row.
 * Totalum, the session and the H-10 commit are in-memory stand-ins; no network, no real token.
 * pull-check:v3-b94-2026-11-01
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown> & { _id: string };
const db: Record<string, Row[]> = {};
let nextId = 1;
const table = (t: string) => (db[t] ||= []);
vi.mock("@/lib/totalum", () => ({
  totalumSdk: {
    crud: {
      query: async (t: string, q: { _filter?: Record<string, unknown> }) => ({
        data: table(t).filter((r) => Object.entries(q?._filter || {}).every(([k, v]) => r[k] === v)),
      }),
      createRecord: async (t: string, rec: Record<string, unknown>) => {
        const row = { ...rec, _id: `r${nextId++}` };
        table(t).push(row);
        return { data: row };
      },
      editRecordById: async (t: string, id: string, fields: Record<string, unknown>) => {
        const row = table(t).find((r) => r._id === id);
        if (row) Object.assign(row, fields);
        return { data: row };
      },
      deleteRecordById: async (t: string, id: string) => {
        db[t] = table(t).filter((r) => r._id !== id);
        return {};
      },
    },
  },
}));

const USER = { _id: "tt-1", email: "tt@example.test" };
vi.mock("@/lib/session", () => ({ getTradeSessionUser: async () => USER }));
vi.mock("@/lib/test-hooks", () => ({ testHooksAllowedFor: (u: { _id?: string }) => u?._id === "tt-1" }));
vi.mock("@/lib/book-cache", () => ({ invalidateBookCache: () => undefined }));

// The H-10 commit on an in-memory book (same engine as the live path, minus Totalum).
const state: { book: unknown } = { book: null };
vi.mock("@/lib/import/persist", async () => {
  const { commitImport, emptyBook } = await import("@/lib/import/book");
  return {
    runH10Import: async (_u: unknown, csv: string) => {
      state.book ||= emptyBook(10000);
      const out = await commitImport(state.book as never, csv);
      if (out.duplicate) return Response.json({ ok: false, code: "duplicate_file", error: "Already imported." }, { status: 409 });
      return Response.json({ ok: out.ok, error: out.error, data: { written: out.written, duplicates: [] } }, { status: out.ok ? 200 : 400 });
    },
  };
});
vi.mock("@/lib/transactions", () => ({
  applyTransaction: async (user: { _id: string }, input: Record<string, unknown>) => {
    table("transaction").push({ ...input, user: user._id, _id: `t${nextId++}` });
    return {};
  },
}));

const post = async (body?: unknown) => {
  const { POST } = await import("@/app/api/test-hooks/ibkr-fixture-sync/route");
  const req = new Request("http://x/api/test-hooks/ibkr-fixture-sync", { method: "POST", body: body === undefined ? "" : JSON.stringify(body) });
  const res = await POST(req);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

describe("b94 BS-01 fixture hook end to end", () => {
  beforeEach(() => {
    for (const k of Object.keys(db)) delete db[k];
    state.book = null;
    process.env.BROKER_TOKEN_KEY = Buffer.alloc(32, 7).toString("base64"); // test-only key
  });

  it("connect stores the sandbox token encrypted, never in plain text, and the reply has no token", async () => {
    const { SANDBOX_TOKEN_OK } = await import("@/lib/broker-sync/ibkr-sandbox");
    const r = await post({ action: "connect" });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    const rows = table("broker_connection");
    expect(rows).toHaveLength(1);
    expect(String(rows[0].enc_token)).toMatch(/^v1\./);
    expect(JSON.stringify(rows)).not.toContain(SANDBOX_TOKEN_OK);
    expect(JSON.stringify(r.body)).not.toContain(SANDBOX_TOKEN_OK);
    expect(JSON.stringify(r.body)).not.toContain("enc_token");
  });

  it("invalid and expired sandbox tokens are refused and nothing is saved", async () => {
    const { SANDBOX_TOKEN_INVALID, SANDBOX_TOKEN_EXPIRED } = await import("@/lib/broker-sync/ibkr-sandbox");
    for (const [token, code] of [[SANDBOX_TOKEN_INVALID, "1015"], [SANDBOX_TOKEN_EXPIRED, "1012"]]) {
      const r = await post({ action: "connect", token });
      expect(r.status).toBe(400);
      expect(r.body.code).toBe(code);
      expect(String(r.body.error)).toContain("Nothing was saved.");
    }
    expect(table("broker_connection")).toHaveLength(0);
  });

  it("sync commits the fixture; a second sync adds 0 rows", async () => {
    await post({ action: "connect" });
    const first = await post({ action: "sync" });
    expect(first.status).toBe(200);
    expect(Number(first.body.trades)).toBeGreaterThan(0);
    const cashRows = table("transaction").length;
    const again = await post();
    expect(again.status).toBe(200);
    expect(again.body.trades).toBe(0);
    expect(again.body.cash).toBe(0);
    expect(table("transaction").length).toBe(cashRows);
  });

  it("disconnect deletes the row; a second disconnect removes nothing", async () => {
    await post({ action: "connect" });
    const r = await post({ action: "disconnect" });
    expect(r.body).toMatchObject({ ok: true, removed: true, stored: false });
    expect(table("broker_connection")).toHaveLength(0);
    expect((await post({ action: "disconnect" })).body).toMatchObject({ ok: true, removed: false });
  });

  it("anyone not allow-listed gets 404", async () => {
    const saved = USER._id;
    USER._id = "member-9";
    try {
      expect((await post({ action: "connect" })).status).toBe(404);
    } finally {
      USER._id = saved;
    }
  });
});
