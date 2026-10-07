import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { dailyCloses, loadCryptoBoard, selectKoinsUniverse, settleCryptoRows } from "./crypto-tape";

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
    const market = read("src/app/api/market/route.ts");
    const tape = read("src/lib/crypto-tape.ts");
    expect(market).toContain("loadCryptoBoardLive");
    expect(market).toContain("filterPublishedCrypto");
    expect(market).toContain("selectKoinsUniverse");
    expect(market).toContain("CRYPTO_PROJECTIONS_PAUSED");
    expect(tape).not.toContain("fetchYahooCryptoLiveQuotes");
    expect(tape).toContain("fallbackPrices: async () => ({})");
    expect(read("src/app/api/projections/route.ts")).toContain("loadCryptoBoardLive");
    expect(read("src/app/api/projections/route.ts")).not.toContain("fetchCryptoMarketIntel");
    expect(read("src/lib/projection-pause.ts")).toContain("CRYPTO_PROJECTIONS_PAUSED = true");
  });

  it("publishes no Koins rows while the hand-check is open or the live board is empty", () => {
    const row = { ticker: "BTC", price: 84000, projected7dPct: 4, confidence: 70 };
    expect(selectKoinsUniverse({ paused: true, quotes: { BTC: 84000 }, rows: [row] })).toEqual([]);
    expect(selectKoinsUniverse({ paused: false, quotes: {}, rows: [row] })).toEqual([]);
    expect(
      selectKoinsUniverse({
        paused: false,
        quotes: { BTC: 84000 },
        rows: [row],
        histories: { BTC: [80000, 84000] },
        change24h: { BTC: 5 },
      })
    ).toEqual([row]);
  });

  it("drops a row when price, support, or low is not positive", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const board = settleCryptoRows([
      { ticker: "BTC", price: 0, origin: "coingecko", history: [100, 101] },
      { ticker: "ETH", price: 10, origin: "coingecko", history: [9, 10], support: 0 },
      { ticker: "SOL", price: 10, origin: "coingecko", history: [9, 10], low: -1 },
    ]);
    expect(board.quotes).toEqual({});
    expect(board.hidden.map((row) => row.reason)).toEqual([
      "price is not positive",
      "support is not positive",
      "low is not positive",
    ]);
    expect(warn).toHaveBeenCalledWith("[crypto-sanity] BTC: price is not positive");
    expect(warn).toHaveBeenCalledWith("[crypto-sanity] ETH: support is not positive");
    expect(warn).toHaveBeenCalledWith("[crypto-sanity] SOL: low is not positive");
    warn.mockRestore();
  });

  it("drops a row when the history move and the vendor 24h change disagree by more than 10 points", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const dropped = settleCryptoRows([
      { ticker: "BTC", price: 110, origin: "coingecko", history: [100, 110], change24h: -5 },
    ]);
    expect(dropped.quotes).toEqual({});
    expect(dropped.hidden[0]?.reason).toMatch(/more than 10 percentage points/);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^\[crypto-sanity\] BTC: history move differs/));

    const kept = settleCryptoRows([
      { ticker: "ETH", price: 110, origin: "coingecko", history: [100, 110], change24h: 0 },
    ]);
    expect(kept.quotes).toEqual({ ETH: 110 });

    const fromVendor = await loadCryptoBoard(["BTC"], {
      coingeckoPrices: async () => ({ BTC: { price: 101, change24h: 40 } }),
      coingeckoHistory: async () => [100, 101],
      fallbackPrices: async () => ({}),
    });
    expect(fromVendor.quotes).toEqual({});
    expect(fromVendor.hidden[0]?.reason).toMatch(/more than 10 percentage points/);
    warn.mockRestore();
  });

  it("drops a stablecoin that moves more than 2% from 1.00 or day on day", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const board = settleCryptoRows([
      { ticker: "USDT", price: 1.03, origin: "coingecko", history: [1, 1.01] },
      { ticker: "DAI", price: 1, origin: "coingecko", history: [1, 1.03] },
      { ticker: "USDe", price: 1, origin: "coingecko", history: [1, 1.01], change24h: 2.5 },
      { ticker: "USDC", price: 1.02, origin: "coingecko", history: [1, 1.02], change24h: 2 },
    ]);
    expect(board.quotes).toEqual({ USDC: 1.02 });
    expect(board.hidden.map((row) => row.ticker)).toEqual(["USDT", "DAI", "USDE"]);
    expect(board.hidden[0]?.reason).toMatch(/more than 2% from 1\.00/);
    expect(board.hidden[1]?.reason).toMatch(/day move is more than 2%/);
    expect(board.hidden[2]?.reason).toMatch(/day move is more than 2%/);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^\[crypto-sanity\] USDT:/));
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^\[crypto-sanity\] DAI:/));
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^\[crypto-sanity\] USDE:/));
    warn.mockRestore();
  });

  it("drops a history that sits in a flat or placeholder band", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const board = settleCryptoRows([
      { ticker: "BTC", price: 1.0001, origin: "coingecko", history: [1, 1.0001] },
      { ticker: "DOGE", price: 0.02, origin: "coingecko", history: [0.005, 0.02, 0.01] },
      { ticker: "ETH", price: 1.0002, origin: "coingecko", history: [1, 1.0002] },
    ]);
    expect(board.quotes).toEqual({ ETH: 1.0002 });
    expect(board.hidden.map((row) => row.reason)).toEqual([
      "history sits in a flat band",
      "history sits in a placeholder band",
    ]);
    expect(warn).toHaveBeenCalledWith("[crypto-sanity] BTC: history sits in a flat band");
    expect(warn).toHaveBeenCalledWith("[crypto-sanity] DOGE: history sits in a placeholder band");
    warn.mockRestore();
  });

  it("drops a clamped projection and any value sitting on a clamp limit", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const board = settleCryptoRows([
      { ticker: "BTC", price: 100, origin: "coingecko", history: [98, 100], expectedPct: 55, confidence: 40 },
      { ticker: "ETH", price: 100, origin: "coingecko", history: [98, 100], expectedPct: -55, confidence: 70 },
      { ticker: "SOL", price: 100, origin: "coingecko", history: [98, 100], expectedPct: 4, confidence: 96 },
      { ticker: "XRP", price: 100, origin: "coingecko", history: [98, 100], expectedPct: 4, confidence: 40 },
      { ticker: "BNB", price: 100, origin: "coingecko", history: [98, 100], expectedPct: 4, confidence: 70 },
    ]);
    expect(board.quotes).toEqual({ BNB: 100 });
    expect(board.hidden.map((row) => row.reason)).toEqual([
      "expectedPct 55 is at a clamp limit",
      "expectedPct -55 is at a clamp limit",
      "confidence 96 is at a clamp limit",
      "confidence 40 is at a clamp limit",
    ]);
    expect(warn).toHaveBeenCalledWith("[crypto-sanity] BTC: expectedPct 55 is at a clamp limit");
    expect(warn).toHaveBeenCalledWith("[crypto-sanity] SOL: confidence 96 is at a clamp limit");
    expect(warn).toHaveBeenCalledWith("[crypto-sanity] XRP: confidence 40 is at a clamp limit");
    warn.mockRestore();
  });
});
