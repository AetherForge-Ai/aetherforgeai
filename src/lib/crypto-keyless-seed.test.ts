import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/crypto-yahoo", () => ({
  fetchYahooMajorMarkets: vi.fn(async () => []),
}));

import sitemap from "@/app/sitemap";
import type { CoinMarket } from "@/lib/crypto-market";
import {
  backupWithYahoo,
  coinsFromBinanceTickers,
  dexRowsFromPaprikaPools,
  installSeedFetch,
  loadKeylessCryptoMarkets,
  loadKeylessDexMarkets,
  mergeDexSeedRows,
  mergeVerifiedSeedLists,
  resetSeedFetch,
  type SeedFetch,
} from "@/lib/crypto-keyless-seed";
import {
  clearSnapshotMemory,
  installSnapshotDurable,
  persistCryptoSnapshot,
  readCryptoSnapshot,
  resetCryptoSnapshotsForTests,
  type SnapshotDurable,
  type SnapshotId,
} from "@/lib/crypto-snapshot";
import { readSharedCryptoBoard, readSharedDexBoard } from "@/lib/crypto-board-store";

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
    change1h: null,
    change24h: 1,
    change7d: 2,
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
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  resetCryptoSnapshotsForTests();
  resetSeedFetch();
  delete process.env.SWYFTX_PUBLIC_DISPLAY;
  delete process.env.DEXSCREENER_PUBLIC_DISPLAY;
  delete process.env.COINGECKO_API_KEY;
  vi.restoreAllMocks();
});

