import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  CRYPTO_PROJECTION_HAND_CHECK,
  coingeckoIdFor,
  vendorFor,
  yahooSymbolFor,
} from "./crypto-vendors";
import { canonicalCryptoId } from "./crypto-ids";

describe("crypto vendor ids", () => {
  it("maps ARB, TON and JUP to the whole-token vendors", () => {
    expect(vendorFor("ARB")).toMatchObject({ coingecko: "arbitrum", yahoo: "ARB11841-USD" });
    expect(vendorFor("TON")).toMatchObject({ coingecko: "the-open-network", yahoo: "TON11419-USD" });
    expect(vendorFor("JUP")).toMatchObject({ coingecko: "jupiter-exchange-solana", yahoo: "JUP29210-USD" });
    expect(canonicalCryptoId("TON")).toBe("the-open-network");
    expect(yahooSymbolFor("jup").symbol).toBe("JUP29210-USD");
    expect(yahooSymbolFor("ARB").mapped).toBe(true);
    expect(yahooSymbolFor("NOTACOIN")).toEqual({ symbol: "NOTACOIN-USD", mapped: false });
    expect(coingeckoIdFor("NOTACOIN")).toBeNull();
  });

  it("lists the ten coins the owner checks before projections resume", () => {
    expect(CRYPTO_PROJECTION_HAND_CHECK).toEqual([
      "BTC",
      "ETH",
      "SOL",
      "BNB",
      "XRP",
      "ARB",
      "TON",
      "JUP",
      "UNI",
      "APT",
    ]);
    const pause = readFileSync(path.join(process.cwd(), "src/lib/projection-pause.ts"), "utf8");
    const yahoo = readFileSync(path.join(process.cwd(), "src/lib/yahoo-finance.ts"), "utf8");
    expect(yahoo).toContain("return yahooSymbolFor(ticker).symbol");
    expect(pause).toContain("CRYPTO_PROJECTIONS_PAUSED = true");
    expect(pause).toContain("BTC, ETH, SOL, BNB, XRP, ARB, TON, JUP, UNI, APT");
  });
});
