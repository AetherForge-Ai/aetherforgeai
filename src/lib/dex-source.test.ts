import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { dexSearchHits } from "@/lib/asset-search";
import {
  dexSourceLabel,
  holdingTitle,
  isDexSource,
  parseDexSector,
  sectorGroup,
  stripDexNotesPrefix,
} from "@/lib/dex-source";

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
    expect(panel).toContain("dexFromHolding");
    expect(panel).toContain('dex\n          ? "DEX"');
    expect(dashboard).toContain("dexFromHolding(stock)");
    expect(dashboard).not.toContain('holding.venue === "DEX"');
    expect(table).toContain("dexSourceLabel");
    expect(table).toContain("holdingTitle");
    const book = readFileSync(path.join(process.cwd(), "src/lib/transactions.ts"), "utf8");
    expect(book).toContain("dexStamp");
    expect(book).toContain("withDexNotes");
    expect(book).not.toContain("dexRecordFields");
    const route = readFileSync(path.join(process.cwd(), "src/app/api/transactions/route.ts"), "utf8");
    const schema = readFileSync(path.join(process.cwd(), "src/lib/trade-schema.ts"), "utf8");
    expect(route).toContain('from "@/lib/trade-schema"');
    expect(schema).toContain('venue: z.literal("DEX")');
    expect(schema).toContain("chain: z.string()");
  });

  it("reads a sector tag when the venue column is absent and groups every chain as DEX", () => {
    expect(parseDexSector("DEX · Ethereum")).toEqual({ venue: "DEX", chain: "Ethereum" });
    expect(dexSourceLabel({ sector: "DEX · Ethereum" })).toBe("DEX · Ethereum");
    expect(dexSourceLabel({ notes: "[DEX:Ethereum] filled on a pool" })).toBe("DEX · Ethereum");
    expect(stripDexNotesPrefix("[DEX:Ethereum] filled on a pool")).toBe("filled on a pool");
    expect(sectorGroup("DEX · Ethereum")).toBe("DEX");
    expect(sectorGroup("DEX · Solana")).toBe("DEX");
    expect(sectorGroup("Healthcare")).toBe("Healthcare");
    expect(holdingTitle({ company_name: "", sector: "DEX · Ethereum", ticker: "PEPE" })).toBe("PEPE");
    expect(holdingTitle({ company_name: "Pepe", sector: "DEX · Ethereum", ticker: "PEPE" })).toBe("Pepe");
  });
});
