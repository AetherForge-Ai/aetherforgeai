import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { GET as unsubscribeGet } from "@/app/unsubscribe/route";
import { marketsBody, presentMarketCoin } from "@/lib/crypto-api-body";
import { coinGeckoRetryDelayMs, coinGeckoStatusRetries, readMarketPage } from "@/lib/crypto-fetch-policy";
import {
  DEX_EMPTY_NOTICE,
  dexListNotice,
  dexRowClearsFloor,
  mergeDexLists,
  parseDexScreenerPairs,
  parseMegafilterPage,
  resolveDexList,
  type DexTokenRow,
} from "@/lib/crypto-dex";
import { selectListedMarkets } from "@/lib/crypto-list";
import type { CoinMarket } from "@/lib/crypto-market";
import { cryptoDetailCopy, cryptoDetailJsonLd, vendorByCoingeckoId } from "@/lib/crypto-public-meta";
import { publicDataSourcesLine } from "@/lib/data-sources";
import { documentAccess } from "@/lib/route-gate";
import { PUBLIC_SEED_ROWS } from "@/lib/public-market-types";
import { signWeeklyEmailToken } from "@/lib/weekly-email";

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

function dex(symbol: string, price: number | null, reserveUsd: number | null): DexTokenRow {
  return {
    id: symbol.toLowerCase(),
    symbol,
    name: symbol,
    price,
    priceUnavailable: !(price != null && price > 0),
    volume24h: price != null && price > 0 ? 1_000 : null,
    network: "Ethereum",
    dex: "uniswap",
    detailId: null,
    reserveUsd,
    address: `eth_0x${symbol.toLowerCase()}`,
  };
}

