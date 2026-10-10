import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { coinDisplayName } from "@/lib/crypto-names";
import { assembleListedMarkets, type CoinMarket } from "@/lib/crypto-market";
import { CRYPTO_SANITY_RATIO, settleCryptoRows } from "@/lib/crypto-tape";

const NAMED: Array<{ symbol: string; name: string; chain: string; platforms: Record<string, string> }> = [
  { symbol: "MINA", name: "Mina Protocol", chain: "Native", platforms: {} },
  { symbol: "AXS", name: "Axie Infinity", chain: "Ethereum", platforms: { ethereum: "0xaxs" } },
  { symbol: "KSM", name: "Kusama", chain: "Native", platforms: {} },
  { symbol: "EOS", name: "EOS Network", chain: "Native", platforms: {} },
  { symbol: "FLOW", name: "Flow", chain: "Native", platforms: {} },
  { symbol: "ICP", name: "Internet Computer", chain: "Native", platforms: {} },
  { symbol: "AAVE", name: "Aave", chain: "Ethereum", platforms: { ethereum: "0xaave" } },
  { symbol: "ZIL", name: "Zilliqa", chain: "Native", platforms: {} },
  { symbol: "FET", name: "Artificial Superintelligence Alliance", chain: "Ethereum", platforms: { ethereum: "0xfet" } },
  { symbol: "CRV", name: "Curve DAO", chain: "Ethereum", platforms: { ethereum: "0xcrv" } },
  { symbol: "SNX", name: "Synthetix", chain: "Ethereum", platforms: { ethereum: "0xsnx" } },
  { symbol: "YFI", name: "yearn.finance", chain: "Ethereum", platforms: { ethereum: "0xyfi" } },
  { symbol: "ANKR", name: "Ankr", chain: "Ethereum", platforms: { ethereum: "0xankr" } },
  { symbol: "FIL", name: "Filecoin", chain: "Native", platforms: {} },
  { symbol: "ARKM", name: "Arkham", chain: "Ethereum", platforms: { ethereum: "0xarkm" } },
];

function coin(symbol: string, rank: number, price = rank + 0.5): CoinMarket {
  return {
    id: symbol.toLowerCase(),
    symbol,
    name: symbol,
    image: "",
    rank,
    price,
    marketCap: 1_000_000 - rank,
    fdv: null,
    volume24h: 1_000,
    change1h: null,
    change24h: rank % 2 === 0 ? 43.68 : -2,
    change7d: 50.64,
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
  };
}

describe("markets list is not filtered by the crypto sanity ratio", () => {
  it("keeps CRYPTO_SANITY_RATIO at 3 and keeps a realistic 400-coin fixture", () => {
    expect(CRYPTO_SANITY_RATIO).toBe(3);
    const platforms = new Map<string, Record<string, string>>();
    const rows: CoinMarket[] = [];
    NAMED.forEach((entry, index) => {
      platforms.set(entry.symbol.toLowerCase(), entry.platforms);
      rows.push({ ...coin(entry.symbol, index + 1), name: entry.symbol, id: entry.symbol.toLowerCase() });
    });
    for (let rank = NAMED.length + 1; rank <= 400; rank++) {
      const symbol = `C${rank}`;
      platforms.set(symbol.toLowerCase(), rank % 5 === 0 ? {} : { solana: "mint" });
      rows.push(coin(symbol, rank));
    }
    // A 2.9× history disagreement would be kept by the tape. A markets row has no history gate at all.
    rows.push({ ...coin("WILD", 2, 2.9), id: "wild" });
    const page = assembleListedMarkets(rows, platforms, null);
    expect(page.coins).toHaveLength(400);
    expect(page.notice).toBeNull();
    expect(page.coins.map((row) => row.symbol)).toContain("WILD");
    for (const entry of NAMED) {
      const row = page.coins.find((coin) => coin.symbol === entry.symbol);
      expect(row?.name).toBe(entry.name);
      expect(row?.name).not.toBe(entry.symbol);
      expect(row?.blockchain).toBe(entry.chain);
    }
    expect(page.coins.every((row) => row.blockchain && row.blockchain !== "—")).toBe(true);

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const kept = settleCryptoRows([{ ticker: "MINA", price: 2.9, origin: "coingecko", history: [1] }]);
    const dropped = settleCryptoRows([{ ticker: "AXS", price: 4, origin: "coingecko", history: [1] }]);
    expect(kept.quotes.MINA).toBe(2.9);
    expect(dropped.quotes.AXS).toBeUndefined();
    expect(dropped.hidden[0]?.reason).toMatch(/do not agree/);
    warn.mockRestore();

    const market = readFileSync("src/lib/crypto-market.ts", "utf8");
    const gecko = readFileSync("src/lib/crypto-coingecko.ts", "utf8");
    expect(market).not.toContain("crypto-tape");
    expect(market).not.toContain("cryptoDropReason");
    expect(gecko).not.toContain("crypto-tape");
    expect(gecko).not.toContain("CRYPTO_SANITY_RATIO");
    expect(gecko).not.toContain("cryptoDropReason");
  });

  it("names the shortfall instead of claiming 400", () => {
    const page = assembleListedMarkets([coin("BTC", 1, 100)], new Map([["btc", {}]]), "page2");
    expect(page.coins).toHaveLength(1);
    expect(page.notice).toMatch(/Showing 1 of up to 400/);
    expect(page.coins[0].blockchain).toBe("Native");
    expect(coinDisplayName("EOS", "EOS")).toBe("EOS Network");
    expect(coinDisplayName("AAVE", "Aave")).toBe("Aave");
  });
});
