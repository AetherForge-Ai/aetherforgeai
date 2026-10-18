import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Row = Record<string, any> & { _id: string };
const db: Record<string, Row[]> = { transaction: [], stock: [], precious_metal: [], user: [] };
let seq = 0;
const table = (t: string) => (db[t] ||= []);
const crud = {
  getRecordById: vi.fn(async (t: string, id: string) => ({ data: table(t).find((r) => r._id === id) })),
  query: vi.fn(async (t: string, q: { _filter?: { user?: string } }) => ({
    data: table(t).filter((r) => !q?._filter?.user || r.user === q._filter.user),
  })),
  editRecordById: vi.fn(async (t: string, id: string, patch: Row) => {
    const r = table(t).find((x) => x._id === id);
    if (r) Object.assign(r, patch);
    return { data: r };
  }),
  deleteRecordById: vi.fn(async (t: string, id: string) => {
    db[t] = table(t).filter((r) => r._id !== id);
    return {};
  }),
  createRecord: vi.fn(async (t: string, rec: Row) => {
    const row = { ...rec, _id: `${t}-${++seq}` };
    table(t).push(row);
    return { data: row };
  }),
};
vi.mock("@/lib/totalum", () => ({ totalumSdk: { crud } }));
vi.mock("@/lib/fx", () => ({ getFxSnapshot: async () => ({ ratesToNZD: { NZD: 1, USD: 1, AUD: 1 } }) }));
vi.mock("@/lib/book-cache", () => ({ invalidateBookCache: vi.fn(), onBookInvalidated: vi.fn() }));
vi.mock("@/lib/book-version.server", () => ({}));
vi.mock("@/lib/activity-email-server", () => ({ readActivityEmailPrefs: vi.fn() }));
const user = { _id: "u1" };
vi.mock("@/lib/session", () => ({
  getTradeSessionUser: async () => user,
  getStableSessionUser: async () => user,
}));
const failNext = { on: false };
/** Stand-in for the real booking path: NZD stock, recompute holding by replay. */
vi.mock("@/lib/transactions", () => ({
  loadLedger: vi.fn(),
  ledgerAfterBooking: vi.fn(),
  applyTransaction: vi.fn(async (u: { _id: string }, input: Row) => {
    if (failNext.on) {
      failNext.on = false;
      throw new Error("Quote service down");
    }
    const holding = db.stock.find((s) => s.ticker === input.ticker);
    const held = Number(holding?.shares || 0);
    if (input.type === "sell" && input.quantity > held + 1e-9) throw new Error("You hold fewer units than that.");
    const gross = input.quantity * input.price;
    const me = db.user.find((x) => x._id === u._id)!;
    const cash_nzd = input.type === "buy" ? -(gross + (input.fees || 0)) : gross - (input.fees || 0);
    me.cash_balance += cash_nzd;
    const shares = held + (input.type === "buy" ? input.quantity : -input.quantity);
    if (holding) holding.shares = shares;
    else db.stock.push({ _id: `stock-${++seq}`, ticker: input.ticker, asset_type: "stock", shares, purchase_price: input.price, user: u._id });
    const tx = { ...input, cash_nzd, _id: `transaction-${++seq}`, user: u._id, execution_status: "filled" };
    delete tx.confirm;
    db.transaction.push(tx);
    return { transaction: tx, cashBalance: me.cash_balance };
  }),
}));

const route = await import("@/app/api/transactions/route");
const { applyTransaction } = await import("@/lib/transactions");

