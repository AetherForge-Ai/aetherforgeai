import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { clientFacingError, parseApiBody } from "@/lib/api-json";
import { dexBody, marketsBody } from "@/lib/crypto-api-body";
import {
  DEX_BACKOFF_MS,
  DEX_COLD_BUDGET_MS,
  DEX_FILL_CONCURRENCY,
  DEX_FURTHER_NOTICE,
  DEX_LIQUIDITY_FLOOR_USD,
  DEX_PAGE_CAP,
  DEX_POOLS_PER_PAGE,
  DEX_STALE_MS,
  DEX_TRENDING,
  dedupeDexTokens,
  dexCallWaitMs,
  dexListNotice,
  dexNetworkLabel,
  dexPricesAgree,
  dexResponseCacheControl,
  dexRowClearsFloor,
  freshDexRows,
  mergeDexLists,
  nextDexTarget,
  parseMegafilterPage,
  takeDexJobs,
  type DexStoredPage,
  type DexTokenRow,
} from "@/lib/crypto-dex";
import { LIVE_CRYPTO_UNAVAILABLE, coingeckoRolling24h, rankedFallbackPage, type CoinMarket } from "@/lib/crypto-market";

function coin(partial: Partial<CoinMarket> & Pick<CoinMarket, "symbol" | "price">): CoinMarket {
  return {
    id: partial.symbol.toLowerCase(),
    name: partial.name || partial.symbol,
    image: "",
    rank: partial.rank ?? 1,
    marketCap: partial.marketCap ?? 1,
    fdv: null,
    volume24h: 0,
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

describe("crypto API bodies stay JSON", () => {
  it("does not use a 502 and does not invent a price when the list is empty", () => {
    const markets = marketsBody([], null);
    const dex = dexBody(null);
    expect(markets).toEqual({ ok: false, error: LIVE_CRYPTO_UNAVAILABLE });
    expect(dex.ok).toBe(false);
    expect(dex.error).toBe("Live decentralized-token prices are unavailable.");
    expect(JSON.stringify(markets)).not.toMatch(/<!DOCTYPE|error code: 502/i);
    expect(LIVE_CRYPTO_UNAVAILABLE).not.toMatch(/0\.00|Unexpected token/);
  });

  it("returns the live rows when a source produced them", () => {
    const body = marketsBody([{ symbol: "BTC", price: 100 }], null);
    expect(body.ok).toBe(true);
    if (body.ok) expect(body.total).toBe(1);
  });
});

describe("client JSON guard", () => {
  it("turns an HTML document into the plain sentence", () => {
    const parsed = parseApiBody(
      "/api/crypto/markets",
      "text/html",
      "<!DOCTYPE html><html><body>error</body></html>",
      502
    );
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error).toBe(LIVE_CRYPTO_UNAVAILABLE);
      expect(parsed.error).not.toMatch(/Unexpected token|DOCTYPE/);
    }
  });

  it("turns Cloudflare's text 502 into the plain sentence", () => {
    const parsed = parseApiBody("/api/crypto/markets", "text/plain", "error code: 502", 502);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toBe(LIVE_CRYPTO_UNAVAILABLE);
  });

  it("still reads a real JSON body", () => {
    const parsed = parseApiBody(
      "/api/crypto/markets",
      "application/json",
      JSON.stringify({ ok: true, data: [{ symbol: "ETH" }], total: 1 }),
      200
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.json.ok).toBe(true);
  });

  it("hides a parse exception that a caller already caught", () => {
    const shown = clientFacingError(
      "/api/crypto/dex",
      "Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON"
    );
    expect(shown).toBe(LIVE_CRYPTO_UNAVAILABLE);
  });
});

