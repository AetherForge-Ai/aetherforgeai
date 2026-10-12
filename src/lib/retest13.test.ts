import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { planBrokerImport } from "@/lib/broker-import";
import { chainForTicker, pickSnapshotCoin } from "@/lib/crypto-board";
import { coinsFromCoinPaprika } from "@/lib/crypto-keyless-seed";
import { windowReturnPct } from "@/lib/crypto-market";
import { coingeckoIdFor } from "@/lib/crypto-vendors";
import {
  chainFromPaprikaDoc,
  chartFromPaprikaHistory,
  closesFromPaprikaHistory,
  highLowFromPaprikaOhlcv,
  tickerPatchFromPaprika,
} from "@/lib/crypto-paprika";
import { coinDisplayName } from "@/lib/crypto-names";
import { formatAgeAgo } from "@/lib/entitlements";
import { beginHoldingsRequest, bumpHoldingsGeneration, holdingsRequestIsCurrent, __resetHoldingsGenerationForTests } from "@/lib/holdings-generation";
import { mergeFreshQuantities } from "@/lib/holding-snapshot";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("retest 13 and technician r6", () => {
  it("labels the hub P/L as excluding currency effect and always shows Other", () => {
    const card = read("src/components/dashboard/ReturnsSplitCard.tsx");
    const dash = read("src/components/dashboard/PortfolioDashboard.tsx");
    expect(card).toContain('label: "Other"');
    expect(card).not.toContain("resolved.otherNzd !== 0");
    expect(dash).toContain("Excludes the currency effect in the split above.");
    expect(dash).toContain("Stocks only, at today's rate");
  });

  it("derives the 1-hour figure from the same chart window as the price", () => {
    const move = windowReturnPct([
      { price: 100 },
      { price: 100.5 },
    ]);
    expect(move).toBeCloseTo(0.5, 5);
    expect(windowReturnPct([{ price: 100 }])).toBeNull();
    const view = read("src/components/dashboard/crypto/CoinDetailView.tsx");
    expect(view).toContain("hourFromChart ?? detail.change1h");
    expect(view).toContain("price: detail.price");
    const page = read("src/app/markets/crypto/[id]/page.tsx");
    expect(page).toContain("sourceLine: publicCoinSourceLine(priceSource)");
    expect(page).toContain("listed && listed.price > 0");
  });

  it("keeps MATIC and POL on different ids and matches the ticker before the id", () => {
    expect(coingeckoIdFor("MATIC")).toBe("matic-network");
    expect(coingeckoIdFor("POL")).toBe("polygon-ecosystem-token");
    expect(coingeckoIdFor("LTC")).toBe("litecoin");
    const coins = [
      { id: "polygon-ecosystem-token", symbol: "POL" },
      { id: "litecoin", symbol: "LTC" },
      { id: "matic-network", symbol: "MATIC" },
    ];
    expect(pickSnapshotCoin(coins, { symbol: "LTC", coinId: "polygon-ecosystem-token" })?.symbol).toBe("LTC");
    expect(pickSnapshotCoin(coins, { symbol: "MATIC", coinId: "polygon-ecosystem-token" })?.symbol).toBe("MATIC");
    expect(pickSnapshotCoin(coins, { coinId: "polygon-ecosystem-token" })?.symbol).toBe("POL");
    const ticker = read("src/components/MarketTicker.tsx");
    expect(ticker).toContain('cryptoCell ? "Delayed or indicative" : delay');
    expect(read("src/app/changelog/page.tsx")).toContain("13 Oct 2026 — Retest 13");
  });

  it("keeps CoinPaprika high, low, supply, atl and sparkline, and explains a blank", () => {
    const rows = coinsFromCoinPaprika([
      {
        id: "pepe-pepe",
        name: "Pepe",
        symbol: "PEPE",
        rank: 40,
        circulating_supply: 420000,
        quotes: {
          USD: {
            price: 0.00001,
            high_24h: 0.000012,
            low_24h: 0.000009,
            atl_price: 0.000001,
            atl_date: "2023-04-18T00:00:00Z",
            market_cap: 4,
            volume_24h: 1,
          },
        },
        sparkline: [0.000009, 0.00001, 0.000011],
      },
    ]);
    expect(rows[0].high24h).toBe(0.000012);
    expect(rows[0].low24h).toBe(0.000009);
    expect(rows[0].circulatingSupply).toBe(420000);
    expect(rows[0].atl).toBe(0.000001);
    expect(rows[0].atlDate).toContain("2023-04-18");
    expect(rows[0].sparkline7d).toEqual([0.000009, 0.00001, 0.000011]);
    expect(rows[0].paprikaId).toBe("pepe-pepe");
    expect(highLowFromPaprikaOhlcv([{ high: 2, low: 1 }])).toEqual({ high24h: 2, low24h: 1 });
    expect(closesFromPaprikaHistory([{ price: 3 }, { price: 4 }])).toEqual([3, 4]);
    expect(chartFromPaprikaHistory([{ timestamp: "2026-10-13T00:00:00Z", price: 5 }, { timestamp: "2026-10-13T01:00:00Z", price: 6 }]).prices).toHaveLength(2);
    expect(tickerPatchFromPaprika({ name: "Euro Coin", circulating_supply: 9, quotes: { USD: { atl_price: 0.8, atl_date: "2024-01-02T00:00:00Z" } } }).name).toBe("Euro Coin");
    expect(chainFromPaprikaDoc({ type: "token", symbol: "PEPE", platform: "eth-ethereum", contracts: [{ platform: "eth-ethereum", contract: "0xabc" }] })).toBe("Ethereum");
    expect(chainForTicker("EURC")).toBe("Ethereum");
    expect(chainForTicker("GUSD")).toBe("Ethereum");
    expect(chainForTicker("BUSD")).toBe("Ethereum");
  });

  it("shows minutes in a report age and does not invent uncertain coin names", () => {
    expect(formatAgeAgo(105 * 60 * 1000)).toBe("1h 45m ago");
    expect(formatAgeAgo(15 * 60 * 60 * 1000)).toBe("15h ago");
    expect(coinDisplayName("EURC", "EURC")).toBe("Euro Coin");
    expect(coinDisplayName("PEPE", "PEPE")).toBe("Pepe");
    expect(coinDisplayName("AUSD", "AUSD")).toBe("AUSD");
    expect(coinDisplayName("YZY", "YZY")).toBe("YZY");
    expect(coinDisplayName("EURC", "Euro Coin")).toBe("Euro Coin");
  });

  it("says deposits and withdrawals are not imported and keeps the Pepe name", () => {
    const plan = planBrokerImport("Date,Type,Ticker,Quantity,Price,Name\n2026-10-01,deposit,PEPE,1,0.00001,Pepe\n");
    expect(plan.unsupported.some((row) => /Deposits and withdrawals are not imported/.test(row.reason))).toBe(true);
    expect(plan.unsupported.some((row) => /Splits are not imported/.test(row.reason))).toBe(false);
    const preview = read("src/components/import/BrokerImportPanel.tsx");
    expect(preview).toContain("row.assetName !== row.ticker");
    expect(preview).not.toContain("row.assetName.toUpperCase() !== row.ticker");
  });

  it("ignores an older holdings response and keeps a new row", () => {
    __resetHoldingsGenerationForTests();
    const first = beginHoldingsRequest();
    const second = beginHoldingsRequest();
    expect(holdingsRequestIsCurrent(first)).toBe(false);
    expect(holdingsRequestIsCurrent(second)).toBe(true);
    bumpHoldingsGeneration();
    expect(holdingsRequestIsCurrent(second)).toBe(false);
    const rows = mergeFreshQuantities(
      [{ _id: "btc", shares: 1, purchase_price: 1 }],
      [
        { _id: "btc", shares: 1, purchase_price: 1 },
        { _id: "pepe", shares: 10, purchase_price: 0.00001 },
      ]
    );
    expect(rows.map((row) => row._id)).toEqual(["btc", "pepe"]);
  });

  it("serves a saved snapshot without waiting on a slower copy and refreshes when stale", () => {
    const snap = read("src/lib/crypto-snapshot.ts");
    expect(snap).toContain("function firstSnapshotRaw");
    expect(snap).toContain("if (snapshotHasRows(id, file)) return file");
    const store = read("src/lib/crypto-board-store.ts");
    expect(store).toContain("scheduleDetached");
    expect(store).toContain("boardNeedsRefresh(saved?.at, SNAPSHOT_REFRESH_MS)");
    expect(store).toContain("if (stored && stored.price > 0) return stored");
    expect(read("src/lib/transactions.ts")).toContain('scan: input.type !== "buy"');
    const stocks = read("src/app/api/stocks/route.ts");
    expect(stocks).toContain("needsBuyDates");
    const dash = read("src/components/dashboard/PortfolioDashboard.tsx");
    expect(dash).toContain("holdingsRequestIsCurrent");
    expect(dash).not.toContain("setLedgerLoaded(true);\n    setMetalsLoaded(true);");
  });
});
