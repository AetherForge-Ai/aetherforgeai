import { describe, expect, it } from "vitest";
import { parseMegafilterPage } from "@/lib/crypto-dex";
import { COIN_DETAIL_UNAVAILABLE, resolvableCoinId } from "@/lib/crypto-market";
import {
  cryptoDetailHref,
  exchangeFromTicker,
  explorerDetailHref,
  marketsTabHref,
  normalizeStockTicker,
  parseMarketsTab,
  stockBackHref,
  stockDetailHref,
  unavailableCryptoHref,
  unavailableTokenLabel,
} from "@/lib/market-detail-routes";

describe("markets detail routes", () => {
  it("accepts a CoinGecko slug and rejects a pool address", () => {
    expect(resolvableCoinId("bitcoin")).toBe("bitcoin");
    expect(resolvableCoinId("Jupiter-Exchange-Solana")).toBe("jupiter-exchange-solana");
    expect(resolvableCoinId("eth_0xabc")).toBeNull();
    expect(resolvableCoinId("0xabc")).toBeNull();
    expect(resolvableCoinId("")).toBeNull();
  });

  it("builds a stable crypto URL and an unavailable page when the id cannot be loaded", () => {
    expect(cryptoDetailHref("bitcoin")).toBe("/markets/crypto/bitcoin");
    expect(cryptoDetailHref("bitcoin", { buy: true })).toBe("/markets/crypto/bitcoin?buy=1");
    expect(cryptoDetailHref("eth_0xabc")).toBe("/markets/crypto/unavailable");
    expect(unavailableCryptoHref({ symbol: "BULL", name: "BULL" })).toBe(
      "/markets/crypto/unavailable?symbol=BULL&name=BULL"
    );
    expect(COIN_DETAIL_UNAVAILABLE).toBe("Live detail for this token is unavailable.");
    expect(COIN_DETAIL_UNAVAILABLE).not.toMatch(/<!DOCTYPE|Unexpected token|0\.00/);
  });

  it("uses the stock API ticker, and the suffix decides NZX and ASX", () => {
    expect(normalizeStockTicker("fph.nz")).toBe("FPH.NZ");
    expect(normalizeStockTicker("../etc")).toBeNull();
    expect(stockDetailHref("FPH.NZ")).toBe("/markets/stock/FPH.NZ?exchange=NZX");
    expect(stockDetailHref("BHP.AX", { buy: true })).toBe("/markets/stock/BHP.AX?exchange=ASX&buy=1");
    expect(stockDetailHref("AAPL", { exchange: "NASDAQ" })).toBe("/markets/stock/AAPL?exchange=NASDAQ");
    expect(stockDetailHref("AAPL", { exchange: "DOW", buy: true })).toBe(
      "/markets/stock/AAPL?exchange=DOW&buy=1"
    );
    expect(exchangeFromTicker("FPH.NZ")).toBe("NZX");
    expect(exchangeFromTicker("AAPL")).toBeNull();
    expect(stockBackHref("FPH.NZ")).toEqual({ href: "/markets?tab=nzx", label: "Markets · NZX" });
    expect(stockBackHref("AAPL", "DOW")).toEqual({ href: "/markets?tab=dow", label: "Markets · Dow Jones" });
    expect(stockBackHref("AAPL")).toEqual({ href: "/markets", label: "Markets · Stocks" });
  });

  it("sends explorer clicks to a page, including a DEX row with no slug", () => {
    expect(explorerDetailHref({ coinId: "bitcoin", ticker: "BTC", symbol: "BTC" }, { asset: "crypto" })).toBe(
      "/markets/crypto/bitcoin"
    );
    expect(
      explorerDetailHref(
        { coinId: "eth_0xabc", ticker: "BULL", symbol: "BULL", name: "BULL" },
        { asset: "crypto", buy: true }
      )
    ).toBe("/markets/crypto/unavailable?symbol=BULL&name=BULL");
    expect(
      explorerDetailHref(
        { ticker: "FPH.NZ", symbol: "FPH", exchange: "NZX" },
        { asset: "stock", buy: true }
      )
    ).toBe("/markets/stock/FPH.NZ?exchange=NZX&buy=1");
    expect(explorerDetailHref({ ticker: "AAPL", symbol: "AAPL" }, { fallbackExchange: "NASDAQ" })).toBe(
      "/markets/stock/AAPL?exchange=NASDAQ"
    );
  });

  it("reads the markets tab the back link writes", () => {
    expect(marketsTabHref("CRYPTO")).toBe("/markets?tab=crypto");
    expect(parseMarketsTab("crypto")).toBe("CRYPTO");
    expect(parseMarketsTab("nasdaq")).toBe("NASDAQ");
    expect(parseMarketsTab("nope")).toBeNull();
    expect(unavailableTokenLabel("BULL", "BULL")).toBe("BULL");
    expect(unavailableTokenLabel("JUP", "Jupiter")).toBe("Jupiter (JUP)");
  });

  it("keeps a CoinGecko slug on a DEX row and leaves a pool address unresolved", () => {
    const rows = parseMegafilterPage(
      {
        data: [
          {
            id: "sol_pool",
            attributes: { base_token_price_usd: "1.2", volume_usd: { h24: "50" } },
            relationships: { base_token: { data: { id: "solana_jup" } } },
          },
        ],
        included: [
          {
            id: "solana_jup",
            type: "token",
            attributes: { symbol: "jup", name: "Jupiter", coingecko_coin_id: "jupiter-exchange-solana" },
          },
        ],
      },
      "solana"
    );
    expect(rows[0]?.id).toBe("jupiter-exchange-solana");
    expect(rows[0]?.detailId).toBe("jupiter-exchange-solana");
    expect(cryptoDetailHref(rows[0]?.detailId || "")).toBe("/markets/crypto/jupiter-exchange-solana");
  });
});