describe("ranked fallback prices", () => {
  it("keeps a live print, drops a missing one, and leaves a missing chain blank", () => {
    const page = rankedFallbackPage([
      coin({ symbol: "BTC", price: 86000, rank: 1 }),
      coin({ symbol: "ZERO", price: 0, rank: 2, priceUnavailable: true }),
      coin({ symbol: "ETH", price: 2000, rank: 3, blockchain: "Native" }),
    ]);
    expect(page.coins.map((row) => row.symbol)).toEqual(["BTC", "ETH"]);
    expect(page.coins[0].price).toBe(86000);
    expect(page.coins[0].blockchain).toBe("");
    expect(page.coins[1].blockchain).toBe("Native");
    expect(page.coins.some((row) => row.price === 0)).toBe(false);
    expect(page.notice).toBeNull();
    expect(page.coins.some((row) => row.blockchain === "Unavailable")).toBe(false);
    expect(coingeckoRolling24h({ price_change_percentage_24h: -6.4, price_change_percentage_24h_in_currency: -12.35 })).toBe(-6.4);
    expect(coingeckoRolling24h({ price_change_percentage_24h_in_currency: { usd: -6.1 } })).toBe(-6.1);
  });
});

describe("GeckoTerminal pool pages", () => {
  it("reads a live pool price and the network passed in when the payload omits it", () => {
    const rows = parseMegafilterPage(
      {
        data: [
          {
            id: "eth_pool",
            attributes: { base_token_price_usd: "73.91", volume_usd: { h24: "1000" } },
            relationships: {
              base_token: { data: { id: "eth_0xabc" } },
              dex: { data: { id: "uniswap_v2" } },
            },
          },
          {
            id: "eth_pool_2",
            attributes: { base_token_price_usd: "0" },
            relationships: { base_token: { data: { id: "eth_0xdef" } } },
          },
        ],
        included: [
          { id: "eth_0xabc", type: "token", attributes: { symbol: "BULL", name: "BULL", coingecko_coin_id: null } },
          { id: "eth_0xdef", type: "token", attributes: { symbol: "NOPRICE", name: "No Price" } },
          { id: "uniswap_v2", type: "dex", attributes: { name: "Uniswap V2" } },
        ],
      },
      "eth"
    );
    const unique = dedupeDexTokens(rows, 400);
    const bull = unique.find((row) => row.symbol === "BULL");
    const missing = unique.find((row) => row.symbol === "NOPRICE");
    expect(bull?.price).toBe(73.91);
    expect(bull?.priceUnavailable).toBe(false);
    expect(bull?.network).toBe("Ethereum");
    expect(bull?.dex).toBe("Uniswap V2");
    expect(bull?.detailId).toBeNull();
    expect(missing?.price).toBeNull();
    expect(missing?.priceUnavailable).toBe(true);
    expect(dexNetworkLabel("")).toBe("Unavailable");
    expect(dexNetworkLabel("solana")).toBe("Solana");
  });
});

function dexRow(
  symbol: string,
  price: number | null,
  volume: number | null = price != null && price > 0 ? 10 : null,
  network = "Ethereum"
): DexTokenRow {
  return {
    id: symbol.toLowerCase(),
    symbol,
    name: symbol,
    price,
    priceUnavailable: !(price != null && price > 0),
    volume24h: volume != null && volume > 0 ? volume : null,
    network,
    dex: "uniswap_v2",
    detailId: null,
    reserveUsd: 50_000,
  };
}

function stored(network: string, page: number, fetchedAt: number, rows: DexTokenRow[]): DexStoredPage {
  return { network, page, fetchedAt, rows };
}

