import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { presentMarketCoin } from "@/lib/crypto-api-body";
import { presentListedCoin, SNAPSHOT_REFRESH_MS } from "@/lib/crypto-board";
import { cashFromLedgerRows } from "@/lib/ledger-cash-lines";
import { coinsFromCoinGeckoMarkets, coinsFromCoinPaprika } from "@/lib/crypto-keyless-seed";
import {
  applyStatDonors,
  overlayCoinDetail,
  positiveMarketStat,
  type CoinMarket,
} from "@/lib/crypto-market";
import { planBrokerImport, readImportPreview, withMarketSuffix } from "@/lib/broker-import";
import { splitReturns } from "@/lib/returns-split";
import { composeTickerTape, snapshotTapeChange } from "@/lib/ticker-feed";
import { memberUnderReviewLines, stoxReviewCopy } from "@/lib/report-copy";

function read(rel: string) {
  return readFileSync(rel, "utf8");
}

function coin(partial: Partial<CoinMarket> & Pick<CoinMarket, "symbol" | "price">): CoinMarket {
  return {
    id: partial.id || partial.symbol.toLowerCase(),
    symbol: partial.symbol,
    price: partial.price,
    name: partial.name || partial.symbol,
    image: "",
    rank: partial.rank ?? 1,
    marketCap: partial.marketCap ?? 0,
    fdv: partial.fdv ?? null,
    volume24h: partial.volume24h ?? 0,
    change1h: partial.change1h ?? null,
    change24h: partial.change24h ?? 0,
    change7d: partial.change7d ?? 0,
    high24h: partial.high24h ?? null,
    low24h: partial.low24h ?? null,
    circulatingSupply: partial.circulatingSupply ?? null,
    totalSupply: partial.totalSupply ?? null,
    maxSupply: partial.maxSupply ?? null,
    ath: partial.ath ?? null,
    athDate: partial.athDate ?? null,
    atl: null,
    atlDate: null,
    sparkline7d: [],
    source: partial.source,
    moves: partial.moves ?? null,
    quotedAt: partial.quotedAt ?? null,
  };
}