function seed() {
  seq = 0;
  failNext.on = false;
  db.user = [{ _id: "u1", cash_balance: 1000 }, { _id: "u2", cash_balance: 50 }];
  db.stock = [{ _id: "s1", ticker: "AIR.NZ", asset_type: "stock", shares: 4, purchase_price: 1, current_price: 1, user: "u1" }];
  db.precious_metal = [];
  const base = { ticker: "AIR.NZ", asset_type: "stock", currency: "NZD", fees: 0, execution_status: "filled", user: "u1", notes: "kept" };
  db.transaction = [
    { ...base, _id: "b1", type: "buy", quantity: 10, price: 1, cash_nzd: -10, executed_at: "2026-01-01T00:00:00.000Z" },
    { ...base, _id: "x1", type: "sell", quantity: 6, price: 2, cash_nzd: 12, executed_at: "2026-02-01T00:00:00.000Z" },
    { ...base, _id: "o1", type: "buy", quantity: 1, price: 1, executed_at: "2026-01-01T00:00:00.000Z", user: "u2" },
  ];
}
const del = (id: string) => route.DELETE(new Request(`http://t/api/transactions?id=${id}`, { method: "DELETE" }));
const patch = (body: unknown) =>
  route.PATCH(new Request("http://t/api/transactions", { method: "PATCH", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));

describe("BL-7 DELETE a trade row", () => {
  beforeEach(() => {
    seed();
    vi.clearAllMocks();
  });
  it("removes a sell: cash goes back, holding is replayed, audit line written", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const res = await del("x1");
    expect(res.status).toBe(200);
    expect(db.transaction.find((r) => r._id === "x1")).toBeUndefined();
    expect(db.user[0].cash_balance).toBe(988);
    expect(db.stock[0].shares).toBe(10);
    expect(log.mock.calls.some((c) => c[0] === "[ledger-audit]" && String(c[1]).includes('"action":"delete"'))).toBe(true);
    log.mockRestore();
  });
  it("refuses removing a buy a later sell depends on, and writes nothing", async () => {
    const res = await del("b1");
    expect(res.status).toBe(409);
    expect(db.transaction).toHaveLength(3);
    expect(db.user[0].cash_balance).toBe(1000);
    expect(crud.editRecordById).not.toHaveBeenCalledWith("user", "u1", expect.anything());
  });
  it("hides another account's row", async () => {
    expect((await del("o1")).status).toBe(404);
    expect(db.transaction).toHaveLength(3);
  });
});

describe("BL-7 PATCH a trade row", () => {
  beforeEach(() => {
    seed();
    vi.clearAllMocks();
  });
  it("needs confirm", async () => {
    expect((await patch({ id: "x1", quantity: 5 })).status).toBe(400);
  });
  it("edits a sell: cash and holding recomputed, notes and date kept", async () => {
    const res = await patch({ id: "x1", quantity: 5, confirm: true });
    expect(res.status).toBe(200);
    const sells = db.transaction.filter((r) => r.type === "sell");
    expect(sells).toHaveLength(1);
    expect(sells[0]).toMatchObject({ quantity: 5, price: 2, notes: "kept", executed_at: "2026-02-01T00:00:00.000Z" });
    expect(db.user[0].cash_balance).toBe(998);
    expect(db.stock[0].shares).toBe(5);
  });
  it("refuses an edit that oversells, before any write", async () => {
    const res = await patch({ id: "x1", quantity: 11, confirm: true });
    expect(res.status).toBe(409);
    expect(applyTransaction).not.toHaveBeenCalled();
    expect(db.transaction.find((r) => r._id === "x1")).toBeTruthy();
  });
  it("refuses shrinking a buy below a later sell", async () => {
    expect((await patch({ id: "b1", quantity: 5, confirm: true })).status).toBe(409);
    expect(db.user[0].cash_balance).toBe(1000);
  });
  it("edits a buy, keeping the original until the new one is booked", async () => {
    const res = await patch({ id: "b1", price: 1.5, confirm: true });
    expect(res.status).toBe(200);
    const buys = db.transaction.filter((r) => r.type === "buy" && r.user === "u1");
    expect(buys).toHaveLength(1);
    expect(buys[0]).toMatchObject({ quantity: 10, price: 1.5, notes: "kept" });
    expect(db.user[0].cash_balance).toBe(995);
    expect(db.stock[0].shares).toBe(4);
  });
  it("a failed buy edit leaves the original row (same id) and cash untouched", async () => {
    failNext.on = true;
    expect((await patch({ id: "b1", price: 1.5, confirm: true })).status).toBe(400);
    expect(db.transaction.find((r) => r._id === "b1")).toMatchObject({ price: 1, quantity: 10 });
    expect(db.user[0].cash_balance).toBe(1000);
  });
  it("a failed sell edit books the original back with every field", async () => {
    failNext.on = true;
    expect((await patch({ id: "x1", quantity: 5, confirm: true })).status).toBe(400);
    const sells = db.transaction.filter((r) => r.type === "sell");
    expect(sells).toHaveLength(1);
    expect(sells[0]).toMatchObject({ quantity: 6, price: 2, notes: "kept", executed_at: "2026-02-01T00:00:00.000Z", currency: "NZD" });
    expect(db.user[0].cash_balance).toBe(1000);
    expect(db.stock[0].shares).toBe(4);
  });
  it("hides another account's row", async () => {
    expect((await patch({ id: "o1", quantity: 2, confirm: true })).status).toBe(404);
  });
});
