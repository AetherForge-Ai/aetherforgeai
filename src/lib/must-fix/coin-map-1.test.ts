/**
 * COIN-MAP-1: ARB, JUP, UNI and APT must resolve to their own assets.
 * A shared ticker returns no price. A quote far from the reference is not used.
 * The detector only reads the rows it is given.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalGeckoForTicker, findListedCoin, paprikaIdForSymbol, quoteCoinId } from "@/lib/crypto-listed-match";
import { flagOffMarketFills } from "@/lib/off-market-fills";
import { guardTradeQuote, PRICE_UNAVAILABLE_MANUAL, quantityFromQuotedAmount } from "@/lib/quote-sanity";
import { yahooSymbolFor } from "@/lib/crypto-vendors";

const coins = [
  { id: "arbitrum", symbol: "ARB", price: 0.21 },
  { id: "arb-arbitrage-loop", symbol: "ARB", price: 0.000629 },
  { id: "jupiter-exchange-solana", symbol: "JUP", price: 0.31 },
  { id: "jupiter", symbol: "JUP", price: 0.0004 },
  { id: "uniswap", symbol: "UNI", price: 6.6 },
  { id: "uni-dust", symbol: "UNI", price: 0.0002 },
  { id: "aptos", symbol: "APT", price: 0.56 },
  { id: "apt-apidae", symbol: "APT", price: 0.000131 },
];

describe("COIN-MAP-1 canonical ids", () => {
  it("resolves ARB, JUP, UNI and APT to the real asset, by slug and by ticker", () => {
    expect(findListedCoin(coins, "arbitrum")?.id).toBe("arbitrum");
    expect(findListedCoin(coins, "ARB")?.id).toBe("arbitrum");
    expect(findListedCoin(coins, "jup")?.id).toBe("jupiter-exchange-solana");
    expect(findListedCoin(coins, "jupiter-exchange-solana")?.id).toBe("jupiter-exchange-solana");
    expect(findListedCoin(coins, "UNI")?.id).toBe("uniswap");
    expect(findListedCoin(coins, "uniswap")?.id).toBe("uniswap");
    expect(findListedCoin(coins, "apt")?.id).toBe("aptos");
    expect(findListedCoin(coins, "aptos")?.id).toBe("aptos");
    expect(quoteCoinId("JUP", "jupiter", "")).toBe("jupiter-exchange-solana");
    expect(yahooSymbolFor("ARB").symbol).toBe("ARB11841-USD");
    expect(yahooSymbolFor("JUP").symbol).toBe("JUP29210-USD");
    expect(yahooSymbolFor("UNI").symbol).toBe("UNI7083-USD");
    expect(yahooSymbolFor("APT").symbol).toBe("APT21794-USD");
  });

  it("returns no price when the canonical id is missing and another coin shares the ticker", () => {
    const collided = [
      { id: "arb-arbitrage-loop", symbol: "ARB", price: 0.000629 },
      { id: "jupiter", symbol: "JUP", price: 0.0004 },
      { id: "uni-dust", symbol: "UNI", price: 0.0002 },
      { id: "apt-apidae", symbol: "APT", price: 0.0001 },
    ];
    expect(findListedCoin(collided, "arbitrum")).toBeNull();
    expect(findListedCoin(collided, "ARB")).toBeNull();
    expect(findListedCoin(collided, "jup")).toBeNull();
    expect(findListedCoin(collided, "uniswap")).toBeNull();
    expect(findListedCoin(collided, "aptos")).toBeNull();
    const depth = readFileSync("src/lib/crypto-depth.server.ts", "utf8");
    expect(depth).toContain("findListedCoin");
    expect(depth).not.toContain("coin.symbol.toUpperCase() === symbol");
  });

  it("pins TON to Toncoin and does not borrow another token that also prints GRAM", () => {
    expect(canonicalGeckoForTicker("TON")).toBe("the-open-network");
    expect(canonicalGeckoForTicker("GRAM")).toBe("the-open-network");
    expect(paprikaIdForSymbol("TON")).toBe("toncoin-the-open-network");
    expect(paprikaIdForSymbol("GRAM")).toBe("toncoin-the-open-network");
    const both = [
      { id: "the-open-network", symbol: "GRAM", price: 0.95 },
      { id: "gram-blockgram", symbol: "GRAM", price: 0.000022 },
    ];
    expect(findListedCoin(both, "TON")?.id).toBe("the-open-network");
    expect(findListedCoin(both, "gram")?.id).toBe("the-open-network");
    expect(findListedCoin(both, "the-open-network")?.id).toBe("the-open-network");
    const otherOnly = [{ id: "gram-blockgram", symbol: "GRAM", price: 0.000022 }];
    expect(findListedCoin(otherOnly, "TON")).toBeNull();
    expect(findListedCoin(otherOnly, "gram")).toBeNull();
  });
});

describe("COIN-MAP-1 quote guard", () => {
  it("rejects 0.000629 for ARB when the reference is about 0.21 and does not turn that quote into a quantity", () => {
    const guarded = guardTradeQuote(0.000629, 0.21);
    expect(guarded.ok).toBe(false);
    expect(guarded.price).toBeNull();
    expect(guarded.message).toBe(PRICE_UNAVAILABLE_MANUAL);
    expect(guarded.message).toMatch(/price unavailable, enter price manually/i);
    const sized = quantityFromQuotedAmount(100, 0.000629, 0.21);
    expect(sized.ok).toBe(false);
    if (!sized.ok) expect(sized.quantity).toBeNull();
    const fair = quantityFromQuotedAmount(100, 0.2, 0.21);
    expect(fair.ok).toBe(true);
    if (fair.ok) expect(fair.quantity).toBeCloseTo(500, 5);
  });
});

describe("COIN-MAP-1 off-market detector", () => {
  it("flags the audit-style rows and leaves a price near the reference alone", () => {
    const flags = flagOffMarketFills(
      [
        { id: "arb-1", ticker: "ARB", price: 0.000629, quantity: 1_000_000, executedAt: "2026-08-01" },
        { id: "jup-1", ticker: "JUP", price: 0.0004, quantity: 250_000 },
        { id: "uni-1", ticker: "UNI", price: 0.0002, quantity: 50_000 },
        { id: "apt-1", ticker: "APT", price: 0.0001, quantity: 61_900_000 },
        { id: "apt-2", ticker: "APT", price: 0.000131, quantity: 10_000 },
        { id: "arb-ok", ticker: "ARB", price: 0.19, quantity: 100 },
      ],
      { ARB: 0.21, JUP: 0.31, UNI: 6.6, APT: 0.56 }
    );
    expect(flags.map((row) => row.id)).toEqual(["arb-1", "jup-1", "uni-1", "apt-1", "apt-2"]);
    expect(flags.every((row) => row.reason.includes(row.ticker))).toBe(true);
    const src = readFileSync("src/lib/off-market-fills.ts", "utf8");
    expect(src).not.toMatch(/totalum|createRecord|editRecord/);
  });
});
