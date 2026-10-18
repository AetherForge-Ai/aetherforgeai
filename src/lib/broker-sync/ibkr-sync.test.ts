import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({ batches: new Set<string>(), notes: [] as string[], marks: [] as Array<[string, string | null]> }));

vi.mock("@/lib/import/persist", () => ({
  runH10Import: vi.fn(async (_u: unknown, csv: string) => {
    if (state.batches.has(csv)) return new Response(JSON.stringify({ ok: false, code: "duplicate_file" }), { status: 409 });
    state.batches.add(csv);
    return new Response(JSON.stringify({ ok: true, data: { written: csv.split("\n").length - 1, duplicates: [] } }), { status: 200 });
  }),
}));
vi.mock("@/lib/transactions", () => ({
  applyTransaction: vi.fn(async (_u: unknown, input: { notes: string }) => {
    state.notes.push(input.notes);
    return { ok: true };
  }),
}));
vi.mock("@/lib/totalum", () => ({
  totalumSdk: { crud: { query: vi.fn(async () => ({ data: state.notes.map((notes) => ({ notes })) })) } },
}));
vi.mock("@/lib/book-cache", () => ({ invalidateBookCache: vi.fn() }));
vi.mock("@/lib/broker-sync/connection-store.server", () => ({
  markSync: vi.fn(async (_id: string, status: string, err: string | null) => {
    state.marks.push([status, err]);
  }),
}));
vi.mock("@/lib/broker-sync/token-crypto.server", () => ({ decryptToken: vi.fn(async () => "1234567890123456789012") }));

import { applyFlexStatement, syncConnection } from "./ibkr-sync.server";
import { parseFlexResponse } from "./ibkr-flex";

const XML = `<FlexQueryResponse><FlexStatements><FlexStatement>
  <Trades><Trade tradeID="555" assetCategory="STK" symbol="AAPL" tradeDate="20260302" quantity="2" tradePrice="200" ibCommission="-1" buySell="BUY" currency="USD" fxRateToBase="1.7" proceeds="-400" accountId="U1"/></Trades>
  <CashTransactions>
    <CashTransaction transactionID="9" type="Dividends" symbol="AAPL" dateTime="20260315" amount="1.20" currency="USD" fxRateToBase="1.7"/>
    <CashTransaction transactionID="10" type="Deposits/Withdrawals" dateTime="20260301" amount="1000.005" currency="NZD" fxRateToBase="1"/>
  </CashTransactions></FlexStatement></FlexStatements></FlexQueryResponse>`;
const user = { _id: "u1" } as never;
const conn = { _id: "c1", user: "u1", broker: "ibkr", enc_token: "v1.x", query_id: "123456", last_sync: null, status: "active", last_error: null } as never;

beforeEach(() => {
  state.batches.clear();
  state.notes.length = 0;
  state.marks.length = 0;
  vi.unstubAllGlobals();
});

describe("BS-01 re-sync idempotency", () => {
  it("a second sync of the same statement writes nothing new", async () => {
    const first = await applyFlexStatement(user, XML);
    expect(first).toMatchObject({ trades: 1, cash: 2 });
    const second = await applyFlexStatement(user, XML);
    expect(second.trades).toBe(0);
    expect(second.cash).toBe(0);
    expect(second.duplicates).toBe(2);
    expect(state.notes.filter((n) => n.includes("ref=ibkrcash-9"))).toHaveLength(1);
  });
  it("cash reconciles to the cent", async () => {
    const { applyTransaction } = await import("@/lib/transactions");
    await applyFlexStatement(user, XML);
    const amounts = vi.mocked(applyTransaction).mock.calls.slice(-2).map((c) => (c[1] as { amount: number }).amount);
    expect(amounts).toEqual([2.04, 1000.01]);
  });
});

describe("BS-01 IBKR errors", () => {
  it("1013 IP restriction is a clear error, stored without the token", async () => {
    expect(parseFlexResponse("<FlexStatementResponse><Status>Fail</Status><ErrorCode>1013</ErrorCode></FlexStatementResponse>")).toMatchObject({ ok: false, code: "1013" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<FlexStatementResponse><Status>Fail</Status><ErrorCode>1013</ErrorCode><ErrorMessage>IP</ErrorMessage></FlexStatementResponse>")));
    const out = await syncConnection(user, conn);
    expect(out.ok).toBe(false);
    expect(out.message).toMatch(/IP/);
    expect(out.message).not.toContain("1234567890123456789012");
    expect(state.marks.at(-1)?.[0]).toBe("error");
  });
  it("1012 expired marks the connection expired", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<FlexStatementResponse><Status>Fail</Status><ErrorCode>1012</ErrorCode></FlexStatementResponse>")));
    const out = await syncConnection(user, conn);
    expect(out.message).toMatch(/expired/);
    expect(state.marks.at(-1)?.[0]).toBe("expired");
  });
});
