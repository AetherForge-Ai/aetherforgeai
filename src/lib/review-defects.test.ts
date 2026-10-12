import { readFileSync } from "node:fs";
import * as crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BASELINE_FX_TO_NZD } from "@/lib/currency";
import { withIdempotencyNote } from "@/lib/confirm-once";
import { cronSecretBuffers, presentedHeaderCronSecret } from "@/lib/cron-header-secret";
import {
  auditLivePrice,
  bookingFxDecision,
  FX_RATE_UNAVAILABLE,
  ratesForBooking,
  REVIEWED_FX_REJECTED,
} from "@/lib/reviewed-book";

vi.mock("server-only", () => ({}));

const createRecord = vi.hoisted(() => vi.fn());
const query = vi.hoisted(() => vi.fn());
const getRecordById = vi.hoisted(() => vi.fn());
const editRecordById = vi.hoisted(() => vi.fn());
const deleteRecordById = vi.hoisted(() => vi.fn());
const getFxSnapshot = vi.hoisted(() => vi.fn());
const historicalNzdPerUnit = vi.hoisted(() => vi.fn());
const priceFromSnapshot = vi.hoisted(() => vi.fn());

vi.mock("@/lib/totalum", () => ({
  totalumSdk: {
    crud: {
      createRecord,
      query,
      getRecordById,
      editRecordById,
      deleteRecordById,
    },
  },
}));

vi.mock("@/lib/fx", () => ({
  getFxSnapshot,
  historicalNzdPerUnit,
}));

vi.mock("@/lib/market-data", () => ({
  fetchLivePrice: vi.fn(async () => null),
  isLiveDataConfigured: vi.fn(() => false),
}));

vi.mock("@/lib/crypto-board-store", () => ({
  priceFromSnapshot,
  confirmCryptoQuote: (input: unknown) => priceFromSnapshot(input),
}));

import { applyTransaction } from "@/lib/transactions";
import { coinToIntel } from "@/lib/koins-market";
import { analyzeSecurity } from "@/lib/market-intel";
import type { CoinMarket } from "@/lib/crypto-market";

const user = {
  _id: "user-review-defects",
  id: "user-review-defects",
  email: "member@example.com",
  name: "Member",
  cash_balance: 10000,
};

function transactionPayload() {
  const call = createRecord.mock.calls.find((entry) => entry[0] === "transaction");
  return call?.[1] as { fx_rate?: number; notes?: string } | undefined;
}

beforeEach(() => {
  createRecord.mockReset();
  createRecord.mockImplementation(async (collection: string) => ({ data: { _id: `${collection}-1` } }));
  query.mockReset();
  query.mockResolvedValue({ data: [] });
  getRecordById.mockReset();
  getRecordById.mockImplementation(async (collection: string) => {
    if (collection === "user") return { data: { cash_balance: 10000 } };
    const stock = createRecord.mock.calls.find((entry) => entry[0] === "stock");
    return { data: { shares: stock?.[1]?.shares ?? 0 } };
  });
  editRecordById.mockReset();
  editRecordById.mockResolvedValue({ data: {} });
  deleteRecordById.mockReset();
  deleteRecordById.mockResolvedValue({ data: {} });
  getFxSnapshot.mockReset();
  historicalNzdPerUnit.mockReset();
  historicalNzdPerUnit.mockResolvedValue(null);
  priceFromSnapshot.mockReset();
  priceFromSnapshot.mockResolvedValue(null);
});

