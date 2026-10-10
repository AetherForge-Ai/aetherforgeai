import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { dexSearchHits } from "@/lib/asset-search";
import { dexSourceLabel, isDexSource } from "@/lib/dex-source";

describe("M2 DEX source", () => {
  it("keeps DEX and the chain on a search hit", () => {
    const [hit] = dexSearchHits([
      { symbol: "PEPE", name: "Pepe", price: 0.0000040399, id: "pool", network: "Ethereum" },
    ]);
    expect(hit?.market).toBe("DEX");
    expect(hit?.chain).toBe("Ethereum");
    expect(dexSourceLabel(hit)).toBe("DEX · Ethereum");
    expect(isDexSource({ venue: "CRYPTO" })).toBe(false);
  });

  it("labels a stored holding and a sell seed as DEX plus chain", () => {
    expect(dexSourceLabel({ venue: "DEX", chain: "Solana" })).toBe("DEX · Solana");
    expect(dexSourceLabel({ venue: "DEX" })).toBe("DEX");
    expect(dexSourceLabel({ market: "Crypto" })).toBeNull();
    const panel = readFileSync(path.join(process.cwd(), "src/components/dashboard/RecordTransactionPanel.tsx"), "utf8");
    const dashboard = readFileSync(path.join(process.cwd(), "src/components/dashboard/PortfolioDashboard.tsx"), "utf8");
    const table = readFileSync(path.join(process.cwd(), "src/components/dashboard/HoldingsOwnedTable.tsx"), "utf8");
    expect(panel).toContain('payload.venue = "DEX"');
    expect(panel).toContain("payload.chain = chain");
    expect(panel).toContain('dex\n          ? "DEX"');
    expect(dashboard).toContain('market: holding.venue === "DEX" ? "DEX"');
    expect(table).toContain("dexSourceLabel");
    const book = readFileSync(path.join(process.cwd(), "src/lib/transactions.ts"), "utf8");
    expect(book).toContain("dexRecordFields");
  });
});
