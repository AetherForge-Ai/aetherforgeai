import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { importWrites, planBrokerImport } from "@/lib/broker-import";
import { dexDetailId } from "@/lib/crypto-dex";
import {
  lastCryptoSeedReport,
  installSeedFetch,
  resetSeedFetch,
  seedFailureReason,
  COINGECKO_DATACENTRE_HINT,
} from "@/lib/crypto-keyless-seed";
import type { CoinMarket } from "@/lib/crypto-market";
import {
  clearSnapshotMemory,
  installSnapshotDurable,
  persistCryptoSnapshot,
  persistDexSnapshot,
  readCryptoSnapshot,
  readDexSnapshot,
  resetCryptoSnapshotsForTests,
  type SnapshotDurable,
  type SnapshotId,
} from "@/lib/crypto-snapshot";
import { dexRefreshSettled, readSharedCryptoBoard, readSharedDexBoard, resetSnapshotUpgradeBackoff, snapshotQuotesForSymbols, upgradeStoredCryptoBoard } from "@/lib/crypto-board-store";
import { trailingCloseChange } from "@/lib/crypto-yahoo";
import { holdingsTickerFromCell, parseHoldingsCsv } from "@/lib/holdings-csv";
import { splitReturns } from "@/lib/returns-split";
import type { DexTokenRow } from "@/lib/crypto-dex";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function coin(partial: Partial<CoinMarket> & Pick<CoinMarket, "symbol" | "price">): CoinMarket {
  return {
    id: partial.id || partial.symbol.toLowerCase(),
    name: partial.name || partial.symbol,
    image: "",
    rank: partial.rank ?? 1,
    marketCap: partial.marketCap ?? 1_000_000,
    fdv: null,
    volume24h: partial.volume24h ?? 100,
    change1h: partial.change1h ?? null,
    change24h: 1,
    change7d: 2,
    high24h: null,
    low24h: null,
    circulatingSupply: null,
    totalSupply: null,
    maxSupply: partial.maxSupply ?? null,
    ath: null,
    athDate: null,
    atl: null,
    atlDate: null,
    sparkline7d: [],
    source: partial.source || "coingecko",
    ...partial,
  };
}

function many(count: number, source = "coingecko"): CoinMarket[] {
  return Array.from({ length: count }, (_, index) =>
    coin({
      symbol: `C${index}`,
      id: `coin-${index}`,
      name: `Coin ${index}`,
      rank: index + 1,
      price: index + 1,
      marketCap: source === "yahoo" ? 0 : 1_000_000 - index,
      source,
    })
  );
}

function memoryDurable(): SnapshotDurable & { store: Map<SnapshotId, string> } {
  const store = new Map<SnapshotId, string>();
  return {
    store,
    async read(id) {
      return store.get(id) ?? null;
    },
    async write(id, body) {
      store.set(id, body);
      return true;
    },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function geckoMarkets(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `coin-${index}`,
    symbol: `c${index}`,
    name: `Coin ${index}`,
    current_price: index + 1,
    market_cap: 2_000_000 - index,
    market_cap_rank: index + 1,
    total_volume: 10,
    price_change_percentage_1h_in_currency: 0.4,
    price_change_percentage_24h: 1,
    price_change_percentage_7d_in_currency: 2,
    price_change_percentage_30d_in_currency: -3,
    max_supply: 21000000,
  }));
}

function dexRow(symbol: string, detailId: string | null): DexTokenRow {
  return {
    id: symbol.toLowerCase(),
    symbol,
    name: symbol,
    price: 2,
    priceUnavailable: false,
    volume24h: 1000,
    network: "Ethereum",
    dex: "Uniswap",
    detailId,
    address: `eth_${symbol.toLowerCase()}`,
    reserveUsd: 50_000,
  };
}

// CI-TESTS: a read in one test (e.g. the tape test) can start a detached DEX refresh. With no seed
// fetch installed it called live DexPaprika/GeckoTerminal, and the next test's refresh joined that
// in-flight job: a 5 s timeout on a slow network, then live rows landing in the following test.
// Every test starts with an offline seed fetch, and no refresh outlives its test.
beforeEach(() => {
  installSeedFetch(async () => jsonResponse({ data: [] }));
});

