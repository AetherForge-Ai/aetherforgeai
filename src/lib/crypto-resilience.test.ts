import { describe, expect, it } from "vitest";
import { clientFacingError, parseApiBody } from "@/lib/api-json";
import { dexBody, marketsBody } from "@/lib/crypto-api-body";
import { dedupeDexTokens, dexNetworkLabel, parseMegafilterPage } from "@/lib/crypto-dex";
import { LIVE_CRYPTO_UNAVAILABLE, rankedFallbackPage, type CoinMarket } from "@/lib/crypto-market";

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
    const dex = dexBody(null, null);
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
  it("keeps a live print, drops a missing one, and labels the chain Unavailable", () => {
    const page = rankedFallbackPage([
      coin({ symbol: "BTC", price: 86000, rank: 1 }),
      coin({ symbol: "ZERO", price: 0, rank: 2, priceUnavailable: true }),
      coin({ symbol: "ETH", price: 2000, rank: 3, blockchain: "Native" }),
    ]);
    expect(page.coins.map((row) => row.symbol)).toEqual(["BTC", "ETH"]);
    expect(page.coins[0].price).toBe(86000);
    expect(page.coins[0].blockchain).toBe("Unavailable");
    expect(page.coins[1].blockchain).toBe("Native");
    expect(page.coins.some((row) => row.price === 0)).toBe(false);
    expect(page.notice).toBe("Further rows are unavailable.");
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
    expect(missing?.price).toBeNull();
    expect(missing?.priceUnavailable).toBe(true);
    expect(dexNetworkLabel("")).toBe("Unavailable");
    expect(dexNetworkLabel("solana")).toBe("Solana");
  });
});
