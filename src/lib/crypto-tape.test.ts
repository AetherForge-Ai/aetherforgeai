import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { dailyCloses, loadCryptoBoard, settleCryptoRows } from "./crypto-tape";

describe("crypto tape", () => {
  it("hides a row when only a fallback answers and logs it", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const board = settleCryptoRows([
      { ticker: "JUP", price: 0.0003, origin: "fallback" },
      { ticker: "ARB", price: 0.19, origin: "coingecko", history: [0.2, 0.18, 0.186] },
    ]);
    expect(board.quotes).toEqual({ ARB: 0.19 });
    expect(board.histories.ARB).toEqual([0.2, 0.18, 0.186]);
    expect(board.hidden).toContainEqual({ ticker: "JUP", reason: "only a fallback answered" });
    expect(warn).toHaveBeenCalledWith("[crypto-sanity] JUP: only a fallback answered");
    warn.mockRestore();
  });

  it("hides a CoinGecko print whose history is a different asset", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const board = settleCryptoRows([
      { ticker: "TON", price: 1.48, origin: "coingecko", history: [0.0004, 0.0003] },
    ]);
    expect(board.quotes).toEqual({});
    expect(board.hidden[0]?.ticker).toBe("TON");
    expect(board.hidden[0]?.reason).toMatch(/do not agree/);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^\[crypto-sanity\] TON:/));
    warn.mockRestore();
  });

  it("loads prices and history from the injected CoinGecko source", async () => {
    const board = await loadCryptoBoard(["ARB", "JUP", "FAKE"], {
      coingeckoPrices: async () => ({ ARB: 0.19 }),
      coingeckoHistory: async () => [0.2, 0.18],
      fallbackPrices: async () => ({ JUP: 0.00031, FAKE: 1 }),
    });
    expect(board.quotes).toEqual({ ARB: 0.19 });
    expect(board.hidden.map((row) => row.ticker).sort()).toEqual(["FAKE", "JUP"]);
  });

  it("turns CoinGecko chart points into one close per day", () => {
    expect(
      dailyCloses([
        [Date.parse("2026-10-01T00:00:00Z"), 1],
        [Date.parse("2026-10-01T18:00:00Z"), 1.2],
        [Date.parse("2026-10-02T00:00:00Z"), 1.1],
      ])
    ).toEqual([1.2, 1.1]);
  });

  it("is the price and history service for both public crypto routes", () => {
    const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
    expect(read("src/app/api/market/route.ts")).toContain("loadCryptoBoardLive");
    expect(read("src/app/api/projections/route.ts")).toContain("loadCryptoBoardLive");
    expect(read("src/app/api/projections/route.ts")).not.toContain("fetchCryptoMarketIntel");
  });
});
