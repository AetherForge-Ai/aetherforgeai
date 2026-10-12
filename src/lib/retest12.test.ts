import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { presentMarketCoin } from "@/lib/crypto-api-body";
import { chainForTicker, chainFromPaprikaCoin } from "@/lib/crypto-board";
import { coinsFromCoinPaprika } from "@/lib/crypto-keyless-seed";
import { overlayCoinDetail, detailFromMarket, type CoinDetail } from "@/lib/crypto-market";
import { coinDisplayName } from "@/lib/crypto-names";
import { publicCoinSourceLine } from "@/lib/data-sources";
import { cryptoVenueForLabel } from "@/lib/crypto-price-chain";
import { parseHoldingsDate } from "@/lib/holdings-csv";
import { detectBroker, parseImportClock, planBrokerImport, suggestedColumnMap } from "@/lib/broker-import";
import { knownImportSymbol } from "@/lib/import-symbols";
import { splitReturns } from "@/lib/returns-split";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const blankDetail = {
  id: "bitcoin",
  symbol: "BTC",
  name: "Bitcoin",
  image: "",
  rank: 1,
  price: 100,
  marketCap: null,
  fdv: null,
  volume24h: null,
  high24h: null,
  low24h: null,
  change1h: 8.89,
  change24h: 1,
  change7d: null,
  change30d: null,
  change1y: null,
  circulatingSupply: null,
  totalSupply: null,
  maxSupply: null,
  ath: null,
  athDate: null,
  athChangePct: null,
  atl: null,
  atlDate: null,
  atlChangePct: null,
  description: "",
  categories: [],
  homepage: null,
  explorer: null,
  twitter: null,
  reddit: null,
  github: null,
} as CoinDetail;

