// pull-check:v3-fix-b76-2026-10-27
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contractIndexFromPlatforms, fillDexDetailIds, type DexTokenRow } from "@/lib/crypto-dex";

const row = (over: Partial<DexTokenRow>): DexTokenRow =>
  ({ id: "x", symbol: "PEPE", name: "Pepe", price: 1, priceUnavailable: false, volume24h: 1, network: "Ethereum", dex: "uni", detailId: null, address: "", reserveUsd: 1, ...over }) as DexTokenRow;

describe("b75 H-1: DEX rows without a CoinGecko id are matched by contract", () => {
  const index = contractIndexFromPlatforms(
    new Map([
      ["pepe", { ethereum: "0x6982508145454Ce325dDbE47a25d4ec3d2311933" }],
      ["dogwifcoin", { solana: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm" }],
      ["a-one", { ethereum: "0x1111111111111111111111111111111111111111" }],
      ["b-two", { "binance-smart-chain": "0x1111111111111111111111111111111111111111" }],
    ])
  );
  it("fills EVM (case-insensitive) and Solana rows", () => {
    const out = fillDexDetailIds(
      [row({ address: "eth_0x6982508145454ce325ddbe47a25d4ec3d2311933" }), row({ symbol: "WIF", address: "solana_EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm" })],
      index
    );
    expect(out.map((r) => r.detailId)).toEqual(["pepe", "dogwifcoin"]);
  });
  it("keeps an existing id, skips ambiguous contracts, and is a no-op without an index", () => {
    expect(fillDexDetailIds([row({ detailId: "bitcoin", address: "eth_0x6982508145454ce325ddbe47a25d4ec3d2311933" })], index)[0].detailId).toBe("bitcoin");
    expect(fillDexDetailIds([row({ address: "eth_0x1111111111111111111111111111111111111111" })], index)[0].detailId).toBeNull();
    expect(fillDexDetailIds([row({ address: "eth_0x6982508145454ce325ddbe47a25d4ec3d2311933" })], null)[0].detailId).toBeNull();
  });
  it("the DEX seed fills ids before saving", () => {
    const src = readFileSync("src/lib/crypto-board-store.ts", "utf8");
    expect(src).toMatch(/persistDexSnapshot\(fillDexDetailIds\(loaded\.rows, index\)/);
  });
  it("transaction delete errors no longer say dividend for any row type", () => {
    const src = readFileSync("src/app/api/transactions/route.ts", "utf8");
    expect(src).not.toMatch(/A dividend id is required|: "That dividend was not removed\."/);
  });
});

describe("b75 (TT b73 P3): a delete of a row already gone says so on screen", () => {
  it("shows the not-found text for 8 s", () => {
    const src = readFileSync("src/components/dashboard/PortfolioDashboard.tsx", "utf8");
    expect(src).toMatch(/It was already removed, so nothing changed\.`, \{ duration: 8000 \}/);
  });
});