describe("booking FX never uses the baseline table", () => {
  it("rejects a timeout when the trade date has no rate", () => {
    const decision = bookingFxDecision({
      currency: "USD",
      reviewed: null,
      snapshot: null,
      historical: null,
    });
    expect(decision.ok).toBe(false);
    if (decision.ok === false) {
      expect(decision.message).toBe(FX_RATE_UNAVAILABLE);
      expect(decision.message).not.toContain(String(BASELINE_FX_TO_NZD.USD));
    }
    const baseline = bookingFxDecision({
      currency: "USD",
      reviewed: null,
      snapshot: { ratesToNZD: { ...BASELINE_FX_TO_NZD }, sourced: false },
      historical: null,
    });
    expect(baseline.ok).toBe(false);
  });

  it("books the trade-date rate when the snapshot times out", () => {
    const decision = bookingFxDecision({
      currency: "USD",
      reviewed: null,
      snapshot: null,
      historical: 1.64,
    });
    expect(decision.ok).toBe(true);
    if (decision.ok) {
      expect(decision.ratesToNZD.USD).toBe(1.64);
      expect(decision.ratesToNZD.USD).not.toBe(BASELINE_FX_TO_NZD.USD);
      expect(decision.ratesToNZD.AUD).not.toBe(BASELINE_FX_TO_NZD.AUD);
    }
  });

  it("checks a back-dated reviewed rate against the trade-date rate", () => {
    const snapshot = { ratesToNZD: { NZD: 1, AUD: 1.7, USD: 1.7 }, sourced: true as const };
    const allowed = bookingFxDecision({
      currency: "AUD",
      reviewed: 1.22,
      snapshot,
      historical: 1.2,
    });
    expect(allowed.ok).toBe(true);
    if (allowed.ok) expect(ratesForBooking("AUD", 1.22, allowed.ratesToNZD).AUD).toBe(1.22);
    const rejected = bookingFxDecision({
      currency: "AUD",
      reviewed: 1.7,
      snapshot,
      historical: 1.2,
    });
    expect(rejected.ok).toBe(false);
    if (rejected.ok === false) expect(rejected.message).toBe(REVIEWED_FX_REJECTED);
  });

  it("keeps a non-baseline snapshot that omits sourced", () => {
    const decision = bookingFxDecision({
      currency: "USD",
      reviewed: null,
      snapshot: { ratesToNZD: { NZD: 1, USD: 1.78, AUD: 1.12 } },
      historical: null,
    });
    expect(decision.ok).toBe(true);
    if (decision.ok) expect(decision.ratesToNZD.USD).toBe(1.78);
  });
});

