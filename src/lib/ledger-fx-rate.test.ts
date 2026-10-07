import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const createRecord = vi.hoisted(() => vi.fn());
const query = vi.hoisted(() => vi.fn());
const getRecordById = vi.hoisted(() => vi.fn());
const editRecordById = vi.hoisted(() => vi.fn());

vi.mock("@/lib/totalum", () => ({
  totalumSdk: {
    crud: {
      createRecord,
      query,
      getRecordById,
      editRecordById,
      deleteRecordById: vi.fn(),
    },
  },
}));

const historicalNzdPerUnit = vi.hoisted(() =>
  vi.fn(async (_currency: string, day?: string | null) => (day === "2024-10-01" ? 1.64 : null))
);

vi.mock("@/lib/fx", () => ({
  getFxSnapshot: vi.fn(async () => ({
    ratesToNZD: { NZD: 1, USD: 1.78, AUD: 1.12 },
    live: true,
    asOf: "2026-10-07T00:00:00.000Z",
  })),
  historicalNzdPerUnit,
}));

import { applyTransaction } from "@/lib/transactions";
import { BASELINE_FX_TO_NZD } from "@/lib/currency";
import { REVIEWED_FX_REJECTED } from "@/lib/reviewed-book";

const user = {
  _id: "user-1",
  id: "user-1",
  email: "member@example.com",
  name: "Member",
  cash_balance: 1000,
};

function transactionPayload() {
  const call = createRecord.mock.calls.find((entry) => entry[0] === "transaction");
  return call?.[1] as { fx_rate?: number } | undefined;
}

beforeEach(() => {
  createRecord.mockReset();
  createRecord.mockImplementation(async (collection: string) => ({ data: { _id: `${collection}-1` } }));
  query.mockReset();
  query.mockResolvedValue({ data: [] });
  getRecordById.mockReset();
  getRecordById.mockResolvedValue({ data: { cash_balance: 1000 } });
  editRecordById.mockReset();
  editRecordById.mockResolvedValue({ data: {} });
});

describe("opening balance fx_rate", () => {
  it("saves a reviewed USD rate of 1.78", async () => {
    await applyTransaction(user, {
      type: "opening_balance",
      ticker: "AAPL",
      asset_type: "stock",
      quantity: 2,
      price: 100,
      fx_rate: 1.78,
      trade_date: "2026-10-01",
    });
    expect(transactionPayload()?.fx_rate).toBe(1.78);
    expect(transactionPayload()?.fx_rate).not.toBe(BASELINE_FX_TO_NZD.USD);
  });

  it("omits fx_rate when the member did not review one", async () => {
    await applyTransaction(user, {
      type: "opening_balance",
      ticker: "AAPL",
      asset_type: "stock",
      quantity: 2,
      price: 100,
      trade_date: "2026-10-01",
    });
    const payload = transactionPayload();
    expect(payload).toBeTruthy();
    expect(payload).not.toHaveProperty("fx_rate");
    expect(JSON.stringify(payload)).not.toContain(String(BASELINE_FX_TO_NZD.USD));
  });

  it("saves 1 on an NZD opening balance", async () => {
    await applyTransaction(user, {
      type: "opening_balance",
      ticker: "AIR.NZ",
      asset_type: "stock",
      quantity: 10,
      price: 0.68,
      trade_date: "2026-10-01",
    });
    expect(transactionPayload()?.fx_rate).toBe(1);
  });

  it("saves a reviewed USD rate on a paper idea and omits a missing one", async () => {
    await applyTransaction(user, {
      type: "buy",
      ticker: "AAPL",
      asset_type: "stock",
      quantity: 1,
      price: 100,
      fx_rate: 1.78,
      execution_status: "paper",
      trade_date: "2026-10-01",
    });
    expect(transactionPayload()?.fx_rate).toBe(1.78);

    createRecord.mockClear();
    await applyTransaction(user, {
      type: "buy",
      ticker: "AAPL",
      asset_type: "stock",
      quantity: 1,
      price: 100,
      execution_status: "idea",
      trade_date: "2026-10-01",
    });
    expect(transactionPayload()).not.toHaveProperty("fx_rate");
  });

  it("saves a back-dated rate taken from executed_at when it matches that day's rate", async () => {
    await applyTransaction(user, {
      type: "opening_balance",
      ticker: "AAPL",
      asset_type: "stock",
      quantity: 2,
      price: 100,
      fx_rate: 1.64,
      executed_at: "2024-10-01",
    });
    expect(historicalNzdPerUnit).toHaveBeenCalledWith("USD", "2024-10-01");
    expect(transactionPayload()?.fx_rate).toBe(1.64);
  });

  it("still rejects a back-dated rate that matches neither that day nor today's snapshot", async () => {
    await expect(
      applyTransaction(user, {
        type: "opening_balance",
        ticker: "AAPL",
        asset_type: "stock",
        quantity: 2,
        price: 100,
        fx_rate: 2.5,
        executed_at: "2024-10-01",
      })
    ).rejects.toThrow(REVIEWED_FX_REJECTED);
    expect(createRecord.mock.calls.some((entry) => entry[0] === "transaction")).toBe(false);
  });

  it("refuses a reviewed rate more than 5% from the snapshot", async () => {
    await expect(
      applyTransaction(user, {
        type: "opening_balance",
        ticker: "AAPL",
        asset_type: "stock",
        quantity: 2,
        price: 100,
        fx_rate: 1.2,
        trade_date: "2026-10-01",
      })
    ).rejects.toThrow(REVIEWED_FX_REJECTED);
    expect(createRecord.mock.calls.some((entry) => entry[0] === "transaction")).toBe(false);
  });
});
