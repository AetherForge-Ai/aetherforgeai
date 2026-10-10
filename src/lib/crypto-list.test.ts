import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { cryptoCoveragePhrase } from "@/lib/crypto-coverage";
import { mergeRankedCoins, preferRankedCoin, rankedPricesAgree } from "@/lib/crypto-list";
import type { CoinMarket } from "@/lib/crypto-market";
import { CRYPTO_SANITY_RATIO } from "@/lib/crypto-tape";
import { redactSwyftxLog } from "@/lib/crypto-swyftx";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function coin(partial: Partial<CoinMarket> & Pick<CoinMarket, "symbol" | "price">): CoinMarket {
  return {
    id: partial.id || partial.symbol.toLowerCase(),
    name: partial.name || partial.symbol,
    image: "",
    rank: partial.rank ?? 10,
    marketCap: partial.marketCap ?? 1_000,
    fdv: null,
    volume24h: partial.volume24h ?? 1,
    change1h: null,
    change24h: 0,
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
    ...partial,
  };
}

describe("crypto and DEX list of up to 400", () => {
  const previousKey = process.env.SWYFTX_API_KEY;

  afterEach(() => {
    if (previousKey == null) delete process.env.SWYFTX_API_KEY;
    else process.env.SWYFTX_API_KEY = previousKey;
  });

  it("pull-check:crypto-dex-400-2026-10-11", () => {
    expect(read("src/lib/crypto-coverage.ts")).toContain("pull-check:crypto-dex-400-2026-10-11");
    expect(read("src/lib/crypto-list.ts")).toContain("pull-check:crypto-dex-400-2026-10-11");
    expect(read("qa/PULL-CHECK-2026-10-10.md")).toContain("pull-check:crypto-dex-400-2026-10-11");
    expect(CRYPTO_SANITY_RATIO).toBe(3);
    expect(cryptoCoveragePhrase(89)).toBe("Showing 89 of up to 400");
    expect(cryptoCoveragePhrase(400)).toBe("The top 400 coins by market cap");
    const source = read("src/lib/crypto-source.ts");
    expect(source).toContain("LIST_COLD_MS = 3_000");
    expect(source).toContain("LIST_BACKOFF_MS = 60_000");
    const swyftx = read("src/lib/crypto-swyftx.ts");
    expect(swyftx).toContain("SWYFTX_API_KEY");
    expect(swyftx).toContain("fetchRankedMarkets");
    expect(swyftx).not.toMatch(/console\.[a-z]+\([^;\n]*SWYFTX_API_KEY/);
    const dex = read("src/lib/crypto-dex.ts");
    expect(dex).toContain("DEX_PAGE_CAP = 10");
    expect(dex).toContain("DEX_BACKOFF_MS = 60_000");
    expect(dex).toContain("DEX_LIQUIDITY_FLOOR_USD = 10_000");
    expect(read("src/lib/projection-pause.ts")).toContain("CRYPTO_PROJECTIONS_PAUSED = true");
  });

  it("dedupes by symbol and by contract and does not pad to 400", () => {
    const merged = mergeRankedCoins([
      [coin({ symbol: "BTC", id: "bitcoin", price: 100_000, marketCap: 2_000_000, rank: 1 })],
      [coin({ symbol: "BTC", id: "btc", price: 100_100, marketCap: 10, rank: 1 })],
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe("bitcoin");
    expect(merged[0].price).toBe(100_000);

    const contract = "0xabcabcabcabc";
    const byContract = mergeRankedCoins([
      [coin({ symbol: "WETH", id: "weth", price: 3_000, marketCap: 50, contracts: [contract] })],
      [coin({ symbol: "WETH2", id: "wrapped-eth", price: 3_010, marketCap: 40, contracts: [contract] })],
    ]);
    expect(byContract).toHaveLength(1);
    expect(byContract[0].symbol === "WETH" || byContract[0].symbol === "WETH2").toBe(true);

    const ten = Array.from({ length: 10 }, (_, index) =>
      coin({ symbol: `C${index}`, price: index + 1, rank: index + 1, marketCap: 100 - index })
    );
    expect(mergeRankedCoins([ten])).toHaveLength(10);
  });

  it("keeps the higher market cap when two prints disagree by more than the sanity ratio", () => {
    expect(rankedPricesAgree(100, 300)).toBe(true);
    expect(rankedPricesAgree(100, 400)).toBe(false);
    const kept = preferRankedCoin(
      coin({ symbol: "ETH", id: "ethereum", price: 2_000, marketCap: 500, rank: 2 }),
      coin({ symbol: "ETH", id: "eth", price: 10, marketCap: 5, rank: 2 })
    );
    expect(kept.price).toBe(2_000);
    expect(kept.id).toBe("ethereum");
    expect(kept.marketCap).toBe(500);
  });

  it("redacts a Swyftx key and bearer token and still runs with no key", () => {
    process.env.SWYFTX_API_KEY = "super-secret-key-value";
    const line = redactSwyftxLog('auth failed super-secret-key-value Bearer abc.def "apiKey":"super-secret-key-value"');
    expect(line).not.toContain("super-secret-key-value");
    expect(line).not.toContain("abc.def");
    expect(line).toContain("[redacted]");
    delete process.env.SWYFTX_API_KEY;
    expect(redactSwyftxLog("keyless failure")).toBe("keyless failure");
  });
});