describe("pull-check:v3-retest9-2026-10-12", () => {
  it("records the marker and the build", () => {
    expect(read("qa/PULL-CHECK-2026-10-12.md")).toContain("pull-check:v3-retest9-2026-10-12");
    expect(read("src/lib/public-copy.ts")).toContain("pull-check:v3-retest9-2026-10-12");
    expect(read("public/build-version.txt").trim()).toBe("v3-goal-b14-2026-10-18");
    expect(read("src/lib/changelog-entries.ts")).toContain("12 Oct 2026 — Shared prices, coin pages and cash");
    expect(read("src/lib/changelog-entries.ts")).not.toMatch(/GPT|Claude|Gemini|OpenAI|Anthropic/);
  });

  it("removes the freephone and leaves the Privacy Commissioner number", () => {
    for (const rel of [
      "src/lib/public-copy.ts",
      "src/components/SiteFooter.tsx",
      "src/app/terms-of-service/page.tsx",
      "src/components/about/AboutContent.tsx",
      "src/app/layout.tsx",
    ]) {
      expect(read(rel), rel).not.toContain("0800 238 437");
      expect(read(rel), rel).not.toContain("0800238437");
    }
    expect(read("src/app/privacy-policy/page.tsx")).toContain("0800 803 909");
    expect(read("src/app/layout.tsx")).not.toContain("telephone");
  });

  it("keeps a crypto tape row from the snapshot when the 24h move is only change24h", () => {
    expect(snapshotTapeChange({ moves: null, change24h: 1.25 })).toBe(1.25);
    expect(snapshotTapeChange({ moves: { h24: -0.5 }, change24h: 9 })).toBe(-0.5);
    const feed = composeTickerTape({
      equityQuotes: {},
      cryptoQuotes: { BTC: { price: 100, quotedAt: "2026-10-12T00:00:00.000Z" } },
      equityProvider: "Yahoo Finance",
      cryptoProvider: "CoinGecko",
      asOf: "2026-10-12T00:00:00.000Z",
    });
    expect(feed.rows.crypto.map((row) => row.symbol)).toEqual(["BTC"]);
    expect(feed.rows.crypto[0].price).toBe(100);
    expect(feed.rows.crypto[0].change).toBeNull();
    expect(feed.rows.crypto[0].quotedAt).toBe("2026-10-12T00:00:00.000Z");
  });

  it("fills empty size fields from CoinGecko and CoinPaprika and never emits 0", () => {
    const gecko = coinsFromCoinGeckoMarkets([
      {
        id: "bitcoin",
        symbol: "btc",
        name: "Bitcoin",
        current_price: 100,
        market_cap: 2_000,
        fully_diluted_valuation: 2_100,
        total_volume: 50,
        price_change_percentage_1h_in_currency: 0.4,
        price_change_percentage_24h: 1,
        price_change_percentage_7d_in_currency: 3,
        price_change_percentage_30d_in_currency: 4,
        high_24h: 110,
        low_24h: 90,
        circulating_supply: 19,
        total_supply: 21,
        max_supply: 21,
        ath: 120,
        ath_date: "2026-01-01T00:00:00.000Z",
      },
    ]);
    expect(gecko[0]).toMatchObject({
      marketCap: 2_000,
      fdv: 2_100,
      volume24h: 50,
      change1h: 0.4,
      high24h: 110,
      low24h: 90,
      circulatingSupply: 19,
      maxSupply: 21,
      ath: 120,
    });
    const paprika = coinsFromCoinPaprika([
      {
        id: "eth-ethereum",
        symbol: "ETH",
        name: "Ethereum",
        rank: 2,
        circulating_supply: 120,
        total_supply: 120,
        max_supply: 0,
        quotes: {
          USD: {
            price: 10,
            market_cap: 500,
            volume_24h: 20,
            percent_change_1h: 0,
            percent_change_24h: 1,
            percent_change_7d: 2,
            percent_change_30d: -3,
            ath_price: 40,
            ath_date: "2025-12-01T00:00:00.000Z",
          },
        },
      },
    ]);
    expect(paprika[0].circulatingSupply).toBe(120);
    expect(paprika[0].ath).toBe(40);
    expect(paprika[0].change1h).toBe(0);
    expect(paprika[0].moves).toMatchObject({ h24: 1, d7: 2, d30: -3 });
    expect(positiveMarketStat(paprika[0].maxSupply)).toBeNull();

    const filled = applyStatDonors(
      [coin({ symbol: "BTC", price: 100, source: "yahoo", marketCap: 0, volume24h: 0, change7d: 0 })],
      gecko
    );
    expect(filled[0].price).toBe(100);
    expect(filled[0].marketCap).toBe(2_000);
    expect(filled[0].fdv).toBe(2_100);
    expect(filled[0].volume24h).toBe(50);
    expect(filled[0].change1h).toBe(0.4);
    expect(filled[0].high24h).toBe(110);
    expect(filled[0].low24h).toBe(90);
    expect(filled[0].maxSupply).toBe(21);
    expect(filled[0].ath).toBe(120);
    expect(filled[0].change7d).toBe(3);

    const body = presentMarketCoin(filled[0]);
    expect(body.marketCap).toBe(2_000);
    expect(body.ath).toBe(120);
    const empty = presentMarketCoin(coin({ symbol: "ZZZ", price: 1, marketCap: 0, volume24h: 0, fdv: 0, high24h: 0, ath: 0 }));
    expect(empty.marketCap).toBeNull();
    expect(empty.volume24h).toBeNull();
    expect(empty.fdv).toBeNull();
    expect(empty.high24h).toBeNull();
    expect(empty.ath).toBeNull();
    expect(empty.change24h).toBe(0);
  });

  it("overlays snapshot 7d and max supply onto a detail that left them blank", () => {
    const detail = overlayCoinDetail(
      {
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
        change1h: null,
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
      },
      coin({
        symbol: "BTC",
        price: 100,
        id: "bitcoin",
        maxSupply: 21_000_000,
        change7d: 3.5,
        change1h: 0.2,
        moves: { h24: 1, d7: 3.5, d30: -2 },
      })
    );
    expect(detail.maxSupply).toBe(21_000_000);
    expect(detail.change1h).toBe(0.2);
    expect(detail.change7d).toBe(3.5);
    expect(detail.change30d).toBe(-2);
    expect(read("src/components/dashboard/crypto/CoinDetailView.tsx")).not.toContain("Not available");
    expect(read("src/lib/crypto-source.ts")).toContain("overlayCoinDetail");
  });

  it("recognises Sharesies headers with a BOM, quotes, case, spaces and an order id", () => {
    const classic = [
      "Trade date,Instrument code,Market code,Quantity,Price,Transaction type,Currency,Amount,Transaction fee",
      "12/10/2026,AIR,NZX,10,1.50,Buy,NZD,15.00,0.50",
    ].join("\n");
    const plan = planBrokerImport(classic, { fundBuys: true });
    expect(plan.broker).toBe("sharesies");
    expect(plan.needsMapping).toBe(false);
    expect(plan.toWrite[0]).toMatchObject({ ticker: "AIR.NZ", quantity: 10, price: 1.5, fee: 0.5, currency: "NZD" });
    expect(withMarketSuffix("AIR.NZ", "NZX")).toBe("AIR.NZ");

    const messy = `\uFEFF"TRADE  DATE","INSTRUMENT   CODE","MARKET CODE","QUANTITY","PRICE","TRANSACTION TYPE","CURRENCY","AMOUNT","TRANSACTION FEE"\n"12/10/2026","FPH","ASX","2","20.00","Buy","AUD","40.00","0"`;
    const messyPlan = planBrokerImport(messy, { fundBuys: true, reviewedRates: { "AUD|2026-10-12": 1.1 } });
    expect(messyPlan.broker).toBe("sharesies");
    expect(messyPlan.toWrite[0]?.ticker).toBe("FPH.AX");

    const orderOnly = "Order ID,Trade date,Transaction type,Market code,Quantity,Price\n9,12/10/2026,Buy,NZX,1,2";
    const orderPlan = planBrokerImport(orderOnly);
    expect(orderPlan.broker).toBe("sharesies");
    expect(orderPlan.needsMapping).toBe(true);
    expect(orderPlan.broker).not.toBe("generic");
  });

  it("opens the column map whenever needsMapping is set", () => {
    const generic = planBrokerImport("Booked,What,Instrument,Units,Unit,Money\n2026-04-02,buy,WBC.AX,5,30.00,150.00");
    expect(generic.needsMapping).toBe(true);
    expect(generic.broker).toBeNull();
    expect(readImportPreview({ ok: true, needsMapping: true, data: { needsMapping: true, headers: generic.headers } })).toEqual({
      needsMapping: true,
      headers: generic.headers,
    });
    expect(readImportPreview({ needsMapping: true, data: null })).toEqual({ needsMapping: true, headers: [] });
    expect(readImportPreview({ data: { needsMapping: false, headers: ["Date"] } })).toBeNull();
    const panel = read("src/components/import/BrokerImportPanel.tsx");
    const route = read("src/app/api/import/route.ts");
    expect(panel).toContain('data-testid="column-map"');
    expect(panel).toContain("readImportPreview");
    expect(route.indexOf("draft.needsMapping")).toBeLessThan(route.indexOf("await bookRows"));
  });

  it("computes currency effect from the foreign value and keeps other at rounding", () => {
    const split = splitReturns(
      [
        {
          quantity: 10,
          costPrice: 10,
          markPrice: 12,
          currency: "USD",
          fxAtCost: 1.6,
          fxNow: 1.7,
          purchaseDate: "2020-01-15",
        },
      ],
      0,
      38.77
    );
    expect(split.currencyEffectNzd).toBe(10);
    expect(split.capitalGainNzd).toBe(34);
    expect(split.otherNzd).toBe(0);
    expect(split.totalNzd).toBe(44);
    expect(Math.abs(split.otherNzd)).toBeLessThan(0.05);
    expect(split.otherNote).toMatch(/rounding/i);
    expect(split.currencyNote).toMatch(/buy price/);
  });

  it("shows live=n/a, ledger paging, Koins snapshot prices and the Stox notice", () => {
    expect(read("src/lib/transactions.ts")).toContain("live=n/a");
    expect(read("src/lib/transactions.ts")).not.toContain('quote_origin === "snapshot" && price > 0');
    expect(read("src/components/dashboard/StockDialog.tsx")).toContain("live: n/a");
    expect(read("src/lib/dex-source.ts")).toContain("export function displayLedgerNote");
    expect(read("src/components/dashboard/TransactionCenter.tsx")).toContain("displayLedgerNote");
    expect(read("src/components/dashboard/TransactionCenter.tsx")).not.toContain('data-testid="ledger-live"');
    expect(read("src/components/dashboard/TransactionCenter.tsx")).toContain('data-testid="ledger-pager"');
    expect(read("src/components/dashboard/TransactionCenter.tsx")).toContain("Show all");
    expect(read("src/app/koins/page.tsx")).toContain("KoinsSnapshotPrices");
    expect(read("src/components/public/KoinsSnapshotPrices.tsx")).toContain("readSharedCryptoBoard");
    const copy = stoxReviewCopy();
    expect(copy).toContain("under review");
    expect(copy).toContain("EXAMPLE.NZ");
    expect(copy).not.toMatch(/\bTRIM\b/);
    expect(read("src/app/stox/page.tsx")).toContain("StoxReviewNotice");
    expect(read("src/components/public/StoxReviewNotice.tsx")).toContain("stoxReviewCopy");
    expect(read("src/components/bots/ApexReport.tsx")).not.toContain("stoxReviewCopy");
    expect(read("src/lib/report-html.ts")).not.toContain("stoxReviewCopy");
    expect(read("src/components/bots/ApexReport.tsx")).toContain("memberUnderReviewLines");
    expect(read("src/lib/report-html.ts")).toContain("memberUnderReviewLines");
    const own = memberUnderReviewLines({
      marketMovers: [{ windows: [{ underReview: [{ ticker: "FPH.AX" }] }] }],
      tickers: [{ ticker: "WBC.AX", changeWithheld: true }],
    });
    expect(own).toEqual(["FPH.AX — print under review", "WBC.AX — print under review"]);
    expect(own.join(" ")).not.toContain("MAH.AX");
    expect(memberUnderReviewLines({ marketMovers: [], tickers: [] })).toEqual([]);
    expect(read("src/lib/swyftx-display.ts")).toBeTruthy();
    expect(read("src/lib/dexscreener-display.ts")).toBeTruthy();
  });

  it("serves one snapshot list, fills chains and names, and refreshes a stale DEX board", () => {
    expect(presentListedCoin({ symbol: "USDT", name: "Tether", id: "tether", blockchain: "" }).blockchain).toBe("Ethereum");
    expect(presentListedCoin({ symbol: "WBTC", name: "Wrapped Bitcoin", id: "wrapped-bitcoin", blockchain: "—" }).blockchain).toBe("Ethereum");
    expect(presentListedCoin({ symbol: "STETH", name: "stETH", id: "staked-ether", blockchain: "" }).blockchain).toBe("Ethereum");
    expect(presentListedCoin({ symbol: "HYPE", name: "Hyperliquid", id: "hyperliquid", blockchain: "" }).blockchain).toBe("Hyperliquid");
    expect(presentListedCoin({ symbol: "ZEC", name: "Zcash", id: "zcash", blockchain: "" }).blockchain).toBe("Zcash");
    expect(presentListedCoin({ symbol: "RENDER", name: "RENDER", id: "render-token", blockchain: "" }).name).toBe("Render");
    expect(presentListedCoin({ symbol: "DYDX", name: "DYDX", id: "dydx-chain", blockchain: "" }).name).toBe("dYdX");
    expect(SNAPSHOT_REFRESH_MS).toBe(10 * 60 * 1000);
    const store = read("src/lib/crypto-board-store.ts");
    expect(store).toContain("revalidateStaleBoards");
    expect(store).toContain("DEX_REFRESH_BOUND_MS");
    expect(read("src/app/api/crypto/dex/route.ts")).toContain("revalidate: true");
    expect(read("src/app/api/crypto/route.ts")).toContain("seed: false");
    expect(read("src/lib/crypto-source.ts")).toContain("readSharedCryptoBoard({ seed: false })");
    expect(store).toContain("EMPTY_CRYPTO_SEED_MS = 7_000");
    expect(store).toContain("Never seed when a snapshot exists");
    expect(read("src/lib/public-market-index.ts")).toContain("const COIN_PAGE = MARKET_SNAPSHOT_TARGET");
    expect(read("src/app/api/tickers/quote/route.ts")).toContain('source = "snapshot"');
    expect(read("src/components/dashboard/RecordTransactionPanel.tsx")).toContain('payload.quote_origin = "snapshot"');
  });

  it("sums header cash from the ledger rows and pages the same book the CSV reads", () => {
    expect(
      cashFromLedgerRows([
        { type: "deposit", total: 33307.61, cash_nzd: 33307.61 },
        { type: "buy", total: -20.24, cash_nzd: -20.24 },
      ])
    ).toBe(33287.37);
    expect(read("src/lib/transactions.ts")).toContain("LEDGER_QUERY_LIMIT = 5000");
    expect(read("src/lib/transactions.ts")).toContain("ledgerAfterBooking");
    expect(read("src/lib/transactions.ts")).toContain("cashFromLedgerRows");
    expect(read("src/app/api/transactions/route.ts")).toContain("ledgerAfterBooking");
    expect(read("src/app/api/transactions/export/route.ts")).toContain("loadLedger(user, 5000)");
    expect(read("src/components/dashboard/TransactionCenter.tsx")).toContain("showing all");
    expect(read("src/lib/dex-source.ts")).toContain("export function displayLedgerNote");
    expect(read("src/lib/transaction-csv.ts")).not.toContain("stripQuoteStamp");
    expect(read("src/components/dashboard/PortfolioDashboard.tsx")).toContain("expectedTxRef");
    expect(read("src/components/dashboard/AnimatedMoney.tsx")).toContain("snap");
    expect(read("src/app/api/stocks/route.ts")).toContain("bookPromise");
    expect(read("src/app/api/stocks/route.ts")).not.toContain("overlayFifoPurchasePrices");
  });
});
