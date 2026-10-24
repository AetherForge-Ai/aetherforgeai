// pull-check:v3-goal-b66-2026-10-24
import { vi, afterEach, describe, expect, it } from "vitest";
vi.mock("server-only", () => ({}));
import { fillFromLastGood, readPageWithRetry, rememberFullList, resetLastGoodList, LAST_GOOD_MAX_AGE_MS } from "@/lib/coingecko-pull";
import { cryptoCountLine, cryptoHeaderCount } from "@/lib/crypto-coverage";
import { isInsufficientCashError, tradeErrorResponse } from "@/lib/trade-error-status";
import { aiProviderStatusLine } from "@/lib/ai-provider-health";

const list = (n: number, from = 1) => Array.from({ length: n }, (_, i) => ({ id: `c${i + from}`, rank: i + from }));

describe("b63 CoinGecko pull", () => {
  afterEach(() => resetLastGoodList());

  it("retries a rate-limited page and returns its rows", async () => {
    let calls = 0;
    const out = await readPageWithRetry(async () => (++calls < 3 ? { rows: [], status: 429, retryable: true } : { rows: [1, 2], status: 200, retryable: false }), [0, 0], async () => {});
    expect(calls).toBe(3);
    expect(out.rows).toHaveLength(2);
  });

  it("does not retry a non-retryable status", async () => {
    let calls = 0;
    await readPageWithRetry(async () => (calls++, { rows: [], status: 403, retryable: false }), [0, 0], async () => {});
    expect(calls).toBe(1);
  });

  it("a short pull (263) is filled back to 400 from the last good full list", () => {
    rememberFullList(list(400), 1_000);
    const filled = fillFromLastGood(list(263), 2_000);
    expect(filled).toHaveLength(400);
    expect(filled[262].id).toBe("c263");
    expect(filled[399].id).toBe("c400");
  });

  it("a shorter pull never replaces the last good full list", () => {
    rememberFullList(list(400), 1_000);
    rememberFullList(list(263), 1_500);
    expect(fillFromLastGood(list(100), 2_000)).toHaveLength(400);
  });

  it("an old last-good list is not used", () => {
    rememberFullList(list(400), 0);
    expect(fillFromLastGood(list(263), LAST_GOOD_MAX_AGE_MS + 1)).toHaveLength(263);
  });
});

describe("b63 crypto header count", () => {
  it("uses the same number as the count line", () => {
    expect(cryptoHeaderCount(400, 25, "")).toBe("400 coins");
    expect(cryptoCountLine(400)).toBe("Showing 400 of up to 400");
    expect(cryptoHeaderCount(263, 25, "  ")).toBe("263 coins");
  });
  it("a search says how many rows match", () => {
    expect(cryptoHeaderCount(400, 1, "btc")).toBe("1 match");
    expect(cryptoHeaderCount(400, 3, "eth")).toBe("3 matches");
  });
});

describe("b63 trade errors", () => {
  it("insufficient cash is 422", () => {
    expect(isInsufficientCashError(new Error("Insufficient cash balance for this withdrawal"))).toBe(true);
    expect(tradeErrorResponse(new Error("Insufficient cash — x"), "f").status).toBe(422);
    expect(tradeErrorResponse(new Error("boom"), "f").status).toBe(500);
  });
});

describe("b63 /status AI line", () => {
  it("names no model", () => {
    const ok = aiProviderStatusLine({ state: "ok", checkedAt: new Date().toISOString(), model: "grok-x-test" });
    expect(ok.body.startsWith("OK")).toBe(true);
    expect(ok.body).not.toMatch(/model|grok/i);
    const bad = aiProviderStatusLine({ state: "unavailable", code: "http_404", checkedAt: new Date().toISOString(), model: "grok-x-test", endpoint: "https://e" });
    expect(bad.body).not.toMatch(/model|grok|https:/i);
  });
});