describe("retest 12 and technician r5", () => {
  it("keeps one whole-book split whose parts add up", () => {
    const split = splitReturns(
      [
        {
          quantity: 2,
          costPrice: 10,
          markPrice: 12,
          currency: "USD",
          fxAtCost: 1.6,
          costBasisFx: 1.6,
          fxNow: 1.7,
        },
      ],
      0.38
    );
    expect(split.totalNzd).toBeCloseTo(
      split.capitalGainNzd + split.incomeNzd + split.currencyEffectNzd + split.otherNzd,
      2
    );
    const dash = read("src/components/dashboard/PortfolioDashboard.tsx");
    const uses = dash.split("split={returnSplit}").length - 1;
    expect(uses).toBe(3);
    expect(dash).toContain("loading={!balancesReady || !ledgerLoaded}");
    expect(dash).toContain("Stocks only, at today's rate");
    expect(dash).toContain("headerCash");
  });

  it("uses the list 1-hour change on the coin page", () => {
    const detail = overlayCoinDetail(blankDetail, {
      id: "bitcoin",
      symbol: "BTC",
      name: "Bitcoin",
      image: "",
      rank: 1,
      price: 100,
      marketCap: 1,
      fdv: null,
      volume24h: 1,
      change1h: -0.01,
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
    });
    expect(detail.change1h).toBe(-0.01);
  });

  it("does not name CoinGecko when the source is missing", () => {
    expect(publicCoinSourceLine("")).toBe("Source unavailable.");
    expect(publicCoinSourceLine("coinpaprika")).toContain("CoinPaprika");
    expect(publicCoinSourceLine("coingecko,coinpaprika")).toContain("CoinGecko");
    expect(publicCoinSourceLine("coingecko,coinpaprika")).toContain("CoinPaprika");
    expect(cryptoVenueForLabel("").label).toBe("Source unavailable");
    expect(cryptoVenueForLabel("CoinGecko, CoinPaprika").label).toBe("CoinGecko, CoinPaprika");
    expect(cryptoVenueForLabel("").href).toBe("");
  });

  it("derives fdv and explains figures CoinPaprika did not send", () => {
    const rows = coinsFromCoinPaprika([
      {
        id: "dai-dai",
        name: "Dai",
        symbol: "DAI",
        rank: 30,
        total_supply: 100,
        max_supply: 0,
        quotes: { USD: { price: 1, market_cap: 100, volume_24h: 5, percent_change_1h: 0, ath_price: 1.2 } },
      },
    ]);
    expect(rows[0].fdv).toBe(100);
    expect(rows[0].fdvDerived).toBe(true);
    expect(rows[0].maxSupply).toBeNull();
    expect(rows[0].circulatingSupply).toBeNull();
    const body = presentMarketCoin(rows[0]);
    expect(body.fdvReason).toMatch(/total supply/);
    expect(body.circulatingReason).toMatch(/CoinPaprika did not send circulating supply/);
    expect(body.highReason).toMatch(/24-hour high/);
    expect(body.atlReason).toMatch(/all-time low/);
    expect(body.name).toBe("Dai");
  });

  it("fills the missing chains and published names", () => {
    for (const [ticker, chain] of [
      ["SUSDS", "Ethereum"],
      ["USDE", "Ethereum"],
      ["DAI", "Ethereum"],
      ["USD1", "Ethereum"],
      ["XAUT", "Ethereum"],
      ["TAO", "Bittensor"],
      ["CRO", "Cronos"],
      ["PYUSD", "Ethereum"],
      ["OKB", "Ethereum"],
      ["RLUSD", "XRP Ledger"],
      ["PAXG", "Ethereum"],
      ["MNT", "Mantle"],
      ["WLFI", "Ethereum"],
      ["SKY", "Ethereum"],
      ["MORPHO", "Ethereum"],
      ["JITOSOL", "Solana"],
      ["BGB", "Ethereum"],
      ["FTM", "Fantom"],
      ["AGIX", "Ethereum"],
      ["WBNB", "BNB Smart Chain"],
    ] as const) {
      expect(chainForTicker(ticker)).toBe(chain);
    }
    expect(chainFromPaprikaCoin({ type: "coin", symbol: "TAO", name: "Bittensor" })).toBe("Bittensor");
    expect(chainFromPaprikaCoin({ type: "token", symbol: "DAI", platform: "zksync-zksync", contracts: [{ platform: "eth-ethereum" }] })).toBe("Ethereum");
    expect(chainFromPaprikaCoin({ type: "token", symbol: "ZZZ" })).toBe("");
    expect(coinDisplayName("WETH", "WETH")).toBe("Wrapped Ether");
    expect(coinDisplayName("DAI", "Dai")).toBe("Dai");
    expect(coinDisplayName("DYDX", "DYDX")).toBe("dYdX");
    expect(coinDisplayName("UNI", "UNI")).toBe("Uniswap");
  });

  it("serves a stored DEX list without waiting, and records a failed refresh", () => {
    const store = read("src/lib/crypto-board-store.ts");
    expect(store).toContain("DEX_REFRESH_BOUND_MS");
    expect(store).toContain("void refreshDexSeed()");
    expect(store).toContain("lastDexRefreshFailure");
    expect(read("src/lib/crypto-diagnostics.ts")).toContain("dexRefreshFailure");
  });

  it("reimports an AetherForge export, including PEPE, the clock, and the full name", () => {
    const headers = [
      "Date",
      "DateTime_NZ",
      "ExecutionStatus",
      "Type",
      "Ticker",
      "AssetName",
      "AssetType",
      "AssetId",
      "Quantity",
      "FillPrice",
      "FillCurrency",
      "PriceSource",
      "PriceAsAt",
      "MarkPriceAtExport",
      "FeesNative",
      "FeesNZD",
      "NativeNotional",
      "FxRate",
      "FxSource",
      "CashNZD",
      "RealizedPricePnlNZD",
      "RealizedFxPnlNZD",
      "RealizedPnlNZD",
      "OrderSizing",
      "Notes",
      "Venue",
      "Chain",
      "Data note",
    ];
    const detection = detectBroker(headers.map((header) => header.toLowerCase().replace(/[_-]+/g, " ")));
    expect(detection).toMatchObject({ broker: "aetherforge", confidence: "high" });
    const mapped = suggestedColumnMap(headers);
    expect(mapped.date).toBe("Date");
    expect(mapped.ticker).toBe("Ticker");
    expect(mapped.side).toBe("Type");
    expect(mapped.quantity).toBe("Quantity");
    expect(mapped.price).toBe("FillPrice");
    expect(mapped.currency).toBe("FillCurrency");
    expect(mapped.fee).toBe("FeesNative");
    expect(mapped.fx).toBe("FxRate");
    expect(parseHoldingsDate("13 Oct 2026")).toBe("2026-10-13");
    expect(parseHoldingsDate("2026-10-13")).toBe("2026-10-13");
    expect(parseHoldingsDate("13/10/2026")).toBe("2026-10-13");
    expect(parseImportClock("13 Oct 2026, 6:50 am")).toMatch(/^2026-10-12T17:50:00/);
    const csv = [
      headers.join(","),
      "13 Oct 2026,\"13 Oct 2026, 6:50 am\",filled,Buy,PEPE,PEPE,crypto,pepe,1000,0.00001234,USD,file,,0.00001,0,0,0,1.67,file,-0.02,0,0,0,units,,Crypto,Ethereum,",
      "13 Oct 2026,\"13 Oct 2026, 7:05 am\",filled,Buy,UNI,UNI,crypto,uniswap,2,8.5,USD,file,,8.5,0,0,17,1.67,file,-28.39,0,0,0,units,,Crypto,Ethereum,",
      "12 Oct 2026,\"12 Oct 2026, 6:50 am\",filled,Buy,PEPE,PEPE,crypto,pepe,500,,USD,file,,0.00001,0,0,0,1.67,file,0,0,0,0,units,,Crypto,Ethereum,",
    ].join("\n");
    const plan = planBrokerImport(csv, { fundBuys: true });
    expect(plan.broker).toBe("aetherforge");
    expect(plan.needsMapping).toBe(false);
    expect(plan.toWrite.map((row) => row.ticker)).toEqual(["PEPE", "UNI"]);
    expect(plan.toWrite[0].price).toBe(0.00001234);
    expect(plan.toWrite[0].executedAt).toMatch(/T17:50:00/);
    expect(plan.toWrite[1].assetName).toBe("Uniswap");
    expect(plan.toWrite[1].price).toBe(8.5);
    expect(plan.unsupported.map((row) => row.reason)).toContain("Price required — the file has no price for this row.");
    expect(plan.toWrite.some((row) => row.price === 0)).toBe(false);
    expect(knownImportSymbol("PEPE")).toBe(true);
    expect(read("src/app/api/import/route.ts")).not.toContain("snapshotQuotePrices");
    expect(read("src/lib/broker-import.ts")).not.toContain("quotePrices");
  });

  it("builds the server coin detail from the snapshot moves", () => {
    const detail = detailFromMarket({
      id: "pepe",
      symbol: "PEPE",
      name: "Pepe",
      image: "",
      rank: 20,
      price: 0.00001,
      marketCap: 1,
      fdv: null,
      volume24h: 1,
      change1h: -0.2,
      change24h: 1,
      change7d: 4,
      high24h: null,
      low24h: null,
      circulatingSupply: 420000,
      totalSupply: null,
      maxSupply: null,
      ath: null,
      athDate: null,
      atl: null,
      atlDate: null,
      sparkline7d: [],
    });
    expect(detail.change1h).toBe(-0.2);
    expect(detail.change7d).toBe(4);
    expect(detail.circulatingSupply).toBe(420000);
    expect(read("src/app/markets/crypto/[id]/page.tsx")).toContain("initialDetail");
    expect(read("src/lib/transactions.ts")).toContain("confirmCryptoQuote");
    expect(read("src/components/dashboard/TransactionCenter.tsx")).toContain("ledgerReadyRef");
    expect(read("src/components/dashboard/RecordTransactionPanel.tsx")).not.toContain('const ledger = await api.get("/api/transactions")');
  });
});
