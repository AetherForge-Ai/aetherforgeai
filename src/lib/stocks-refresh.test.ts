import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("server-only", () => ({}));

const query = vi.hoisted(() => vi.fn());
const editRecordById = vi.hoisted(() => vi.fn());
const fetchLiveQuotes = vi.hoisted(() => vi.fn());

vi.mock("@/lib/totalum", () => ({
  totalumSdk: {
    crud: {
      query,
      editRecordById,
      getRecordById: vi.fn(),
      createRecord: vi.fn(),
      deleteRecordById: vi.fn(),
    },
  },
}));

vi.mock("@/lib/session", () => ({
  getStableSessionUser: async () => ({
    _id: "user-refresh",
    id: "user-refresh",
    email: "member@example.com",
    name: "Member",
  }),
}));

vi.mock("@/lib/market-data", () => ({
  fetchLiveQuotes,
  fetchCryptoLiveSnapshot: async () => ({ quotes: {}, updatedAt: new Date().toISOString(), live: true }),
  isLiveDataConfigured: () => true,
}));

vi.mock("@/lib/fifo-cost-server", () => ({
  overlayFifoPurchasePrices: async (rows: unknown[]) => rows,
}));

import { POST } from "@/app/api/stocks/refresh/route";

const stored = {
  _id: "row-air",
  user: "user-refresh",
  ticker: "AIR.NZ",
  asset_type: "stock",
  company_name: "Air New Zealand",
  current_price: 0.68,
  purchase_price: 0.5,
  shares: 10,
};

beforeEach(() => {
  query.mockReset();
  editRecordById.mockReset();
  fetchLiveQuotes.mockReset();
  fetchLiveQuotes.mockResolvedValue({});
  editRecordById.mockResolvedValue({ data: {} });
  query.mockResolvedValue({ data: [stored] });
});

describe("POST /api/stocks/refresh", () => {
  it("never changes current_price without a quote", async () => {
    expect(readFileSync("src/app/api/stocks/refresh/route.ts", "utf8")).not.toContain("simulateTick");
    expect(readFileSync("src/lib/market.ts", "utf8")).not.toContain("simulateTick");

    const res = await POST(new Request("http://localhost/api/stocks/refresh", { method: "POST" }));
    const body = (await res.json()) as { ok: boolean; data: Array<{ current_price: number; purchase_price: number }> };
    expect(body.ok).toBe(true);
    expect(body.data[0]?.current_price).toBe(0.68);
    expect(body.data[0]?.purchase_price).toBe(0.5);
    expect(editRecordById).not.toHaveBeenCalled();

    query.mockResolvedValue({
      data: [{ ...stored, _id: "row-empty", current_price: 0, purchase_price: 9.5 }],
    });
    const empty = await POST(new Request("http://localhost/api/stocks/refresh", { method: "POST" }));
    const emptyBody = (await empty.json()) as { data: Array<{ current_price: number }> };
    expect(emptyBody.data[0]?.current_price).toBe(0);
    expect(editRecordById).not.toHaveBeenCalled();
  });
});