afterEach(async () => {
  await dexRefreshSettled();
  resetCryptoSnapshotsForTests();
  resetSnapshotUpgradeBackoff();
  resetSeedFetch();
  delete process.env.COINGECKO_API_KEY;
  delete process.env.SWYFTX_PUBLIC_DISPLAY;
  delete process.env.DEXSCREENER_PUBLIC_DISPLAY;
  vi.restoreAllMocks();
});

describe("pull-check:v3-retest10-2026-10-13", () => {
  it("is marked on the public copy and the build version", () => {
    expect(read("src/lib/public-copy.ts")).toContain("pull-check:v3-retest10-2026-10-13");
    expect(read("public/build-version.txt").trim()).toBe("v3-b88-2026-10-28");
    expect(read("qa/PULL-CHECK-2026-10-12.md")).toContain("pull-check:v3-retest10-2026-10-13");
    expect(read("src/lib/crypto-board-store.ts")).toContain("Never seed when a snapshot exists");
    expect(read("src/lib/crypto-source.ts")).toContain("readSharedCryptoBoard({ seed: false })");
    expect(read("src/lib/crypto-source.ts")).toContain("upgradeStoredCryptoBoard");
  });

  it("replaces a Yahoo-only snapshot when a richer seed succeeds, and keeps it against a short list", async () => {
    installSnapshotDurable(memoryDurable());
    const at = "2026-10-12T13:24:50.000Z";
    await persistCryptoSnapshot(many(89, "yahoo"), at);
    clearSnapshotMemory();
    await persistCryptoSnapshot(many(10), "2026-10-12T13:30:00.000Z");
    clearSnapshotMemory();
    const kept = await readCryptoSnapshot(50);
    expect(kept?.coins).toHaveLength(89);
    expect(kept?.at).toBe(at);

    installSeedFetch(async (url) => {
      const href = String(url);
      if (href.includes("coingecko.com")) return jsonResponse(geckoMarkets(120));
      return jsonResponse([]);
    });
    await upgradeStoredCryptoBoard(2_000);
    clearSnapshotMemory();
    const saved = await readCryptoSnapshot(50);
    expect(saved?.coins.length).toBeGreaterThanOrEqual(100);
    expect(saved?.coins.every((row) => row.source !== "yahoo")).toBe(true);
    expect(saved?.coins[0].maxSupply).toBe(21000000);
    expect(saved?.coins[0].change1h).toBe(0.4);
    expect(saved?.at).not.toBe(at);

    const board = await readSharedCryptoBoard({ seed: false });
    expect(board.notice).toContain("CoinGecko");
    expect(board.notice).not.toContain("Yahoo Finance");
  });

  it("records a datacentre refusal for CoinGecko without the key", async () => {
    expect(seedFailureReason("coingecko", 403)).toBe(COINGECKO_DATACENTRE_HINT);
    expect(seedFailureReason("coingecko", 1020)).toContain("COINGECKO_API_KEY");
    expect(seedFailureReason("coinpaprika", 403)).toContain("datacentre IP");
    installSeedFetch(async (url) => {
      const href = String(url);
      if (href.includes("coingecko.com")) return jsonResponse({ status: { error_code: 403 } }, 403);
      if (href.includes("coinpaprika.com")) return jsonResponse({}, 403);
      if (href.includes("binance")) return jsonResponse({}, 429);
      return jsonResponse([]);
    });
    const { loadKeylessCryptoMarkets } = await import("@/lib/crypto-keyless-seed");
    await loadKeylessCryptoMarkets({ budgetMs: 500 });
    const report = lastCryptoSeedReport();
    const gecko = report.find((row) => row.source === "coingecko");
    expect(gecko?.status).toBe(403);
    expect(gecko?.reason).toBe(COINGECKO_DATACENTRE_HINT);
    expect(JSON.stringify(report)).not.toContain("cg-test-key");
    expect(read("src/lib/crypto-diagnostics.ts")).toContain("lastCryptoSeedReport");
    expect(read("src/lib/crypto-diagnostics.ts")).toContain("coinpaprika");
    expect(read("src/lib/crypto-diagnostics.ts")).toContain("binance");
  });

  it("labels the tape with the snapshot source", async () => {
    installSnapshotDurable(memoryDurable());
    await persistCryptoSnapshot(
      [coin({ symbol: "BTC", price: 80_000, source: "yahoo", id: "bitcoin", name: "Bitcoin", marketCap: 0, change24h: -1 })],
      "2026-10-12T13:24:50.000Z"
    );
    clearSnapshotMemory();
    const quotes = await snapshotQuotesForSymbols(["BTC"]);
    expect(quotes.BTC.source).toBe("yahoo");
    expect(read("src/lib/public-ticker.ts")).not.toContain('provider: "CoinGecko"');
    expect(read("src/components/MarketTicker.tsx")).toContain("AbortSignal.timeout(4_000)");
    expect(read("src/components/MarketTicker.tsx")).toContain("res.aborted");
  });

  it("fills a 1h and 30d move from chart closes", () => {
    const hour = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112];
    expect(trailingCloseChange(hour, 12)).toBeCloseTo(12);
    const month = [80, 100];
    expect(trailingCloseChange(month, month.length - 1)).toBeCloseTo(25);
    expect(trailingCloseChange([10], 12)).toBeNull();
  });

  it("drops DEX rows with no detail id and keeps a larger GeckoTerminal list", async () => {
    expect(dexDetailId("BULL", null)).toBeNull();
    expect(dexDetailId("PEPE")).toBe("pepe");
    expect(dexDetailId("WETH")).toBe("weth");
    installSnapshotDurable(memoryDurable());
    await persistCryptoSnapshot(many(40), new Date().toISOString());
    await persistDexSnapshot(
      [dexRow("PEPE", "pepe"), dexRow("BULL", null)],
      "2026-10-12T13:56:00.000Z",
      ["dexpaprika"]
    );
    clearSnapshotMemory();
    const stored = await readDexSnapshot(50);
    expect(stored?.rows.map((row) => row.symbol)).toEqual(["PEPE"]);

    installSeedFetch(async (url) => {
      const href = String(url);
      if (!href.includes("geckoterminal.com") || !href.includes("trending_pools")) return jsonResponse({ data: [] });
      const data = Array.from({ length: 16 }, (_, index) => ({
        id: `pool-${index}`,
        attributes: { base_token_price_usd: String(index + 1), volume_usd: { h24: "5000" }, name: `T${index} / USDC` },
        relationships: {
          base_token: { data: { id: `eth_tok${index}` } },
          dex: { data: { id: "uniswap" } },
          network: { data: { id: "eth" } },
        },
      }));
      const included = data.map((pool, index) => ({
        id: `eth_tok${index}`,
        type: "token",
        attributes: { symbol: `T${index}`, name: `Token ${index}`, coingecko_coin_id: `token-${index}` },
      }));
      included.push({ id: "uniswap", type: "dex", attributes: { name: "Uniswap", symbol: "", coingecko_coin_id: "" } } as (typeof included)[number]);
      return jsonResponse({ data, included });
    });
    resetSnapshotUpgradeBackoff();
    const started = Date.now();
    const board = await readSharedDexBoard({ revalidate: true });
    expect(Date.now() - started).toBeLessThan(2_500);
    if (board.rows.length) {
      expect(board.rows.length).toBeGreaterThanOrEqual(16);
      expect(board.rows.every((row) => !!row.detailId)).toBe(true);
      expect(board.notice).toContain("GeckoTerminal");
      expect(board.notice?.startsWith("Prices paused")).toBe(false);
    } else {
      expect(board.notice).toMatch(/^Prices paused since /);
    }
    await dexRefreshSettled();
    const settled = await readDexSnapshot();
    expect(settled?.rows.length).toBeGreaterThanOrEqual(16);
    expect(settled?.rows.every((row) => !!row.detailId)).toBe(true);
    expect((settled?.sources || []).join(" ").toLowerCase()).toContain("geckoterminal");
  });

  it("hides DEX rows and says prices are paused when a stale refresh returns nothing", async () => {
    installSnapshotDurable(memoryDurable());
    await persistDexSnapshot([dexRow("PEPE", "pepe")], "2026-10-12T13:56:00.000Z", ["dexpaprika"]);
    clearSnapshotMemory();
    installSeedFetch(async () => jsonResponse({ data: [] }));
    const board = await readSharedDexBoard({ revalidate: true });
    expect(board.rows).toEqual([]);
    expect(board.notice).toMatch(/^Prices paused since /);
    expect(board.notice).toContain("(NZ).");
  });

  it("b62 TT P2: keeps the last good DEX list (marked delayed) when a refresh fails within 24 h", async () => {
    installSnapshotDurable(memoryDurable());
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    await persistDexSnapshot([dexRow("PEPE", "pepe")], twoHoursAgo, ["dexpaprika"]);
    clearSnapshotMemory();
    installSeedFetch(async () => jsonResponse({ data: [] }));
    const board = await readSharedDexBoard({ revalidate: true });
    expect(board.rows.map((row) => row.symbol)).toEqual(["PEPE"]);
    expect(board.delayed).toBe(true);
    expect(board.notice).toContain("last good list is shown");
    expect(board.notice).not.toMatch(/Prices paused/);
  });

  it("sends the stocks CSV through review and does not rewrite a ticker code", () => {
    expect(holdingsTickerFromCell("BTC / BITCOIN")).toBe("BTC");
    expect(parseHoldingsCsv("ticker,units,price paid\nBTC / BITCOIN,0.5,80000\n").rows[0]).toMatchObject({
      ticker: "BTC",
      assetType: "crypto",
    });
    const named = planBrokerImport(
      ["ticker,units,price paid,date,fx", "APPL / APPLE INC,2,180,2026-03-04,1.65", "AAPL / APPLE INC,1,100,2026-03-05,1.65"].join("\n"),
      { openingCashNzd: 1_000_000 }
    );
    expect(named.needsMapping).toBe(false);
    expect(named.toWrite.map((row) => `${row.side}:${row.ticker}`)).toEqual(["buy:AAPL"]);
    expect(named.unsupported.some((row) => row.ticker === "APPL")).toBe(true);
    expect(named.toWrite.some((row) => row.ticker === "APPL")).toBe(false);

    const dated = planBrokerImport(
      ["ticker,units,price paid,date", "FPH.NZ,1,10,2026-03-04", "AAPL,1,10,not-a-date"].join("\n"),
      { openingCashNzd: 1_000 }
    );
    expect(dated.toWrite.map((row) => row.ticker)).toEqual(["FPH.NZ"]);
    expect(dated.toWrite[0].side).toBe("buy");
    expect(dated.unsupported.length).toBe(1);
    expect(importWrites(dated)).toBe(false);
    expect(importWrites(dated, true)).toBe(true);

    const undated = planBrokerImport("ticker,units,price paid\nFPH.NZ,1,10\n");
    expect(undated.needsMapping).toBe(false);
    expect(undated.toWrite).toHaveLength(0);
    expect(undated.unsupported[0].reason).toMatch(/date/i);
    expect(importWrites(undated)).toBe(false);

    const button = read("src/components/dashboard/HoldingsCsvImport.tsx");
    expect(button).toContain('assetType === "stock"');
    expect(button).toContain('router.push("/import")');
    expect(button).toContain("HOLDINGS_IMPORT_DRAFT_KEY");
    expect(read("src/components/import/BrokerImportPanel.tsx")).toContain("HOLDINGS_IMPORT_DRAFT_KEY");
    expect(read("src/components/import/BrokerImportPanel.tsx")).toContain("run(false)");
  });

  it("counts currency effect on open lots only", () => {
    const split = splitReturns(
      [
        {
          quantity: 100,
          costPrice: 10,
          markPrice: 10,
          currency: "USD",
          fxAtCost: 1.6,
          fxNow: 1.65,
          purchaseDate: "2020-01-15",
        },
      ],
      0,
      50
    );
    expect(split.currencyEffectNzd).toBe(50);
    expect(split.currencyNote).toContain("buy price");
    expect(split.currencyNote).not.toContain("open lots only");
    expect(read("src/components/dashboard/TransactionCenter.tsx")).not.toContain('data-testid="ledger-live"');
  });
});
