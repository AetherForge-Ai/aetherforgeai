import { describe, expect, it } from "vitest";
import { clientFacingError, parseApiBody } from "@/lib/api-json";
import { dexBody, marketsBody } from "@/lib/crypto-api-body";
import {
  DEX_FURTHER_NOTICE,
  DEX_STALE_MS,
  dedupeDexTokens,
  dexCallWaitMs,
  dexListNotice,
  dexNetworkLabel,
  freshDexRows,
  nextDexTarget,
  parseMegafilterPage,
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

  it("keeps the notice only while a partial fresh list is under 400", () => {
    expect(dexListNotice(0)).toBeNull();
    expect(dexListNotice(1)).toBe(DEX_FURTHER_NOTICE);
    expect(dexListNotice(399)).toBe(DEX_FURTHER_NOTICE);
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
    expect(nextDexTarget(pages, now)).toEqual({ network: "solana", page: 1 });
    const stale = [stored("eth", 1, now - DEX_STALE_MS - 1, [dexRow("OLD", 9)])];
    expect(nextDexTarget(stale, now)).toEqual({ network: "eth", page: 1 });
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

  it("returns a collecting list as JSON and a dead source as a plain sentence", () => {
    const filling = dexBody([], { collecting: true });
    expect(filling).toEqual({
      ok: true,
      data: [],
      total: 0,
      notice: null,
    });
    const partial = dexBody([{ symbol: "SOL" }], { collecting: true });
    expect(partial.ok).toBe(true);
    if (partial.ok) expect(partial.notice).toBe("Further rows are unavailable.");
    const ready = dexBody(Array.from({ length: 400 }, (_, index) => ({ symbol: `T${index}` })), { collecting: true });
    expect(ready.ok).toBe(true);
    if (ready.ok) expect(ready.notice).toBeNull();
    expect(dexBody(null).ok).toBe(false);
  });
});
