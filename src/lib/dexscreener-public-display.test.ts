import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { sourceLabel } from "@/lib/crypto-price-chain";
import { fetchDexScreenerRows, GECKOTERMINAL_ACCEPT } from "@/lib/crypto-coingecko";
import { dexEmptyNotice, dexListNotice, parseMegafilterPage, resolveDexList } from "@/lib/crypto-dex";
import { dexPoweredByLine, dexscreenerPublicDisplay } from "@/lib/dexscreener-display";
import { publicCoinSourceLine, publicDataSourcesLine } from "@/lib/data-sources";
import { PROCESSORS } from "@/lib/public-copy";

describe("DEXSCREENER_PUBLIC_DISPLAY", () => {
  afterEach(() => {
    delete process.env.DEXSCREENER_PUBLIC_DISPLAY;
    vi.restoreAllMocks();
  });

  it("keeps DexScreener out of public responses and does not fetch while the flag is off", async () => {
    delete process.env.DEXSCREENER_PUBLIC_DISPLAY;
    expect(dexscreenerPublicDisplay()).toBe(false);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const rows = await fetchDexScreenerRows();
    expect(rows).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();

    const saved = resolveDexList({
      poolRows: [],
      screenerRows: [
        {
          id: "scr",
          symbol: "SCR",
          name: "Screener",
          price: 2,
          priceUnavailable: false,
          volume24h: 10,
          network: "Solana",
          dex: "raydium",
          detailId: null,
          reserveUsd: 50_000,
        },
      ],
      lastGood: [
        {
          id: "pool",
          symbol: "POOL",
          name: "Pool",
          price: 1,
          priceUnavailable: false,
          volume24h: 10,
          network: "Ethereum",
          dex: "uniswap",
          detailId: null,
          reserveUsd: null,
        },
      ],
    });
    expect(saved.kind).toBe("snapshot");
    expect(saved.rows.map((row) => row.symbol)).toEqual(["POOL"]);

    const payload = {
      sources: publicDataSourcesLine(),
      processors: PROCESSORS().map((processor) => `${processor.name} ${processor.role}`),
      label: sourceLabel("dexscreener"),
      coinLine: publicCoinSourceLine("dexscreener"),
      notice: dexListNotice(0),
      screenerNotice: dexListNotice(3, false, "screener"),
      credit: dexPoweredByLine(),
      meta: "DEX tokens by 24-hour volume from GeckoTerminal, with chain and DEX.",
    };
    expect(JSON.stringify(payload).toLowerCase()).not.toContain("dexscreener");
    expect(readFileSync("src/components/dashboard/MarketsExplorer.tsx", "utf8").toLowerCase()).not.toContain("dexscreener");
    expect(readFileSync("src/app/markets/page.tsx", "utf8")).toContain("dexscreenerPublicDisplay()");
    expect(GECKOTERMINAL_ACCEPT).toBe("application/json;version=20230302");
    expect(payload.notice).toMatch(/Showing 0 of up to 400/);
    expect(payload.notice).toContain("GeckoTerminal");
    expect(saved.rows).toHaveLength(1);
  });

  it("names DexScreener and fetches pairs only after the flag is turned on", async () => {
    process.env.DEXSCREENER_PUBLIC_DISPLAY = "on";
    expect(dexscreenerPublicDisplay()).toBe(true);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify({
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
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    const rows = await fetchDexScreenerRows();
    expect(fetchSpy).toHaveBeenCalled();
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain("api.dexscreener.com");
    expect(rows.some((row) => row.symbol === "SCR")).toBe(true);
    expect(publicDataSourcesLine()).toMatch(/DexScreener/);
    expect(PROCESSORS().some((processor) => processor.name === "DexScreener")).toBe(true);
    expect(sourceLabel("dexscreener")).toBe("DexScreener");
    expect(publicCoinSourceLine("dexscreener")).toMatch(/DexScreener/);
    expect(dexPoweredByLine()).toMatch(/DexScreener/);
    expect(dexEmptyNotice()).toMatch(/DexScreener/);
    expect(dexListNotice(2, false, "screener")).toMatch(/DexScreener list/);
  });

  it("keeps a priced pool when the included token list is missing", () => {
    const rows = parseMegafilterPage({
      data: [
        {
          id: "eth_pool",
          attributes: {
            name: "WIDGET / WETH",
            base_token_price_usd: "1.5",
            reserve_in_usd: "20000",
            volume_usd: { h24: "4000" },
          },
          relationships: { base_token: { data: { id: "eth_0xabc" } } },
        },
      ],
    });
    expect(rows.map((row) => row.symbol)).toEqual(["WIDGET"]);
    expect(rows[0]?.price).toBe(1.5);
    expect(rows[0]?.reserveUsd).toBe(20_000);
  });
});
