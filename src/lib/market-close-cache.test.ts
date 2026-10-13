import { describe, expect, it } from "vitest";

import {
  commitExchangeBlock,
  completedSessionDate,
  rememberExchangeBlock,
  reusableExchangeBlock,
} from "@/lib/market-close-cache";

/** 03:00 NZDT Tuesday 13 Oct 2026. New York is 10:00 Monday, so the US cash session is open. */
const US_OPEN_NZ = new Date("2026-10-12T14:00:00.000Z");
/** 10:00 NZDT Tuesday 13 Oct 2026. New York is 17:00 Monday, so the US cash session is closed. */
const US_CLOSED_NZ = new Date("2026-10-12T21:00:00.000Z");
/** 18:00 NZDT Tuesday 13 Oct 2026. New York is still before Tuesday's open, so Monday's session stands. */
const US_STILL_CLOSED_NZ = new Date("2026-10-13T05:00:00.000Z");

describe("per-exchange session cache", () => {
  it("does not serve a 03:00 NZ US-open print at 10:00 NZ", () => {
    const openPrint = rememberExchangeBlock({
      exchange: "DOW",
      now: US_OPEN_NZ,
      indexPrice: 39000.12,
      moverCount: 4,
      quote: { marketState: "REGULAR", quotedAt: US_OPEN_NZ.toISOString() },
      block: { price: 39000.12, label: "open-print" },
    });
    expect(openPrint?.closed).toBe(false);
    expect(completedSessionDate("DOW", US_OPEN_NZ)).toBeNull();
    expect(reusableExchangeBlock(openPrint, new Date(US_OPEN_NZ.getTime() + 20_000))?.price).toBe(39000.12);
    expect(reusableExchangeBlock(openPrint, new Date(US_OPEN_NZ.getTime() + 46_000))).toBeNull();
    expect(reusableExchangeBlock(openPrint, US_CLOSED_NZ)).toBeNull();
    expect(
      commitExchangeBlock(openPrint, {
        exchange: "DOW",
        now: US_CLOSED_NZ,
        indexPrice: null,
        moverCount: 0,
        block: { price: null, label: "failed" },
      })
    ).toBeNull();
  });

  it("returns the same figures for two loads of one closed session", () => {
    const first = rememberExchangeBlock({
      exchange: "NASDAQ",
      now: US_CLOSED_NZ,
      indexPrice: 17850.25,
      moverCount: 3,
      quote: { marketState: "CLOSED", quotedAt: "2026-10-12T20:00:00.000Z" },
      block: { price: 17850.25, movers: ["AAPL", "MSFT", "NVDA"] },
    });
    expect(first?.closed).toBe(true);
    expect(first?.sessionDate).toBe("2026-10-12");
    expect(completedSessionDate("NASDAQ", US_CLOSED_NZ)).toBe("2026-10-12");
    const second = commitExchangeBlock(first, {
      exchange: "NASDAQ",
      now: US_STILL_CLOSED_NZ,
      indexPrice: 18001,
      moverCount: 3,
      quote: { marketState: "CLOSED", quotedAt: "2026-10-12T20:00:00.000Z" },
      block: { price: 18001, movers: ["OTHER"] },
    });
    expect(second).toBe(first);
    expect(reusableExchangeBlock(second, US_STILL_CLOSED_NZ)).toEqual({
      price: 17850.25,
      movers: ["AAPL", "MSFT", "NVDA"],
    });
  });

  it("does not freeze a failed build", () => {
    expect(
      rememberExchangeBlock({
        exchange: "NZX",
        now: US_CLOSED_NZ,
        indexPrice: null,
        moverCount: 3,
        block: { price: null },
      })
    ).toBeNull();
    expect(
      rememberExchangeBlock({
        exchange: "ASX",
        now: US_CLOSED_NZ,
        indexPrice: 8000,
        moverCount: 0,
        block: { movers: [] },
      })
    ).toBeNull();
    expect(
      commitExchangeBlock(null, {
        exchange: "DOW",
        now: US_CLOSED_NZ,
        indexPrice: null,
        moverCount: 0,
        block: { failed: true },
      })
    ).toBeNull();
  });
});