describe("Confirm wiring for the review defects", () => {
  it("rejects a hung snapshot instead of booking 1.67", async () => {
    getFxSnapshot.mockImplementation(() => new Promise(() => {}));
    historicalNzdPerUnit.mockResolvedValue(null);
    await expect(
      applyTransaction(
        user,
        {
          type: "buy",
          ticker: "AAPL",
          asset_type: "stock",
          quantity: 1,
          price: 10,
          trade_date: "2024-06-01",
        },
        { rejectionChecked: true }
      )
    ).rejects.toThrow(FX_RATE_UNAVAILABLE);
    expect(createRecord.mock.calls.some((entry) => entry[0] === "transaction")).toBe(false);
    expect(JSON.stringify(createRecord.mock.calls)).not.toContain(String(BASELINE_FX_TO_NZD.USD));
  });

  it("books the trade-date rate when the snapshot does not return", async () => {
    getFxSnapshot.mockImplementation(() => new Promise(() => {}));
    historicalNzdPerUnit.mockResolvedValue(1.64);
    await applyTransaction(
      user,
      {
        type: "buy",
        ticker: "AAPL",
        asset_type: "stock",
        quantity: 1,
        price: 10,
        trade_date: "2024-10-01",
      },
      { rejectionChecked: true }
    );
    expect(historicalNzdPerUnit).toHaveBeenCalledWith("USD", "2024-10-01");
    expect(transactionPayload()?.fx_rate).toBe(1.64);
    expect(transactionPayload()?.fx_rate).not.toBe(BASELINE_FX_TO_NZD.USD);
  });

  it("rejects a reviewed rate that matches today and misses the trade date", async () => {
    getFxSnapshot.mockResolvedValue({
      ratesToNZD: { NZD: 1, AUD: 1.7, USD: 1.7 },
      live: false,
      sourced: true,
      asOf: "2026-10-12T00:00:00.000Z",
    });
    historicalNzdPerUnit.mockResolvedValue(1.2);
    await expect(
      applyTransaction(
        user,
        {
          type: "buy",
          ticker: "BHP.AX",
          asset_type: "stock",
          quantity: 1,
          price: 40,
          fx_rate: 1.7,
          trade_date: "2024-10-01",
        },
        { rejectionChecked: true }
      )
    ).rejects.toThrow(REVIEWED_FX_REJECTED);
    await applyTransaction(
      user,
      {
        type: "buy",
        ticker: "BHP.AX",
        asset_type: "stock",
        quantity: 1,
        price: 40,
        fx_rate: 1.22,
        trade_date: "2024-10-01",
      },
      { rejectionChecked: true }
    );
    expect(transactionPayload()?.fx_rate).toBe(1.22);
  });

  it("prints live=n/a when the snapshot has no price", async () => {
    getFxSnapshot.mockResolvedValue({
      ratesToNZD: { NZD: 1, USD: 1.78, AUD: 1.12 },
      live: false,
      sourced: true,
      asOf: "2026-10-12T00:00:00.000Z",
    });
    priceFromSnapshot.mockResolvedValue(null);
    await applyTransaction(
      user,
      {
        type: "buy",
        ticker: "PEPE",
        asset_type: "crypto",
        quantity: 1000,
        price: 0.000004,
        fx_rate: 1.78,
        trade_date: "2026-10-12",
      },
      { rejectionChecked: true }
    );
    const notes = transactionPayload()?.notes || "";
    expect(notes).toContain("live=n/a");
    expect(notes).not.toContain("live: n/a");
    expect(notes).not.toContain("live=0.000004");
    expect(notes).toContain("chain=Ethereum");
    expect(notes).toContain("pxat=");
    expect(auditLivePrice(null)).toBeNull();
    expect(auditLivePrice(0.000009)).toBe(0.000009);
  });

  it("writes the server snapshot price as live= even when the form omits quote_origin", async () => {
    getFxSnapshot.mockResolvedValue({
      ratesToNZD: { NZD: 1, USD: 1.78, AUD: 1.12 },
      live: false,
      sourced: true,
      asOf: "2026-10-12T00:00:00.000Z",
    });
    priceFromSnapshot.mockResolvedValue({ price: 0.00000421, quotedAt: "2026-10-12T10:52:00.000Z", chain: "Ethereum" });
    await applyTransaction(
      user,
      {
        type: "buy",
        ticker: "PEPE",
        asset_type: "crypto",
        quantity: 1000,
        price: 0.00000421,
        fx_rate: 1.78,
        trade_date: "2026-10-12",
      },
      { rejectionChecked: true }
    );
    const notes = transactionPayload()?.notes || "";
    expect(notes).toContain("live=0.00000421");
    expect(notes).not.toContain("live=n/a");
    expect(notes).not.toContain("live: n/a");
    expect(notes).toContain("chain=Ethereum");
  });

  it("does not use the fill as live= when quote_origin says snapshot and the server has no price", async () => {
    getFxSnapshot.mockResolvedValue({
      ratesToNZD: { NZD: 1, USD: 1.78, AUD: 1.12 },
      live: false,
      sourced: true,
      asOf: "2026-10-12T00:00:00.000Z",
    });
    priceFromSnapshot.mockResolvedValue(null);
    await applyTransaction(
      user,
      {
        type: "buy",
        ticker: "PEPE",
        asset_type: "crypto",
        quantity: 1000,
        price: 0.000004,
        fx_rate: 1.78,
        trade_date: "2026-10-12",
        quote_origin: "snapshot",
        price_as_at: "2026-10-12T10:52:00.000Z",
        price_source: "live_quote",
      },
      { rejectionChecked: true }
    );
    const notes = transactionPayload()?.notes || "";
    expect(notes).toContain("live=n/a");
    expect(notes).not.toContain("live=0.000004");
    expect(notes).not.toContain("live: n/a");
    expect(notes).toContain("chain=Ethereum");
    expect(notes).toContain("pxat=2026-10-12T10:52:00.000Z");
  });

  it("deletes the buy row when the cash update fails", async () => {
    getFxSnapshot.mockResolvedValue({
      ratesToNZD: { NZD: 1, USD: 1.78, AUD: 1.12 },
      live: false,
      sourced: true,
      asOf: "2026-10-12T00:00:00.000Z",
    });
    const order: string[] = [];
    createRecord.mockImplementation(async (collection: string) => {
      order.push(`create:${collection}`);
      return { data: { _id: `${collection}-1` } };
    });
    editRecordById.mockImplementation(async (collection: string) => {
      order.push(`edit:${collection}`);
      if (collection === "user") throw new Error("cash write failed");
      return { data: {} };
    });
    await expect(
      applyTransaction(
        user,
        {
          type: "buy",
          ticker: "AIR.NZ",
          asset_type: "stock",
          quantity: 1,
          price: 1,
          trade_date: "2026-10-12",
        },
        { rejectionChecked: true }
      )
    ).rejects.toThrow("cash write failed");
    expect(order.indexOf("create:transaction")).toBeGreaterThanOrEqual(0);
    expect(order.indexOf("create:transaction")).toBeLessThan(order.indexOf("edit:user"));
    expect(deleteRecordById).toHaveBeenCalledWith("transaction", "transaction-1");
  });
});