describe("pull-check:v3-crypto-seed-2026-10-12", () => {
  it("is marked in the seed, the board, and the qa note", () => {
    const qa = read("qa/PULL-CHECK-2026-10-12.md");
    expect(qa).toContain("pull-check:v3-crypto-seed-2026-10-12");
    expect(read("src/lib/crypto-keyless-seed.ts")).toContain("pull-check:v3-crypto-seed-2026-10-12");
    expect(read("src/lib/crypto-board-store.ts")).toContain("pull-check:v3-crypto-seed-2026-10-12");
    expect(read("src/app/sitemap.ts")).not.toContain('"/returns"');
    const paths = sitemap().map((row) => new URL(row.url).pathname);
    expect(paths).not.toContain("/returns");
  });

  it("drops a 3× outlier, a broken stablecoin peg, and a gated source", () => {
    const merged = mergeVerifiedSeedLists([
      [
        coin({ symbol: "BTC", price: 100, source: "coingecko", name: "Bitcoin", id: "bitcoin" }),
        coin({ symbol: "ETH", price: 10, source: "coingecko", name: "Ethereum", id: "ethereum" }),
        coin({ symbol: "USDT", price: 1, source: "coinpaprika", name: "Tether", id: "tether" }),
      ],
      [
        coin({ symbol: "BTC", price: 10_000, source: "binance", name: "BTC" }),
        coin({ symbol: "ETH", price: 11, source: "coinpaprika", name: "Ethereum", id: "ethereum" }),
        coin({ symbol: "USDT", price: 4, source: "binance", name: "Tether" }),
        coin({ symbol: "SOL", price: 20, source: "swyftx", name: "Solana" }),
      ],
    ]);
    const bySymbol = Object.fromEntries(merged.map((row) => [row.symbol, row]));
    expect(bySymbol.BTC).toBeUndefined();
    expect(bySymbol.ETH.price).toBe(10);
    expect(bySymbol.ETH.source).toBe("coingecko");
    expect(bySymbol.USDT.price).toBe(1);
    expect(bySymbol.USDT.source).toBe("coinpaprika");
    expect(bySymbol.SOL).toBeUndefined();
  });

  it("keeps a single verified print and the 89-coin Yahoo backup", () => {
    const alone = mergeVerifiedSeedLists([[coin({ symbol: "BTC", price: 80_000, source: "binance", name: "Bitcoin" })]]);
    expect(alone).toHaveLength(1);
    expect(alone[0].source).toBe("binance");
    expect(alone[0].price).toBe(80_000);

    const yahoo = many(89, "yahoo");
    const seeded = backupWithYahoo([], yahoo);
    expect(seeded).toHaveLength(89);
    expect(seeded.every((row) => row.source === "yahoo" && row.price > 0)).toBe(true);
    expect(backupWithYahoo(many(50), yahoo)).toHaveLength(50);
  });

  it("stores an 89-coin seed and does not replace it with a shorter list", async () => {
    installSnapshotDurable(memoryDurable());
    const at = "2026-10-12T01:00:00.000Z";
    await persistCryptoSnapshot(many(89, "yahoo"), at);
    clearSnapshotMemory();
    const saved = await readCryptoSnapshot(50);
    expect(saved?.coins).toHaveLength(89);
    expect(saved?.at).toBe(at);
    expect(saved?.coins[0].source).toBe("yahoo");
    expect(saved?.coins.every((row) => row.price > 0)).toBe(true);

    await persistCryptoSnapshot(many(10), "2026-10-12T02:00:00.000Z");
    clearSnapshotMemory();
    const still = await readCryptoSnapshot(50);
    expect(still?.coins).toHaveLength(89);
    // b38 H-1 (Chief ruling 1): after 10 min the shorter list refreshes matching coins; the 89 rows stay.
    expect(Date.parse(still?.at || "")).toBeGreaterThanOrEqual(Date.parse(at));
  });

  it("does not replace a fresh 400-coin verified list with a shorter verified page", async () => {
    installSnapshotDurable(memoryDurable());
    const at = "2026-10-12T03:00:00.000Z";
    await persistCryptoSnapshot(many(400), at);
    clearSnapshotMemory();
    await persistCryptoSnapshot(many(250), "2026-10-12T03:10:00.000Z");
    clearSnapshotMemory();
    const still = await readCryptoSnapshot(50);
    expect(still?.coins).toHaveLength(400);
    expect(still?.at).toBe(at);
  });

  it("b24 G-05: a shorter verified page replaces a list that is already amber (15+ min old)", async () => {
    installSnapshotDurable(memoryDurable());
    await persistCryptoSnapshot(many(400), "2026-10-12T03:00:00.000Z");
    clearSnapshotMemory();
    await persistCryptoSnapshot(many(250), "2026-10-12T03:16:00.000Z");
    clearSnapshotMemory();
    const now = await readCryptoSnapshot(50);
    expect(now?.coins).toHaveLength(250);
    expect(now?.at).toBe("2026-10-12T03:16:00.000Z");
  });

  it("b24 G-05: a verified list a few coins shorter (393 vs 394) replaces a fresh one", async () => {
    installSnapshotDurable(memoryDurable());
    await persistCryptoSnapshot(many(394), "2026-10-12T03:00:00.000Z");
    clearSnapshotMemory();
    await persistCryptoSnapshot(many(393), "2026-10-12T03:06:00.000Z");
    clearSnapshotMemory();
    expect((await readCryptoSnapshot(50))?.at).toBe("2026-10-12T03:06:00.000Z");
  });

  it("seeds from CoinPaprika when CoinGecko is blocked and does not call gated hosts", async () => {
    delete process.env.COINGECKO_API_KEY;
    const urls: string[] = [];
    const fetcher: SeedFetch = async (url) => {
      urls.push(String(url));
      const href = String(url);
      if (href.includes("api.coingecko.com")) return jsonResponse({ status: { error_code: 429 } }, 429);
      if (href.includes("pro-api.coingecko.com")) return jsonResponse({}, 401);
      if (href.includes("coinpaprika.com")) {
        return jsonResponse(
          Array.from({ length: 50 }, (_, index) => ({
            id: `c${index}-coin-${index}`,
            symbol: `C${index}`,
            name: `Coin ${index}`,
            rank: index + 1,
            last_updated: "2026-10-12T01:00:00Z",
            quotes: { USD: { price: index + 1, market_cap: 1_000 - index, volume_24h: 10, percent_change_24h: 1 } },
          }))
        );
      }
      return jsonResponse([]);
    };
    installSeedFetch(fetcher);
    const coins = await loadKeylessCryptoMarkets({ budgetMs: 1_000 });
    expect(coins.length).toBeGreaterThanOrEqual(50);
    expect(coins.every((row) => row.price > 0)).toBe(true);
    expect(coins.some((row) => row.source === "coinpaprika")).toBe(true);
    expect(urls.some((url) => url.includes("api.coingecko.com"))).toBe(true);
    expect(urls.some((url) => url.includes("pro-api.coingecko.com"))).toBe(false);
    expect(urls.some((url) => url.includes("dexscreener.com") || url.includes("swyftx"))).toBe(false);
    expect(coinsFromBinanceTickers([
      { symbol: "BTCUSDT", lastPrice: "80000", quoteVolume: "10", priceChangePercent: "1", closeTime: 1_791_796_818_001 },
      { symbol: "BTCUPUSDT", lastPrice: "1", quoteVolume: "10" },
      { symbol: "ETHBTC", lastPrice: "0.03" },
    ]).map((row) => row.symbol)).toEqual(["BTC"]);
  });

  it("serves the seeded list, with source and age, when the snapshot is empty", async () => {
    installSnapshotDurable(memoryDurable());
    installSeedFetch(async (url) => {
      const href = String(url);
      if (href.includes("coinpaprika.com")) {
        return jsonResponse(
          Array.from({ length: 50 }, (_, index) => ({
            id: `c${index}-coin-${index}`,
            symbol: `P${index}`,
            name: `Paprika ${index}`,
            rank: index + 1,
            last_updated: "2026-10-12T03:05:00Z",
            quotes: { USD: { price: index + 2, market_cap: 5_000 - index, volume_24h: 10, percent_change_24h: 1 } },
          }))
        );
      }
      if (href.includes("coingecko.com")) return jsonResponse({}, 429);
      return jsonResponse([]);
    });
    const board = await readSharedCryptoBoard();
    expect(board.coins.length).toBeGreaterThanOrEqual(50);
    expect(board.coins.every((row) => row.price > 0)).toBe(true);
    expect(board.notice).toMatch(/Prices last updated /);
    expect(board.notice).not.toContain("CoinPaprika");
    expect(board.at).toBeTruthy();
  });

  it("seeds a completely empty crypto snapshot even when the caller passes seed false", async () => {
    installSnapshotDurable(memoryDurable());
    installSeedFetch(async (url) => {
      const href = String(url);
      if (href.includes("coinpaprika.com")) {
        return jsonResponse(
          Array.from({ length: 12 }, (_, index) => ({
            id: `e${index}-coin-${index}`,
            symbol: `E${index}`,
            name: `Empty ${index}`,
            rank: index + 1,
            last_updated: "2026-10-12T03:05:00Z",
            quotes: { USD: { price: index + 2, market_cap: 5_000 - index, volume_24h: 10, percent_change_24h: 1 } },
          }))
        );
      }
      return jsonResponse([]);
    });
    // b31 REG-1: the request waits at most 1.2 s; the seed finishes in the background.
    let board = await readSharedCryptoBoard({ seed: false });
    for (let i = 0; i < 40 && board.coins.length < 12; i += 1) {
      await new Promise((r) => setTimeout(r, 100));
      board = await readSharedCryptoBoard({ seed: false });
    }
    expect(board.coins.length).toBeGreaterThanOrEqual(12);
    expect(board.at).toBeTruthy();
    clearSnapshotMemory();
    installSeedFetch(async () => {
      throw new Error("seed should not run when a snapshot exists");
    });
    const stored = await readSharedCryptoBoard({ seed: false });
    expect(stored.coins.length).toBeGreaterThanOrEqual(12);
    expect(stored.at).toBe(board.at);
  });

  it("serves a stored list and its delayed label without waiting on a new seed", async () => {
    installSnapshotDurable(memoryDurable());
    const at = "2026-10-11T01:00:00.000Z";
    await persistCryptoSnapshot(many(40), at);
    clearSnapshotMemory();
    installSeedFetch(async () => {
      throw new Error("seed should not be required");
    });
    const board = await readSharedCryptoBoard();
    expect(board.coins).toHaveLength(40);
    expect(board.at).toBe(at);
    expect(board.notice).toContain("Prices last updated");
    expect(board.notice).toContain("The feed is delayed.");
    expect(board.notice).toContain("Source: CoinGecko.");
    expect(board.coins.every((row) => row.price > 0)).toBe(true);
  });

  it("falls back to DexPaprika when GeckoTerminal is blocked", async () => {
    installSnapshotDurable(memoryDurable());
    const urls: string[] = [];
    installSeedFetch(async (url) => {
      urls.push(String(url));
      const href = String(url);
      if (href.includes("geckoterminal.com")) return jsonResponse({}, 429);
      if (href.includes("dexpaprika.com") && href.includes("ethereum")) {
        return jsonResponse({
          results: [
            {
              chain: "ethereum",
              dex_name: "Uniswap",
              price_usd: 0.0000042,
              volume_usd_24h: 1_000_000,
              liquidity_usd: 80_000,
              tokens: [{ id: "0x6982508145454ce325ddbe47a25d4ec3d2311933", chain: "ethereum" }],
            },
          ],
        });
      }
      return jsonResponse({ results: [] });
    });
    const loaded = await loadKeylessDexMarkets({ budgetMs: 1_000 });
    expect(loaded.sources).toEqual(["dexpaprika"]);
    expect(loaded.rows.map((row) => row.symbol)).toContain("PEPE");
    expect(loaded.rows.every((row) => (row.price || 0) > 0)).toBe(true);

    const split = mergeDexSeedRows([
      [{ id: "a", symbol: "AAA", name: "Aaa", price: 10, priceUnavailable: false, volume24h: 1, network: "Ethereum", dex: "Uniswap", detailId: null, address: "eth_0xa", reserveUsd: 50_000 }],
      [{ id: "a", symbol: "AAA", name: "Aaa", price: 4_000, priceUnavailable: false, volume24h: 1, network: "Ethereum", dex: "Uniswap", detailId: null, address: "eth_0xa", reserveUsd: 40_000 }],
    ]);
    expect(split).toHaveLength(0);
    expect(dexRowsFromPaprikaPools({ results: [] })).toEqual([]);

    clearSnapshotMemory();
    const board = await readSharedDexBoard();
    expect(board.rows.length).toBeGreaterThan(0);
    expect(board.rows.every((row) => (row.price || 0) > 0)).toBe(true);
    expect(board.notice).toMatch(/Prices last updated /);
    expect(board.notice).toContain("Source: DexPaprika.");
    expect(urls.some((url) => url.includes("dexscreener.com"))).toBe(false);
  });
});
