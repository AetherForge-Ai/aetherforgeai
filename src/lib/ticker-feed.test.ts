import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  composeTickerTape,
  equityTapeProvider,
  tickerLiveLabel,
  type TapeRow,
} from "./ticker-feed";

/**
 * Set A matches the 30 Sep 2026 cross-check (Yahoo / CoinGecko).
 * Set B is the stale demo tape that was also labelled LIVE.
 */
const SET_A = {
  "AIR.NZ": 0.385,
  "FPH.NZ": 45.54,
  "MEL.NZ": 5.42,
  "TLX.AX": 16.15,
  BTC: 83554,
  ETH: 2690,
} as const;

const SET_B = [0.445, 40.35, 17.38, 63031, 1772.2];

const AS_OF = "2026-09-30T08:58:00.000Z";

function prices(rows: TapeRow[]): number[] {
  return rows.map((row) => row.price);
}

describe("single live ticker tape", () => {
  it("serves Set A from the live pipeline and never mixes in Set B", () => {
    const feed = composeTickerTape({
      equityQuotes: {
        "AIR.NZ": { price: SET_A["AIR.NZ"], changePct: -2.53 },
        "FPH.NZ": { price: SET_A["FPH.NZ"], changePct: 0.2 },
        "MEL.NZ": { price: SET_A["MEL.NZ"], changePct: 0 },
        "TLX.AX": { price: SET_A["TLX.AX"], changePct: 0.4 },
      },
      cryptoQuotes: {
        BTC: { price: SET_A.BTC, changePct: 0.01 },
        ETH: { price: SET_A.ETH, changePct: -0.01 },
      },
      equityProvider: "Yahoo Finance",
      cryptoProvider: "CoinGecko",
      asOf: AS_OF,
    });

    expect(feed.live).toEqual({ equities: true, crypto: true });
    expect(tickerLiveLabel(feed)).toBeNull();
    expect(
      tickerLiveLabel({
        ...feed,
        rows: {
          ...feed.rows,
          crypto: feed.rows.crypto.map((row) => ({ ...row, quotedAt: new Date().toISOString() })),
        },
      })
    ).toBe("LIVE");
    expect(tickerLiveLabel({ live: { crypto: false, equities: true } })).toBeNull();
    expect(feed.providers).toEqual({ equities: "Yahoo Finance", crypto: "CoinGecko" });
    expect(feed.asOf).toBe(AS_OF);
    expect(feed.rows.nzx.map((row) => [row.symbol, row.price])).toEqual([
      ["AIR.NZ", 0.385],
      ["FPH.NZ", 45.54],
      ["MEL.NZ", 5.42],
    ]);
    expect(feed.rows.asx.map((row) => [row.symbol, row.price])).toEqual([["TLX.AX", 16.15]]);
    expect(feed.rows.crypto.map((row) => [row.symbol, row.price])).toEqual([
      ["BTC", 83554],
      ["ETH", 2690],
    ]);
    expect(feed.rows.nzx[0]).toMatchObject({ provider: "Yahoo Finance", asOf: AS_OF, currency: "NZD" });
    expect(feed.rows.crypto[0]).toMatchObject({ provider: "CoinGecko", currency: "USD" });

    const shown = [
      ...prices(feed.rows.nzx),
      ...prices(feed.rows.asx),
      ...prices(feed.rows.crypto),
    ];
    for (const stale of SET_B) expect(shown).not.toContain(stale);
  });

  it("does not invent prices or a LIVE label when the pipeline returns nothing", () => {
    const feed = composeTickerTape({
      equityQuotes: {},
      cryptoQuotes: { BTC: { price: 0, changePct: -1 }, ETH: { price: Number.NaN, changePct: 0 } },
      equityProvider: "Yahoo Finance",
      cryptoProvider: "CoinGecko",
      asOf: AS_OF,
    });
    expect(feed.rows.nzx).toEqual([]);
    expect(feed.rows.asx).toEqual([]);
    expect(feed.rows.crypto).toEqual([]);
    expect(feed.live).toEqual({ equities: false, crypto: false });
    expect(feed.providers).toEqual({ equities: null, crypto: null });
    expect(feed.asOf).toBeNull();
    expect(tickerLiveLabel(feed)).toBeNull();
    const shown = [
      ...prices(feed.rows.nzx),
      ...prices(feed.rows.asx),
      ...prices(feed.rows.crypto),
    ];
    for (const stale of SET_B) expect(shown).not.toContain(stale);
  });

  it("names Twelve Data only when that provider key is configured", () => {
    expect(equityTapeProvider({})).toBe("Yahoo Finance");
    expect(equityTapeProvider({ MARKET_DATA_PROVIDER: "yahoo", MARKET_DATA_API_KEY: "k" })).toBe(
      "Yahoo Finance"
    );
    expect(equityTapeProvider({ MARKET_DATA_PROVIDER: "twelvedata", MARKET_DATA_API_KEY: "k" })).toBe(
      "Twelve Data"
    );
  });

  it("keeps the Set B demo prices out of the live tape sources", () => {
    const files = [
      "src/lib/ticker-feed.ts",
      "src/app/api/ticker/route.ts",
      "src/components/MarketTicker.tsx",
    ];
    const forbidden = ["0.445", "40.35", "17.38", "63031", "1772.2", "Live Markets"];
    for (const rel of files) {
      const source = readFileSync(path.join(process.cwd(), rel), "utf8");
      for (const token of forbidden) {
        expect(source, `${rel} still contains ${token}`).not.toContain(token);
      }
    }
  });
});
