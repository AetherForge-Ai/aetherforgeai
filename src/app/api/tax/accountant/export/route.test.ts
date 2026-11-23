import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { getStableSessionUser, loadAccountantLedger, loadHoldingMarks } = vi.hoisted(() => ({
  getStableSessionUser: vi.fn(),
  loadAccountantLedger: vi.fn(),
  loadHoldingMarks: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getStableSessionUser }));
vi.mock("@/lib/accountant-export.server", () => ({ loadAccountantLedger }));
vi.mock("@/lib/tax-book-server", () => ({ loadHoldingMarks }));

import { ACCOUNTANT_PACK_LABEL } from "@/lib/accountant-export-label";
import { GET } from "./route";

const userA = { _id: "user-a", id: "user-a", subscription_plan: "pro", subscription_status: "active", identityConflict: false };

function call(url = "http://localhost/api/tax/accountant/export?year=2026&asOf=2026-03-31&from=2025-04-01&to=2026-03-31", headers?: HeadersInit) {
  return GET(new Request(url, { headers }));
}

describe("GET /api/tax/accountant/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getStableSessionUser.mockResolvedValue(userA);
    loadAccountantLedger.mockResolvedValue([
      { _id: "own", user: "user-a", type: "buy", ticker: "FPH.NZ", asset_name: "Fisher", quantity: 2, price: 5, currency: "NZD", fx_rate: 1, trade_date: "2026-01-10", executed_at: "2026-01-10", cash_nzd: -10 },
      { _id: "other", user: "user-b", type: "buy", ticker: "ZZZZ.NZ", quantity: 99, price: 9, currency: "NZD", fx_rate: 1, trade_date: "2026-01-10", executed_at: "2026-01-10", cash_nzd: -891 },
    ]);
    loadHoldingMarks.mockResolvedValue([{ ticker: "FPH.NZ", shares: 2, currentPrice: 6, currency: "NZD", updatedAt: "2026-03-31" }]);
  });

  it("returns 401 when signed out and does not read a ledger", async () => {
    getStableSessionUser.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ ok: false });
    expect(loadAccountantLedger).not.toHaveBeenCalled();
    expect(loadHoldingMarks).not.toHaveBeenCalled();
  });

  it("refuses a request that claims another account and does not load that account", async () => {
    const res = await call(undefined, { "x-af-user-id": "user-b" });
    expect(res.status).toBe(409);
    const body = JSON.stringify(await res.json());
    expect(body).not.toContain("ZZZZ.NZ");
    expect(body).not.toContain("FPH.NZ");
    expect(loadAccountantLedger).not.toHaveBeenCalled();
  });

  it("downloads only the signed-in user's rows", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/zip");
    expect(res.headers.get("content-disposition")).toContain('filename="accountant-pack-2026.zip"');
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(loadAccountantLedger).toHaveBeenCalledTimes(1);
    expect(loadAccountantLedger).toHaveBeenCalledWith("user-a");
    expect(loadHoldingMarks).toHaveBeenCalledWith("user-a");
    const text = new TextDecoder().decode(await res.arrayBuffer());
    expect(text).toContain("holdings.csv");
    expect(text).toContain("transactions.csv");
    expect(text).toContain("dividends.csv");
    expect(text).toContain("README.txt");
    expect(text).toContain(ACCOUNTANT_PACK_LABEL);
    expect(text).toContain("1 Apr 2025 to 31 Mar 2026");
    expect(text).toContain("FPH.NZ");
    expect(text).toContain("10.00");
    expect(text).toContain("12.00");
    expect(text).not.toContain("ZZZZ.NZ");
  });

  it("downloads for a signed-in free plan as well as a paid plan", async () => {
    getStableSessionUser.mockResolvedValue({ ...userA, subscription_plan: "free" });
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/zip");
    expect(loadAccountantLedger).toHaveBeenCalledWith("user-a");
  });

  it("returns 400 for a date that is not a calendar day", async () => {
    const res = await call("http://localhost/api/tax/accountant/export?asOf=2026-02-31");
    expect(res.status).toBe(400);
    expect(loadAccountantLedger).not.toHaveBeenCalled();
  });

  it("returns a header-only pack when the book is empty", async () => {
    loadAccountantLedger.mockResolvedValue([]);
    loadHoldingMarks.mockResolvedValue([]);
    const res = await call();
    expect(res.status).toBe(200);
    const text = new TextDecoder().decode(await res.arrayBuffer());
    expect(text).toContain("Cost basis NZD");
    expect(text).toContain(ACCOUNTANT_PACK_LABEL);
    expect(text).toContain("only its header row");
    expect(text).not.toContain("FPH.NZ");
  });
});
