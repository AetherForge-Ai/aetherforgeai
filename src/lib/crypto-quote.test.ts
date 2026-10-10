import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { listedCryptoIsStrict, pickListedCryptoPrice } from "@/lib/crypto-quote";

describe("Add panel DEX price uses the sell-form coin list", () => {
  it("prices PEPE and UNI from the coin list when GeckoTerminal search is empty", () => {
    expect(listedCryptoIsStrict("PEPE", "pepe", "", false)).toBe(false);
    expect(listedCryptoIsStrict("UNI", "uniswap", "", true)).toBe(false);
    expect(listedCryptoIsStrict("XYZ", "some-extended-token", "", false)).toBe(true);
    expect(listedCryptoIsStrict("POOL", "eth_0xabc", "", false)).toBe(true);
    expect(pickListedCryptoPrice({ market: "dex", dexPrice: null, coinListPrice: 0.0000040399 })).toBe(0.0000040399);
    expect(pickListedCryptoPrice({ market: "dex", dexPrice: null, coinListPrice: 7.37 })).toBe(7.37);
    expect(pickListedCryptoPrice({ market: "dex", dexPrice: 7.5, coinListPrice: 7.37 })).toBe(7.5);

    const quote = readFileSync("src/app/api/tickers/quote/route.ts", "utf8");
    expect(quote).toContain("listedCryptoIsStrict");
    expect(quote).toContain("pickListedCryptoPrice");
    const gecko = readFileSync("src/lib/crypto-coingecko.ts", "utf8");
    const quoteFn = gecko.slice(gecko.indexOf("export async function dexQuoteRows"));
    expect(quoteFn).not.toContain("fetchDexTop400");
  });
});
