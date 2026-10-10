import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { coinDisplayName } from "@/lib/crypto-names";
import { formatTapeItem, fxRateLine } from "@/lib/tape-display";

function read(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

const RATES = { USD: 1.6543, AUD: 1.1022, NZD: 1 };

describe("H8 tape currency and coin names", () => {
  it("labels each strip item in its own currency and converts to NZ$ at 4dp", () => {
    expect(formatTapeItem({ price: 82576, currency: "USD" }, "native", RATES)).toContain("US$");
    expect(formatTapeItem({ price: 0.39, currency: "NZD" }, "native", RATES)).toContain("NZ$");
    const nzd = formatTapeItem({ price: 100, currency: "USD" }, "NZD", RATES);
    expect(nzd).toContain("NZ$");
    expect(nzd).not.toContain("US$");
    expect(fxRateLine(RATES)).toBe("1 USD = NZ$1.6543 · 1 AUD = NZ$1.1022");
    const ticker = read("src/components/MarketTicker.tsx");
    expect(ticker).toContain("formatTapeItem");
    expect(ticker).toContain("Show NZ$");
    expect(ticker).toContain("fxRateLine");
  });

  it("replaces a raw ticker with the CoinGecko name and keeps a real feed name", () => {
    expect(coinDisplayName("BAT", "BAT")).toBe("Basic Attention Token");
    expect(coinDisplayName("STRK", "STRK")).toBe("Starknet");
    expect(coinDisplayName("GALA", "")).toBe("Gala");
    expect(coinDisplayName("EOS", "EOS")).toBe("EOS");
    expect(coinDisplayName("MINA", "MINA")).toBe("Mina Protocol");
    expect(coinDisplayName("FET", "FET")).toBe("Artificial Superintelligence Alliance");
    expect(coinDisplayName("FIL", "FIL")).toBe("Filecoin");
    expect(coinDisplayName("YFI", "YFI")).toBe("yearn.finance");
    expect(coinDisplayName("THETA", "THETA")).toBe("Theta Network");
    expect(coinDisplayName("APE", "APE")).toBe("ApeCoin");
    expect(coinDisplayName("WLD", "WLD")).toBe("Worldcoin");
    expect(coinDisplayName("ENJ", "ENJ")).toBe("Enjin Coin");
    expect(coinDisplayName("IOTA", "IOTA")).toBe("IOTA");
    expect(coinDisplayName("OP", "Optimism")).toBe("Optimism");
    expect(read("src/lib/crypto-coingecko.ts")).toContain("coinDisplayName");
    expect(read("src/lib/crypto-yahoo.ts")).toContain("coinDisplayName");
    expect(read("src/components/dashboard/MarketsExplorer.tsx")).toContain("Show NZ$");
    expect(read("src/components/dashboard/MarketsExplorer.tsx")).toContain("formatFxInput");
  });
});
