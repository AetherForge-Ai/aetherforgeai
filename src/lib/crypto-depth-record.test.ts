/**
 * G-17: tether, a thin coin, and the fallback when a field is missing.
 * Numbers come from the fixture. Nothing is filled in by the test helper.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { canonicalCryptoId, normalizeCryptoTicker } from "@/lib/crypto-ids";
import { plausibleVolume24h, type CoinDetail, type CoinMarket } from "@/lib/crypto-market";
import {
  chooseCoinDepth,
  coinDepthViewModel,
  detailFromGeckoMarkets,
  detailFromPaprikaTicker,
  emptyCoinDetail,
  marketDepthComplete,
  pageDepthComplete,
  recallCoinDepth,
  rememberCoinDepth,
  resetCoinDepthMemory,
  retainDepthCoins,
} from "@/lib/crypto-depth-record";

const CHECKED = "2026-10-17T17:00:00Z";
const CHECKED_LABEL = "18 Oct 2026, 6:00 am";

function listed(partial: Partial<CoinMarket> & Pick<CoinMarket, "id" | "symbol" | "name">): CoinMarket {
  return {
    image: "",
    rank: partial.rank ?? 10,
    price: partial.price ?? 1,
    marketCap: partial.marketCap ?? 0,
    fdv: null,
    volume24h: partial.volume24h ?? 0,
    change1h: partial.change1h ?? null,
    change24h: partial.change24h ?? 0,
    change7d: partial.change7d ?? 0,
    high24h: null,
    low24h: null,
    circulatingSupply: partial.circulatingSupply ?? null,
    totalSupply: null,
    maxSupply: null,
    ath: null,
    athDate: null,
    atl: null,
    atlDate: null,
    sparkline7d: [],
    quotedAt: partial.quotedAt ?? CHECKED,
    source: partial.source ?? "coingecko",
    moves: partial.moves ?? null,
    ...partial,
  };
}

function fullDetail(slug: string, symbol: string, extra: Partial<CoinDetail> = {}): CoinDetail {
  return {
    ...emptyCoinDetail(slug, CHECKED),
    symbol,
    name: extra.name || symbol,
    price: 1,
    marketCap: 500_000_000,
    volume24h: 2_000_000,
    circulatingSupply: 400_000_000,
    change1h: 0.1,
    change24h: 0.2,
    change30d: -3,
    source: "coingecko",
    quotedAt: CHECKED,
    checkedAt: CHECKED,
    ...extra,
  };
}

beforeEach(() => {
  resetCoinDepthMemory();
});

describe("G-17 tether", () => {
  it("keeps the USDT identity and a full CoinGecko markets row, including a 0% hour", () => {
    expect(normalizeCryptoTicker("USDT")).toBe("USDT");
    expect(normalizeCryptoTicker("BTCUSDT")).toBe("BTC");
    expect(canonicalCryptoId("USDT")).toBe("tether");
    const detail = detailFromGeckoMarkets(
      [
        {
          id: "tether",
          symbol: "usdt",
          name: "Tether",
          current_price: 0.9998,
          market_cap: 120e9,
          total_volume: 80e9,
          circulating_supply: 120e9,
          price_change_percentage_1h_in_currency: 0,
          price_change_percentage_24h: 0.01,
          price_change_percentage_30d_in_currency: 0.04,
          last_updated: CHECKED,
        },
      ],
      "tether"
    );
    expect(detail).not.toBeNull();
    expect(pageDepthComplete(detail)).toBe(true);
    expect(detail?.change1h).toBe(0);
    expect(detail?.change30d).toBe(0.04);
    expect(detail?.marketCap).toBe(120e9);
    expect(detail?.circulatingSupply).toBe(120e9);
    expect(plausibleVolume24h(80e9, 120e9, "USDT")).toBe(80e9);
    expect(plausibleVolume24h(981.73e9, 1.68e12)).toBeNull();
    const view = coinDepthViewModel(detail, CHECKED);
    expect(view.sourceLine).toContain("CoinGecko");
    expect(view.sourceLine).toContain(CHECKED_LABEL);
    for (const field of view.fields) expect(field.missing).toBe(false);
  });

  it("reads the same figures from a CoinPaprika tether ticker", () => {
    const detail = detailFromPaprikaTicker(
      {
        id: "usdt-tether",
        symbol: "USDT",
        name: "Tether",
        last_updated: CHECKED,
        circulating_supply: 120e9,
        quotes: {
          USD: {
            price: 1,
            market_cap: 120e9,
            volume_24h: 80e9,
            percent_change_1h: 0,
            percent_change_24h: 0.01,
            percent_change_30d: 0.05,
          },
        },
      },
      "tether"
    );
    expect(detail?.id).toBe("tether");
    expect(detail?.symbol).toBe("USDT");
    expect(pageDepthComplete(detail)).toBe(true);
    expect(detail?.volume24h).toBe(80e9);
    expect(detail?.change30d).toBe(0.05);
    expect(detail?.source).toBe("coinpaprika");
  });
});

describe("G-17 thin coin", () => {
  it("keeps the last full figure-heloc record when the live print is only a price", () => {
    const full = fullDetail("figure-heloc", "FIGR", { name: "Figure Heloc", price: 1.02 });
    rememberCoinDepth(full);
    const priceOnly = fullDetail("figure-heloc", "FIGR", {
      price: 1.02,
      marketCap: null,
      volume24h: null,
      circulatingSupply: null,
      change1h: null,
      change30d: null,
      source: "dexpaprika",
    });
    rememberCoinDepth(priceOnly);
    expect(recallCoinDepth("figure-heloc")?.marketCap).toBe(500_000_000);
    const chosen = chooseCoinDepth({
      slug: "figure-heloc",
      gecko: priceOnly,
      cached: recallCoinDepth("figure-heloc"),
      checkedAt: CHECKED,
    });
    expect(pageDepthComplete(chosen)).toBe(true);
    expect(chosen.marketCap).toBe(500_000_000);
    expect(chosen.volume24h).toBe(2_000_000);
    expect(chosen.circulatingSupply).toBe(400_000_000);
    expect(chosen.change1h).toBe(0.1);
    expect(chosen.change30d).toBe(-3);
    expect(chosen.source).toBe("coingecko");
  });
});

describe("G-17 fallback", () => {
  it("labels a field the feeds did not send, and keeps a full coin the next seed omitted", () => {
    const cached = fullDetail("rain", "RAIN", { name: "Rain", change30d: null, source: "coinpaprika" });
    const chosen = chooseCoinDepth({
      slug: "rain",
      listed: null,
      cached,
      gecko: null,
      paprika: null,
      yahoo: null,
      checkedAt: CHECKED,
    });
    expect(chosen.marketCap).toBe(500_000_000);
    expect(chosen.change30d).toBeNull();
    const view = coinDepthViewModel(chosen, CHECKED);
    const month = view.fields.find((field) => field.key === "change30d");
    expect(month?.missing).toBe(true);
    expect(month?.text).toBe(`not available from source · checked ${CHECKED_LABEL}`);
    expect(view.fields.find((field) => field.key === "marketCap")?.missing).toBe(false);
    expect(view.fields.find((field) => field.key === "volume24h")?.missing).toBe(false);
    expect(view.fields.find((field) => field.key === "supply")?.missing).toBe(false);
    expect(view.fields.find((field) => field.key === "change1h")?.missing).toBe(false);

    const tether = listed({
      id: "tether",
      symbol: "USDT",
      name: "Tether",
      rank: 3,
      price: 1,
      marketCap: 120e9,
      volume24h: 80e9,
      circulatingSupply: 120e9,
      change1h: 0,
      moves: { h24: 0, d7: 0, d30: 0.04 },
    });
    expect(marketDepthComplete(tether)).toBe(true);
    const next = [
      listed({ id: "bitcoin", symbol: "BTC", name: "Bitcoin", rank: 1, price: 60000, marketCap: 1.2e12, volume24h: 20e9, circulatingSupply: 19e6, change1h: 0.2, moves: { h24: 1, d7: 2, d30: 3 } }),
    ];
    const kept = retainDepthCoins(next, [tether]);
    expect(kept.map((coin) => coin.id)).toContain("tether");
    expect(kept.find((coin) => coin.id === "tether")?.volume24h).toBe(80e9);
  });
});