describe("DEX page store", () => {
  const now = Date.parse("2026-10-05T04:00:00.000Z");

  it("drops a page older than 30 minutes instead of keeping its price", () => {
    const fresh = stored("eth", 1, now - 60_000, [dexRow("BULL", 73.91)]);
    const stale = stored("solana", 1, now - DEX_STALE_MS - 1, [dexRow("OLD", 4.5)]);
    const rows = freshDexRows([fresh, stale], now);
    expect(rows.map((row) => row.symbol)).toEqual(["BULL"]);
    expect(rows[0].price).toBe(73.91);
    expect(rows.some((row) => row.symbol === "OLD" || row.price === 0)).toBe(false);
  });

  it("keeps an honest notice while a fresh list is under 400", () => {
    expect(dexListNotice(0)).toMatch(/Showing 0 of up to 400/);
    expect(dexListNotice(1)).toBe(`Showing 1 of up to 400. ${DEX_FURTHER_NOTICE}`);
    expect(dexListNotice(33, true)).toBe("Showing 33 of up to 400. The rate limit stopped the list.");
    expect(dexListNotice(399)).toContain("399");
    expect(dexListNotice(400)).toBeNull();
  });

  it("ranks a higher-volume solana token above a lower-volume eth token", () => {
    const rows = freshDexRows(
      [
        stored("eth", 1, now, [dexRow("LOW", 2, 100, "Ethereum")]),
        stored("solana", 1, now, [dexRow("HIGH", 3, 9_000, "Solana"), dexRow("QUIET", 1, null, "Solana")]),
      ],
      now
    );
    expect(rows.map((row) => row.symbol)).toEqual(["HIGH", "LOW", "QUIET"]);
    expect(rows[0].network).toBe("Solana");
    expect(rows[0].volume24h).toBe(9_000);
    const sameSymbol = freshDexRows(
      [
        stored("eth", 1, now, [dexRow("WETH", 1, 50, "Ethereum")]),
        stored("solana", 1, now, [dexRow("WETH", null, 8_000, "Solana")]),
      ],
      now
    );
    expect(sameSymbol).toHaveLength(1);
    expect(sameSymbol[0].price).toBe(1);
    expect(sameSymbol[0].network).toBe("Ethereum");
  });

  it("fills a missing page, skips past an empty page, and does not refetch once 400 are fresh", () => {
    const pages = [stored("eth", 1, now, [dexRow("BULL", 1)])];
    expect(nextDexTarget(pages, now)).toEqual({ network: DEX_TRENDING, page: 1 });
    const stale = [
      stored(DEX_TRENDING, 1, now, [dexRow("NEW", 1)]),
      stored("eth", 1, now - DEX_STALE_MS - 1, [dexRow("OLD", 9)]),
    ];
    expect(nextDexTarget(stale, now)).toEqual({ network: "trend:eth", page: 1 });
    const emptyEth = [stored("eth", 1, now, [])];
    expect(nextDexTarget(emptyEth, now)?.network).not.toBe("eth");
    expect(nextDexTarget(emptyEth, now)?.page).toBe(1);
    const full = Array.from({ length: 400 }, (_, index) => dexRow(`T${index}`, 1 + index));
    expect(nextDexTarget([stored("eth", 1, now, full)], now)).toBeNull();
  });

  it("waits so a walk stays inside 30 calls a minute", () => {
    expect(dexCallWaitMs([], now)).toBe(0);
    expect(dexCallWaitMs([now - 500], now)).toBe(1_500);
    const burst = Array.from({ length: 30 }, (_, index) => now - 59_000 + index);
    expect(dexCallWaitMs(burst, now)).toBeGreaterThan(0);
    expect(dexCallWaitMs(burst, now)).toBeLessThanOrEqual(60_000);
  });

  it("drops a pool under the liquidity floor and keeps the deeper reserve when prices disagree", () => {
    const dust = { ...dexRow("DUST", 1, 9_000), reserveUsd: 100 };
    const deep = { ...dexRow("DEEP", 2, 100), reserveUsd: DEX_LIQUIDITY_FLOOR_USD };
    expect(dexRowClearsFloor(dust)).toBe(false);
    expect(dexRowClearsFloor(deep)).toBe(true);
    const rows = freshDexRows([stored("eth", 1, now, [dust, deep])], now);
    expect(rows.map((row) => row.symbol)).toEqual(["DEEP"]);
    expect(dexPricesAgree(1, 3)).toBe(true);
    expect(dexPricesAgree(1, 4)).toBe(false);
    const calm = { ...dexRow("WETH", 100, 10), address: "eth_0x1", reserveUsd: 20_000 };
    const wild = { ...dexRow("WETH", 1_000, 50_000), address: "eth_0x1", reserveUsd: 80_000 };
    const kept = dedupeDexTokens([calm, wild], 400);
    expect(kept).toHaveLength(1);
    expect(kept[0].price).toBe(1_000);
    expect(kept[0].reserveUsd).toBe(80_000);
  });

  it("dedupes by token address and keeps the same symbol on two chains", () => {
    const eth = { ...dexRow("WETH", 3000, 100, "Ethereum"), address: "eth_0xaaa" };
    const sol = { ...dexRow("WETH", 2990, 50, "Solana"), address: "solana_bbb" };
    const again = { ...dexRow("WETH", 3001, 10, "Ethereum"), address: "eth_0xaaa" };
    const rows = dedupeDexTokens([eth, sol, again], 400);
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.address === "eth_0xaaa")?.price).toBe(3000);
    expect(rows.some((row) => row.address === "solana_bbb")).toBe(true);
  });

  it("fetches several networks inside a 3 second budget and does not shrink on a 429", () => {
    expect(DEX_POOLS_PER_PAGE).toBe(20);
    expect(DEX_PAGE_CAP).toBe(10);
    expect(DEX_BACKOFF_MS).toBe(60_000);
    expect(DEX_LIQUIDITY_FLOOR_USD).toBe(10_000);
    expect(DEX_FILL_CONCURRENCY).toBeGreaterThanOrEqual(4);
    expect(DEX_FILL_CONCURRENCY).toBeLessThanOrEqual(6);
    expect(DEX_COLD_BUDGET_MS).toBeLessThanOrEqual(3_000);
    const jobs = takeDexJobs([], now, {}, DEX_FILL_CONCURRENCY);
    expect(jobs).toHaveLength(DEX_FILL_CONCURRENCY);
    expect(jobs.every((job) => job.page === 1)).toBe(true);
    expect(jobs[0]).toEqual({ network: DEX_TRENDING, page: 1 });
    expect(jobs.slice(1).map((job) => job.network)).toEqual(["trend:eth", "trend:solana", "trend:base", "trend:bsc"]);
    const previous = Array.from({ length: 40 }, (_, index) => ({
      ...dexRow(`T${index}`, 1, 10),
      address: `eth_0x${index}`,
    }));
    const incoming = [{ ...dexRow("NEW", 2, 10), address: "eth_0xnew" }];
    const kept = mergeDexLists(previous, incoming, true);
    expect(kept).toHaveLength(41);
    expect(kept.some((row) => row.address === "eth_0x0")).toBe(true);
    expect(mergeDexLists(previous, incoming, false)).toHaveLength(1);
    expect(dexResponseCacheControl(400)).toMatch(/s-maxage=/);
    expect(dexResponseCacheControl(33)).toMatch(/stale-while-revalidate=/);
    expect(dexResponseCacheControl(33)).not.toMatch(/top 400/i);
    const how = readFileSync("src/app/how-it-works/page.tsx", "utf8");
    expect(how).toContain("Tracks up to 400 coins, depending on what the data feed returns");
    expect(how).not.toContain("Tracks the top 400 coins");
    const route = readFileSync("src/app/api/crypto/dex/route.ts", "utf8");
    expect(route).toContain("dexResponseCacheControl");
  });

  it("returns a collecting list as JSON and a dead source as a plain sentence", () => {
    const filling = dexBody([], { collecting: true });
    expect(filling.ok).toBe(true);
    if (filling.ok) {
      expect(filling.data).toEqual([]);
      expect(filling.total).toBe(0);
      expect(filling.notice).toMatch(/Showing 0 of up to 400/);
    }
    const partial = dexBody([{ symbol: "SOL" }], { collecting: true });
    expect(partial.ok).toBe(true);
    if (partial.ok) expect(partial.notice).toMatch(/Showing 1 of up to 400/);
    const ready = dexBody(Array.from({ length: 400 }, (_, index) => ({ symbol: `T${index}` })), { collecting: true });
    expect(ready.ok).toBe(true);
    if (ready.ok) expect(ready.notice).toBeNull();
    expect(dexBody(null).ok).toBe(false);
  });
});
