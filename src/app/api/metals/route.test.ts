import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

const { createRecord, deleteRecordById, recordMetalTrade } = vi.hoisted(() => ({
  createRecord: vi.fn(),
  deleteRecordById: vi.fn(),
  recordMetalTrade: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  getTradeSessionUser: vi.fn(async () => ({ _id: "u1", id: "u1", subscription_status: "active", subscription_plan: "pro" })),
  getStableSessionUser: vi.fn(),
  isStripeConfigured: () => false,
  hasPaidSubscription: () => true,
}));
vi.mock("@/lib/totalum", () => ({ totalumSdk: { crud: { createRecord, deleteRecordById } } }));
vi.mock("@/lib/transactions", () => ({ recordMetalTrade }));
vi.mock("@/lib/metals", () => ({ getMetalsSpot: vi.fn() }));

import { POST } from "./route";

const buy = () =>
  new Request("http://x/api/metals", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ metal: "gold", ounces: 1, purchase_price_per_oz: 4000, confirm: true }),
  });

describe("b63 POST /api/metals insufficient cash", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createRecord.mockResolvedValue({ data: { _id: "m1" } });
    deleteRecordById.mockResolvedValue({});
  });

  it("answers 422 with the ledger message, not 500, and removes the holding", async () => {
    recordMetalTrade.mockRejectedValue(new Error("Insufficient cash — this buy needs NZ$4000.00 and you have NZ$10.00 available."));
    const res = await POST(buy());
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/^Insufficient cash/);
    expect(body.data.code).toBe("insufficient_cash");
    expect(deleteRecordById).toHaveBeenCalledWith("precious_metal", "m1");
  });

  it("still answers 500 for a real server fault", async () => {
    recordMetalTrade.mockRejectedValue(new Error("store down"));
    const res = await POST(buy());
    expect(res.status).toBe(500);
  });
});
