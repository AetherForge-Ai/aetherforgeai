import { afterEach, describe, expect, it, vi } from "vitest";

import { isContaminatedEquityPrint } from "@/lib/metal-valuation";
import {
  SNAPSHOT_QUOTE_WAIT_MS,
  STORED_HOLDING_PRICE,
  priceFromQuoteOrStored,
  raceQuoteFetch,
} from "@/lib/snapshot-quotes";

afterEach(() => {
  vi.useRealTimers();
});

describe("snapshot quote cap", () => {
  it("uses the same 1.2s cap as the stocks live overlay", () => {
    expect(SNAPSHOT_QUOTE_WAIT_MS).toBe(1200);
  });

  it("returns the fallback when a quote feed is still pending at 1.2s", async () => {
    vi.useFakeTimers();
    let late = false;
    const slow = new Promise<Record<string, { price: number }>>((resolve) => {
      setTimeout(() => {
        late = true;
        resolve({ AAPL: { price: 999 } });
      }, 5000);
    });
    const pending = raceQuoteFetch(slow, {});
    await vi.advanceTimersByTimeAsync(SNAPSHOT_QUOTE_WAIT_MS);
    await expect(pending).resolves.toEqual({ value: {}, timedOut: true });
    expect(late).toBe(false);
    await vi.advanceTimersByTimeAsync(5000);
    expect(late).toBe(true);
  });

  it("keeps a quote that arrives inside the cap", async () => {
    vi.useFakeTimers();
    const fast = new Promise<Record<string, { price: number }>>((resolve) => {
      setTimeout(() => resolve({ BTC: { price: 64012.5 } }), 400);
    });
    const pending = raceQuoteFetch(fast, {});
    await vi.advanceTimersByTimeAsync(400);
    await expect(pending).resolves.toEqual({
      value: { BTC: { price: 64012.5 } },
      timedOut: false,
    });
  });

  it("falls back when the feed rejects, without hanging the request", async () => {
    const pending = raceQuoteFetch(Promise.reject(new Error("feed down")), {});
    await expect(pending).resolves.toEqual({ value: {}, timedOut: false });
  });

  it("labels the stored price when the capped feed returns nothing", () => {
    const chosen = priceFromQuoteOrStored({
      livePrice: undefined,
      stored: 17.51,
      liveSource: "Equity quote",
      missingReason: "No live quote or stored price is available for this holding.",
    });
    expect(chosen).toEqual({
      price: 17.51,
      reason: null,
      source: STORED_HOLDING_PRICE,
      usedLive: false,
    });
    expect(chosen.source).toBe("Stored holding price");
    expect(chosen.source).not.toBe("Equity quote");
  });

  it("keeps a live print that arrived before the cap", () => {
    expect(
      priceFromQuoteOrStored({
        livePrice: 64012.5,
        stored: 100,
        liveSource: "Crypto quote",
        missingReason: "No live crypto quote or stored price is available for this holding.",
      })
    ).toEqual({
      price: 64012.5,
      reason: null,
      source: "Crypto quote",
      usedLive: true,
    });
  });

  it("leaves a contaminated equity print blank instead of using the purchase price", () => {
    const chosen = priceFromQuoteOrStored({
      livePrice: undefined,
      stored: 44,
      purchase: 7601.27,
      contaminated: isContaminatedEquityPrint,
      liveSource: "Equity quote",
      missingReason: "No live quote or stored price is available for this holding.",
    });
    expect(chosen.price).toBeNull();
    expect(chosen.source).toBe("Stored holding price");
    expect(chosen.reason).toMatch(/stored price/i);
    expect(chosen.price).not.toBe(7601.27);
  });
});
