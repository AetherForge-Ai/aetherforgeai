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
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("x-export-truncated")).toBe("0");
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

  it("returns 403 for Free before any ledger read", async () => {
    getStableSessionUser.mockResolvedValue({ ...userA, subscription_plan: "free" });
    const res = await call("http://localhost/api/tax/accountant/export?asOf=2026-02-31&userId=user-b");
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ ok: false, data: { code: "not_entitled" } });
    expect(loadAccountantLedger).not.toHaveBeenCalled();
    expect(loadHoldingMarks).not.toHaveBeenCalled();
  });

  it("returns 200 for Starter and Pro", async () => {
    for (const plan of ["starter_monthly", "pro_monthly", "starter_yearly", "pro_yearly"]) {
      getStableSessionUser.mockResolvedValue({ ...userA, subscription_plan: plan });
      const res = await call();
      expect(res.status, plan).toBe(200);
      expect(loadAccountantLedger).toHaveBeenCalledWith("user-a");
    }
  });

  it("ignores a userId query and still reads the session account", async () => {
    const res = await call("http://localhost/api/tax/accountant/export?year=2026&asOf=2026-03-31&from=2025-04-01&to=2026-03-31&userId=user-b");
    expect(res.status).toBe(200);
    expect(loadAccountantLedger).toHaveBeenCalledTimes(1);
    expect(loadAccountantLedger).toHaveBeenCalledWith("user-a");
    expect(loadAccountantLedger).not.toHaveBeenCalledWith("user-b");
    const text = new TextDecoder().decode(await res.arrayBuffer());
    expect(text).not.toContain("ZZZZ.NZ");
    expect(text).toContain("FPH.NZ");
  });

  it("returns a page for a bad date instead of JSON", async () => {
    const res = await call("http://localhost/api/tax/accountant/export?asOf=2026-02-31");
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const text = await res.text();
    expect(text.startsWith("{")).toBe(false);
    expect(text).toContain("Use dates as YYYY-MM-DD.");
    expect(text).toContain("Back to Tax");
    expect(loadAccountantLedger).not.toHaveBeenCalled();
  });

  it("sets X-Export-Truncated and names the counts when the read passes 5,000 rows", async () => {
    const rows = Array.from({ length: 5001 }, (_, index) => ({
      _id: String(index).padStart(5, "0"),
      user: "user-a",
      type: "fee",
      trade_date: "2026-01-01",
      executed_at: "2026-01-01",
      cash_nzd: -1,
    }));
    loadAccountantLedger.mockResolvedValue(rows);
    loadHoldingMarks.mockResolvedValue([]);
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("x-export-truncated")).toBe("1");
    const text = new TextDecoder().decode(await res.arrayBuffer());
    expect(text).toContain("Truncated: 5001 rows were read and 5000 are included, chosen by date then id.");
    expect(text).toContain(",04999");
    expect(text).not.toContain(",05000");
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