describe("Koins universe after the develop merge", () => {
  it("clamps a missing 7-day projection and reads the shared DEX board", () => {
    const coin = {
      id: "zzz",
      symbol: "ZZZ",
      name: "Zed",
      image: "",
      rank: 1,
      price: 2,
      marketCap: 1,
      fdv: null,
      volume24h: 1,
      change1h: null,
      change24h: 3,
      change7d: 0,
      high24h: null,
      low24h: null,
      circulatingSupply: null,
      totalSupply: null,
      maxSupply: null,
      ath: null,
      athDate: null,
      atl: null,
      atlDate: null,
      sparkline7d: [],
      blockchain: "",
      priceUnavailable: false,
      moves: { h24: 3, d7: null, d30: null },
    } as CoinMarket;
    const base = analyzeSecurity("ZZZ", 2, "Zed", "CRYPTO");
    const intel = coinToIntel(coin);
    const clamped = Math.round(Math.max(-12, Math.min(12, base.projected7dPct)) * 100) / 100;
    expect(intel.projected7dPct).toBe(clamped);
    expect(intel.projected7dPct).toBeGreaterThanOrEqual(-12);
    expect(intel.projected7dPct).toBeLessThanOrEqual(12);
    const src = readFileSync("src/lib/koins-market.ts", "utf8");
    expect(src).toContain("readSharedDexBoard");
    expect(src).toContain("dexRowToCoin");
    expect(src).toContain("clamp(base.projected7dPct, -12, 12)");
    expect(src).toContain("held names still stay on the report");
  });
});

describe("idempotency stamp and cron secret", () => {
  it("keeps the idem stamp after a long note is cut", () => {
    const key = "review-key-1";
    const out = withIdempotencyNote("n".repeat(500), key);
    expect(out.length).toBeLessThanOrEqual(500);
    expect(out.endsWith(`idem=${key}`)).toBe(true);
    expect(withIdempotencyNote("note", "abc")).toContain("idem=abc");
  });

  it("compares the cron secret on equal buffers and ignores a query secret", () => {
    expect(cronSecretBuffers("correct-secret", "short")).toBeNull();
    const headers = new Headers({ "x-cron-secret": "correct-secret" });
    const buffers = cronSecretBuffers("correct-secret", presentedHeaderCronSecret(headers));
    expect(buffers).not.toBeNull();
    expect(crypto.timingSafeEqual(buffers!.expected, buffers!.presented)).toBe(true);
    const wrong = cronSecretBuffers("correct-secret", "correct-secreT");
    expect(wrong).not.toBeNull();
    expect(crypto.timingSafeEqual(wrong!.expected, wrong!.presented)).toBe(false);
    expect(presentedHeaderCronSecret(new Headers())).toBeNull();
    expect(presentedHeaderCronSecret(new Headers({ authorization: "Bearer correct-secret" }))).toBe("correct-secret");
    const route = readFileSync("src/app/api/cron/crypto-snapshot/route.ts", "utf8");
    expect(route).toContain("crypto.timingSafeEqual");
    expect(route).not.toContain("presentedCronSecret");
    expect(route).not.toContain("searchParams");
    const writer = readFileSync("src/lib/transactions.ts", "utf8");
    expect(writer).toContain("historicalNzdPerUnit(currency, tradeDay)");
    expect(writer).toContain("ratesForBooking(currency, input.fx_rate, fx.ratesToNZD)");
    expect(writer).toContain("const auditLive = auditLivePrice(auditSpot)");
    expect(writer).toContain("live=n/a");
    expect(writer).not.toContain('assetType === "crypto" && input.quote_origin !== "snapshot"');
    expect(writer).not.toContain('quote_origin === "snapshot" && price > 0');
    expect(writer).not.toContain("BASELINE_FX_TO_NZD");
    expect(writer).not.toContain("reviewedFx > 0 ? null");
  });
});
