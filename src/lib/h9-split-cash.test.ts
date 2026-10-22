/**
 * H-9 (fixture) / split-cash: a buy then a 2:1 split.
 * Cash is unchanged by the split, the average cost halves and the quantity doubles.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Rec = Record<string, unknown> & { _id: string };
const db = vi.hoisted(() => ({
  tables: new Map<string, Map<string, Record<string, unknown> & { _id: string }>>(),
  n: 0,
}));

function table(name: string): Map<string, Rec> {
  let t = db.tables.get(name);
  if (!t) {
    t = new Map();
    db.tables.set(name, t);
  }
  return t;
}

vi.mock("@/lib/totalum", () => ({
  totalumSdk: {
    crud: {
      createRecord: async (c: string, body: Record<string, unknown>) => {
        const id = `${c}-${++db.n}`;
        table(c).set(id, { ...body, _id: id });
        return { data: { ...table(c).get(id) } };
      },
      query: async (c: string, q?: { _filter?: Record<string, unknown> }) => ({
        data: [...table(c).values()]
          .filter((r) => Object.entries(q?._filter ?? {}).every(([k, v]) => r[k] === v))
          .map((r) => ({ ...r })),
      }),
      getRecordById: async (c: string, id: string) => ({ data: { ...table(c).get(id) } }),
      editRecordById: async (c: string, id: string, body: Record<string, unknown>) => {
        const next = { ...(table(c).get(id) as Rec), ...body };
        table(c).set(id, next);
        return { data: { ...next } };
      },
      deleteRecordById: async (c: string, id: string) => {
        table(c).delete(id);
        return {};
      },
    },
  },
}));

vi.mock("@/lib/fx", () => ({
  getFxSnapshot: vi.fn(async () => ({
    ratesToNZD: { NZD: 1, USD: 1.7, AUD: 1.12 },
    live: true,
    sourced: true,
    asOf: "2026-10-13T00:00:00.000Z",
  })),
  historicalNzdPerUnit: vi.fn(async () => 1.7),
}));
vi.mock("@/lib/market-data", () => ({
  fetchLivePrice: vi.fn(async () => null),
  isLiveDataConfigured: vi.fn(() => false),
  fetchCryptoQuotes: vi.fn(async () => ({})),
}));
vi.mock("@/lib/crypto-coingecko", () => ({ dexQuoteRows: vi.fn(async () => []) }));
vi.mock("@/lib/metals", () => ({ getMetalsSpot: vi.fn(async () => ({})) }));
vi.mock("@/lib/crypto-board-store", () => ({
  confirmCryptoQuote: vi.fn(async () => null),
  priceFromSnapshot: vi.fn(async () => null),
}));

import { applyTransaction, type TransactionInput } from "@/lib/transactions";
import { applyLedgerSplits, holdingAfterSplit, splitNote } from "@/lib/stock-split";
import { cashFromLedgerRows } from "@/lib/ledger-cash-lines";
import { sessionCashReadAt } from "@/lib/session";

const START_CASH = 110_517.26;
const user = { _id: "u1", id: "u1", email: "fixture@example.com", name: "Fixture", cash_balance: START_CASH } as never;

function buy(qty: number, price: number, day: string): TransactionInput {
  return {
    type: "buy",
    ticker: "MSFT",
    asset_type: "stock",
    quantity: qty,
    price,
    fx_rate: 1.7,
    executed_at: `${day}T10:00:00+12:00`,
    trade_date: day,
  } as TransactionInput;
}

function split(ratio: number, day: string, staleShares: number, staleAvg: number): TransactionInput {
  // The split route computes these from a read taken before the trade lock.
  const after = holdingAfterSplit(staleShares, staleAvg, ratio);
  return {
    type: "correction",
    ticker: "MSFT",
    asset_type: "stock",
    quantity: after.shares,
    price: after.averageCost,
    notes: splitNote(ratio, day),
    executed_at: day, // b60: the split route stores a date-only value (noon Auckland)
    trade_date: day,
  } as TransactionInput;
}

const holding = (): Rec => [...table("stock").values()][0] as Rec;
const cash = (): number => Number(table("user").get("u1")?.cash_balance);
const ledger = () => [...table("transaction").values()] as Array<Record<string, number | string | null>>;

beforeEach(() => {
  db.tables.clear();
  table("user").set("u1", { _id: "u1", cash_balance: START_CASH });
});

describe("H-9 split-cash: buy then 2:1 split", () => {
  it("leaves cash unchanged, halves the average and doubles the quantity", async () => {
    const bought = await applyTransaction(user, buy(40, 400.12, "2025-06-02"));
    const cashAfterBuy = cash();
    expect(cashAfterBuy).toBeLessThan(START_CASH);
    expect(bought.cashBalance).toBe(cashAfterBuy);

    const res = await applyTransaction(user, split(2, "2025-08-01", 40, 400.12), { fromHoldingEdit: true });
    expect(cash()).toBe(cashAfterBuy);
    expect(res.cashBalance).toBe(cashAfterBuy);
    expect(holding().shares).toBe(80);
    expect(holding().purchase_price).toBeCloseTo(200.06, 6);
    expect(res.holding?.shares).toBe(80);
    expect(res.holding?.purchase_price).toBeCloseTo(200.06, 6);

    const rows = ledger();
    const corr = rows.find((r) => r.type === "correction");
    expect(corr?.total).toBe(0);
    expect(corr?.cash_nzd).toBe(0);
    // Stored cash and the ledger agree after the split.
    expect(cashFromLedgerRows(rows as never) + START_CASH).toBeCloseTo(cash(), 2);
  });

  it("restates from the holding inside the lock when the route's read is stale", async () => {
    await applyTransaction(user, buy(40, 400, "2025-06-02"));
    // The route read 40 @ 400, then a second buy landed before the split took the lock.
    const stale = split(2, "2025-08-01", 40, 400);
    await applyTransaction(user, buy(40, 400.24, "2025-06-03"));
    const cashBeforeSplit = cash();
    await applyTransaction(user, stale, { fromHoldingEdit: true });
    expect(cash()).toBe(cashBeforeSplit);
    expect(holding().shares).toBe(160);
    expect(holding().purchase_price).toBeCloseTo(200.06, 6);
  });
});

describe("H-9 split-cash: session cash is trusted only from a live read", () => {
  it("does not stamp cash_read_at for a cached user record", () => {
    expect(sessionCashReadAt({ cash_balance: 1 }, 123, true)).toBe(123);
    expect(sessionCashReadAt({ cash_balance: 1 }, 123, false)).toBeUndefined();
    expect(sessionCashReadAt(null, 123, true)).toBeUndefined();
    expect(sessionCashReadAt({ cash_balance: "1" }, 123, true)).toBeUndefined();
  });
});

describe("H-9 split-cash: NZ tax regression", () => {
  it("restates pre-split lots with NZ$ cost and cash unchanged", () => {
    const rows = [
      { type: "buy", ticker: "MSFT", quantity: 40, price: 400.12, total: -27_208.16, cash_nzd: -27_208.16, trade_date: "2025-06-02" },
      { type: "correction", ticker: "MSFT", quantity: 80, price: 200.06, total: 0, cash_nzd: 0, notes: splitNote(2, "2025-08-01"), trade_date: "2025-08-01" },
      { type: "buy", ticker: "MSFT", quantity: 10, price: 210, total: -3_570, cash_nzd: -3_570, trade_date: "2025-09-01" },
    ];
    const adjusted = applyLedgerSplits(rows);
    const first = adjusted[0];
    expect(first.quantity).toBe(80);
    expect(first.price).toBeCloseTo(200.06, 6);
    expect(Number(first.quantity) * Number(first.price)).toBeCloseTo(40 * 400.12, 6);
    // A buy after the split date is not restated.
    expect(adjusted[2].quantity).toBe(10);
    expect(adjusted[2].price).toBe(210);
    // Restating for tax never moves cash.
    expect(cashFromLedgerRows(adjusted as never)).toBe(cashFromLedgerRows(rows as never));
    expect(cashFromLedgerRows(rows as never)).toBe(-30_778.16);
  });
});