describe("pull-check:retest4-2026-10-11", () => {
  afterEach(() => {
    delete process.env.DEXSCREENER_PUBLIC_DISPLAY;
  });

  it("keeps the marker in the sources and the QA note", () => {
    const qa = read("qa/PULL-CHECK-2026-10-10.md");
    expect(qa).toContain("pull-check:retest4-2026-10-11");
    for (const file of [
      "src/lib/crypto-dex.ts",
      "src/lib/crypto-fetch-policy.ts",
      "src/lib/crypto-list.ts",
      "src/lib/crypto-public-meta.ts",
      "src/lib/stock-markets.ts",
      "src/app/api/market-snapshot/route.ts",
      "src/app/unsubscribe/route.ts",
    ]) {
      expect(read(file)).toContain("pull-check:retest4-2026-10-11");
    }
    expect(read("docs/stock-market-sources-2026-10-11.md")).toContain("5,622");
    expect(read("docs/stock-market-sources-2026-10-11.md")).toContain("2,900");
    expect(read("src/lib/stock-markets.ts")).not.toContain("directory file counted");
  });

  it("builds a DEX list from pool and pair payloads, then the last saved rows", () => {
    const pools = parseMegafilterPage(
      {
        data: [
          {
            id: "eth_pool",
            attributes: { base_token_price_usd: "1.25", volume_usd: { h24: "8000" } },
            relationships: { base_token: { data: { id: "eth_0xabc" } } },
          },
        ],
        included: [{ id: "eth_0xabc", type: "token", attributes: { symbol: "POOL", name: "Pool Token" } }],
      },
      "eth"
    );
    expect(pools[0]?.price).toBe(1.25);
    expect(pools[0]?.reserveUsd).toBeNull();
    expect(dexRowClearsFloor(pools[0])).toBe(true);
    expect(dexRowClearsFloor({ ...pools[0], reserveUsd: 100 })).toBe(false);

    const fromPools = resolveDexList({ poolRows: pools, screenerRows: [], lastGood: [] });
    expect(fromPools.kind).toBe("pools");
    expect(fromPools.rows.map((row) => row.symbol)).toEqual(["POOL"]);

    const pairs = parseDexScreenerPairs({
      pairs: [
        {
          chainId: "solana",
          dexId: "raydium",
          priceUsd: "2.5",
          volume: { h24: 9000 },
          liquidity: { usd: 50_000 },
          baseToken: { symbol: "SCR", name: "Screener", address: "So111" },
        },
      ],
    });
    expect(pairs[0]?.price).toBe(2.5);
    expect(pairs[0]?.network).toBe("Solana");
    delete process.env.DEXSCREENER_PUBLIC_DISPLAY;
    const hidden = resolveDexList({ poolRows: [], screenerRows: pairs, lastGood: [] });
    expect(hidden.kind).toBe("empty");
    expect(dexListNotice(0).toLowerCase()).not.toContain("dexscreener");
    process.env.DEXSCREENER_PUBLIC_DISPLAY = "on";
    const fromScreener = resolveDexList({ poolRows: [], screenerRows: pairs, lastGood: [] });
    expect(fromScreener.kind).toBe("screener");
    expect(dexListNotice(fromScreener.rows.length, false, fromScreener.kind)).toContain("DexScreener list");
    delete process.env.DEXSCREENER_PUBLIC_DISPLAY;

    const saved = [dex("SAVED", 3, 20_000)];
    const fromSaved = resolveDexList({ poolRows: [], screenerRows: [], lastGood: saved });
    expect(fromSaved.kind).toBe("snapshot");
    expect(fromSaved.rows).toHaveLength(1);
    expect(dexListNotice(1, false, "snapshot")).toContain("Last saved DEX list");

    const none = resolveDexList({ poolRows: [], screenerRows: [], lastGood: [] });
    expect(none).toEqual({ rows: [], kind: "empty" });
    expect(dexListNotice(0)).toBe(DEX_EMPTY_NOTICE);
    expect(DEX_EMPTY_NOTICE).toMatch(/Showing 0 of up to 400/);
    expect(DEX_EMPTY_NOTICE).not.toMatch(/fallback|unavailable|official|licensed|real-time/i);

    const previous = [dex("KEEP", 4, 20_000)];
    expect(mergeDexLists(previous, [], false).map((row) => row.symbol)).toEqual(["KEEP"]);
  });

  it("does not let a short Yahoo list replace CoinGecko, and hides a zero market cap", () => {
    const gecko = [coin({ symbol: "BTC", id: "bitcoin", price: 100_000, marketCap: 2_000_000_000_000, rank: 1, volume24h: 30_000_000_000 })];
    const yahoo = Array.from({ length: 89 }, (_, index) =>
      coin({ symbol: `Y${index}`, price: index + 1, marketCap: 0, volume24h: 0, rank: 500 + index })
    );
    const kept = selectListedMarkets({ coingecko: gecko, page2Missing: true, backup: [], yahoo });
    expect(kept.coins).toHaveLength(1);
    expect(kept.coins[0]?.id).toBe("bitcoin");
    expect(kept.reason).toBe("page2");

    const full = selectListedMarkets({
      coingecko: Array.from({ length: 400 }, (_, index) => coin({ symbol: `C${index}`, price: 1, rank: index + 1 })),
      page2Missing: false,
      backup: yahoo,
      yahoo,
    });
    expect(full.coins).toHaveLength(400);
    expect(full.reason).toBeNull();
    expect(full.coins.some((row) => row.symbol.startsWith("Y"))).toBe(false);

    expect(readMarketPage({ status: { error_code: 429 } })).toBeNull();
    expect(readMarketPage([])).toEqual([]);
    expect(coinGeckoRetryDelayMs(0)).toBe(0);
    expect(coinGeckoRetryDelayMs(1)).toBe(400);
    expect(coinGeckoRetryDelayMs(2)).toBe(800);
    expect(coinGeckoStatusRetries(429)).toBe(true);
    expect(coinGeckoStatusRetries(200)).toBe(false);

    const body = marketsBody([coin({ symbol: "BTC", price: 1, marketCap: 0, volume24h: 0 })], null);
    expect(body.ok).toBe(true);
    if (body.ok) {
      const row = body.data[0] as { marketCap: number | null; volume24h: number | null };
      expect(row.marketCap).toBeNull();
      expect(row.volume24h).toBeNull();
    }
    expect(presentMarketCoin({ marketCap: 12, volume24h: 0 })).toEqual({ marketCap: 12, volume24h: null });

    const source = read("src/lib/crypto-source.ts");
    expect(source).toContain("LIST_COLD_MS = 3_000");
    expect(source).not.toMatch(/from ["']@\/lib\/crypto-(kraken|coinbase)/);
    expect(source).toContain("They do not replace this list");
    expect(source).toContain("SWYFTX_PUBLIC_DISPLAY");
    expect(publicDataSourcesLine().toLowerCase()).not.toContain("dexscreener");
    expect(publicDataSourcesLine()).toContain("GeckoTerminal");
    expect(publicDataSourcesLine()).not.toMatch(/fallback|unavailable|official|licensed|real-time/i);
    expect(PUBLIC_SEED_ROWS).toBe(12);
  });

  it("writes a unique coin title and a valid WebPage document", () => {
    expect(vendorByCoingeckoId("bitcoin")?.ticker).toBe("BTC");
    expect(vendorByCoingeckoId("not-a-real-slug")).toBeNull();
    const btc = cryptoDetailCopy({
      slug: "bitcoin",
      name: "Bitcoin",
      symbol: "BTC",
      priceUsd: 100_000,
      priceNzd: 168_000,
      nzdSourced: true,
      asOf: "2026-10-10T21:00:00.000Z",
      source: "coingecko",
      marketCapUsd: 2_000_000_000_000,
    });
    const eth = cryptoDetailCopy({
      slug: "ethereum",
      name: "Ethereum",
      symbol: "ETH",
      priceUsd: 4_000,
      priceNzd: 6_720,
      nzdSourced: true,
      asOf: "2026-10-10T21:00:00.000Z",
      source: "coingecko",
      marketCapUsd: 400_000_000_000,
    });
    expect(btc.title).toBe("Bitcoin (BTC) price in NZD");
    expect(eth.title).toBe("Ethereum (ETH) price in NZD");
    expect(btc.description).not.toBe(eth.description);
    expect(btc.description).toContain("Bitcoin (BTC)");
    expect(btc.description).toContain("CoinGecko");
    expect(btc.description).toContain("as of");
    expect(btc.description).toContain("Market cap");
    expect(btc.description).not.toMatch(/fallback|unavailable|official|licensed|real-time/i);

    const usdOnly = cryptoDetailCopy({
      slug: "bitcoin",
      name: "Bitcoin",
      symbol: "BTC",
      priceUsd: 100_000,
      priceNzd: 168_000,
      nzdSourced: false,
      asOf: null,
      source: "coingecko",
      marketCapUsd: 0,
    });
    expect(usdOnly.title).toBe("Bitcoin (BTC) price in USD");
    expect(usdOnly.description).toContain("as of not stated by the vendor");
    expect(usdOnly.description).not.toContain("in NZD");
    expect(usdOnly.description).not.toContain("Market cap");

    const unknown = cryptoDetailCopy({ slug: "some-new-coin", priceUsd: null });
    expect(unknown.title).not.toContain("Bitcoin");
    expect(unknown.description).toContain("No earlier price is stored for this coin.");

    const json = JSON.parse(cryptoDetailJsonLd({ title: btc.title, description: btc.description, url: "https://www.aetherforgeai.co.nz/markets/crypto/bitcoin" }));
    expect(json["@context"]).toBe("https://schema.org");
    expect(json["@type"]).toBe("WebPage");
    expect(json.name).toBe(btc.title);
    expect(json.description).toBe(btc.description);
  });

  it("serves /unsubscribe as a confirm page and does not opt out on GET", async () => {
    expect(documentAccess("/unsubscribe")).toBe("public");
    const route = read("src/app/unsubscribe/route.ts");
    expect(route).toContain("export async function GET");
    expect(route).not.toContain("export async function POST");
    expect(route).not.toContain("optOutWeeklyEmail");
    process.env.WEEKLY_EMAIL_UNSUBSCRIBE_SECRET = "retest4-secret";
    const token = await signWeeklyEmailToken("user-retest4", "retest4-secret", Date.now());
    const res = await unsubscribeGet(
      new Request(`https://www.aetherforgeai.co.nz/unsubscribe?token=${encodeURIComponent(token)}`)
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Stop the weekly email?");
    expect(html).toContain('action="/api/weekly-email/unsubscribe"');
    expect(html).not.toContain("Weekly email is off for this account.");
    delete process.env.WEEKLY_EMAIL_UNSUBSCRIBE_SECRET;
  });
});
