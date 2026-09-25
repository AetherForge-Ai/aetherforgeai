import { describe, expect, it } from "vitest";
import { buildSynthesis } from "@/lib/totalum-engine";
import {
  bullionMarkForHolding,
  bullionNzdPerOz,
  classWeightPct,
  equityTickersForQuotes,
  isBullionHolding,
  isListedStockHolding,
  isContaminatedEquityPrint,
  markBookAtBullionSpot,
  markToMarketBullionNZD,
  netWorthNZD,
  quoteRouteForHolding,
  resolveHoldingMarkPrice,
  visibleBullionLots,
} from "@/lib/metal-valuation";

/**
 * QA 2026-09-23 (1T tinikog589): 0.065 oz gold, cost NZ$7,640.25/oz
 * (~NZ$496.62 incl ~1% fee). Portfolio marked the lot at Yahoo GOLD
 * (Gold.com, Inc.) US$44.65 → NZ$2.9023, and metals allocation showed 0%.
 */
const OUNCES = 0.065;
const PURCHASE_NZD_PER_OZ = 7640.25;
const EQUITY_MISQUOTE = 44.65;
const SPOT_NZD_PER_OZ = 7237.61;

describe("bullion mark-to-market", () => {
  it("values troy ounces at NZD spot, not the GOLD equity quote", () => {
    const wrong = markToMarketBullionNZD(OUNCES, EQUITY_MISQUOTE);
    const right = markToMarketBullionNZD(OUNCES, SPOT_NZD_PER_OZ);
    const cost = markToMarketBullionNZD(OUNCES, PURCHASE_NZD_PER_OZ);

    expect(wrong).toBeCloseTo(2.90225, 4);
    expect(cost).toBeCloseTo(496.61625, 2);
    expect(right).toBeGreaterThan(450);
    expect(right).toBeCloseTo(470.44465, 2);

    const mark = resolveHoldingMarkPrice({
      ticker: "GOLD",
      assetType: "metal",
      storedPrice: EQUITY_MISQUOTE,
      purchasePrice: PURCHASE_NZD_PER_OZ,
      equityQuote: EQUITY_MISQUOTE,
      metalNzdPerOz: SPOT_NZD_PER_OZ,
    });
    expect(mark).toBe(SPOT_NZD_PER_OZ);
    expect(markToMarketBullionNZD(OUNCES, mark!)).toBeCloseTo(right, 4);
    // Net worth was short by roughly the purchase (~NZ$489), not a rounding error.
    expect(right - wrong).toBeGreaterThan(450);
  });

  it("does not send GOLD/SILVER bullion to the equity quote feed", () => {
    const tickers = equityTickersForQuotes([
      { ticker: "GOLD", asset_type: "metal" },
      { ticker: "SILVER", asset_type: "metal" },
      { ticker: "AAPL", asset_type: "stock" },
      { ticker: "BTC", asset_type: "crypto" },
    ]);
    expect(tickers).toEqual(["AAPL"]);
    expect(quoteRouteForHolding("metal", "GOLD")).toBe("bullion");
    expect(quoteRouteForHolding("stock", "AAPL")).toBe("equity");
    expect(quoteRouteForHolding("crypto", "BTC")).toBe("crypto");
    expect(isBullionHolding("stock", "BHP.AX")).toBe(false);
    expect(isListedStockHolding("stock", "AAPL")).toBe(true);
    expect(isListedStockHolding("stock", "BHP.AX")).toBe(true);
    expect(isListedStockHolding(undefined, "FPH.NZ")).toBe(true);
    expect(isListedStockHolding("stock", "NEM", "Newmont Gold")).toBe(true);
    expect(isListedStockHolding("stock", "GOLD")).toBe(false);
    expect(isListedStockHolding("stock", "SILVER")).toBe(false);
    expect(isListedStockHolding("metal", "GOLD")).toBe(false);
    expect(isListedStockHolding("crypto", "BTC")).toBe(false);
  });

  it("keeps equity and crypto marks on their own feeds", () => {
    expect(
      resolveHoldingMarkPrice({
        ticker: "AAPL",
        assetType: "stock",
        storedPrice: 100,
        equityQuote: 212.5,
        metalNzdPerOz: SPOT_NZD_PER_OZ,
      })
    ).toBe(212.5);
    expect(
      resolveHoldingMarkPrice({
        ticker: "BTC",
        assetType: "crypto",
        storedPrice: 1,
        equityQuote: 44.65,
        cryptoQuote: 64000,
      })
    ).toBe(64000);
  });

  it("marks silver in troy ounces at its own NZD spot", () => {
    const spot = { gold: { nzdPerOz: SPOT_NZD_PER_OZ }, silver: { nzdPerOz: 110.84 } };
    expect(bullionNzdPerOz("SILVER", spot)).toBe(110.84);
    expect(bullionNzdPerOz("GOLD", spot)).toBe(SPOT_NZD_PER_OZ);
    expect(markToMarketBullionNZD(2.5, 110.84)).toBeCloseTo(277.1, 2);
    expect(
      resolveHoldingMarkPrice({
        ticker: "SILVER",
        assetType: "metal",
        storedPrice: 22,
        equityQuote: 22,
        metalNzdPerOz: bullionNzdPerOz("SILVER", spot),
      })
    ).toBe(110.84);
  });

  it("falls back to the stored per-oz price when spot is missing, never the equity quote", () => {
    const mark = resolveHoldingMarkPrice({
      ticker: "GOLD",
      assetType: "metal",
      storedPrice: PURCHASE_NZD_PER_OZ,
      purchasePrice: PURCHASE_NZD_PER_OZ,
      equityQuote: EQUITY_MISQUOTE,
      metalNzdPerOz: null,
    });
    expect(mark).toBe(PURCHASE_NZD_PER_OZ);
  });

  it("puts purchase-scale gold into net worth and a non-zero metals weight", () => {
    const metals = markToMarketBullionNZD(OUNCES, SPOT_NZD_PER_OZ);
    const misquoted = markToMarketBullionNZD(OUNCES, EQUITY_MISQUOTE);
    const cash = 503.38;
    const wrongWorth = netWorthNZD({ cashNZD: cash, metalsNZD: misquoted });
    const rightWorth = netWorthNZD({ cashNZD: cash, metalsNZD: metals });

    expect(classWeightPct(misquoted, wrongWorth)).toBeLessThan(1);
    expect(classWeightPct(metals, rightWorth)).toBeGreaterThan(40);
    expect(rightWorth - wrongWorth).toBeGreaterThan(450);
  });
});

/**
 * QA retest of develop 79d8247: the spot card showed NZ$7,571.19/oz, but the
 * held GOLD row stayed at the persisted Yahoo equity print (US$44.65), so
 * metals MV stayed NZ$2.9023, allocation rounded to 0%, and the Metals hub
 * listed nothing while the KPI said "1 bullion position".
 */
const LIVE_SPOT_NZD = 7571.19;
const QA_OTHER_NW = 9449 - markToMarketBullionNZD(OUNCES, EQUITY_MISQUOTE);

describe("persisted equity print on a held gold lot", () => {
  const goldLot = {
    _id: "g-qa",
    ticker: "GOLD",
    asset_type: "metal",
    company_name: "Gold.com, Inc.",
    shares: OUNCES,
    purchase_price: PURCHASE_NZD_PER_OZ,
    current_price: EQUITY_MISQUOTE,
  };
  const spot = { gold: { nzdPerOz: LIVE_SPOT_NZD }, silver: { nzdPerOz: 110.84 } };

  it("rewrites current_price to NZD troy-oz spot and values 0.065 oz near NZ$492", () => {
    expect(isContaminatedEquityPrint(EQUITY_MISQUOTE, PURCHASE_NZD_PER_OZ)).toBe(true);
    expect(bullionMarkForHolding(goldLot, spot)).toBe(LIVE_SPOT_NZD);

    const [marked] = markBookAtBullionSpot([goldLot], spot);
    expect(marked.current_price).toBe(LIVE_SPOT_NZD);
    expect(goldLot.current_price).toBe(EQUITY_MISQUOTE);

    const mv = markToMarketBullionNZD(OUNCES, marked.current_price);
    expect(mv).toBeCloseTo(492.12735, 2);
    expect(mv).toBeGreaterThan(450);
    expect(mv).toBeLessThan(550);

    const worth = netWorthNZD({ cashNZD: QA_OTHER_NW, metalsNZD: mv });
    expect(worth).toBeGreaterThan(9900);
    expect(worth).toBeLessThan(10000);
    expect(classWeightPct(mv, worth).toFixed(0)).toBe("5");
    expect(classWeightPct(markToMarketBullionNZD(OUNCES, EQUITY_MISQUOTE), 9449).toFixed(0)).toBe("0");
  });

  it("uses the per-oz purchase price when spot is missing, never US$44.65", () => {
    expect(bullionMarkForHolding(goldLot, null)).toBe(PURCHASE_NZD_PER_OZ);
    const [marked] = markBookAtBullionSpot([goldLot], null);
    expect(marked.current_price).toBe(PURCHASE_NZD_PER_OZ);
    expect(
      resolveHoldingMarkPrice({
        ticker: "GOLD",
        assetType: "metal",
        storedPrice: EQUITY_MISQUOTE,
        purchasePrice: PURCHASE_NZD_PER_OZ,
        equityQuote: EQUITY_MISQUOTE,
        metalNzdPerOz: null,
      })
    ).toBe(PURCHASE_NZD_PER_OZ);
  });

  it("lists the ledger gold lot on the metals hub when the precious desk is empty", () => {
    const lots = visibleBullionLots([goldLot], [], spot);
    expect(lots).toHaveLength(1);
    expect(lots[0]).toMatchObject({
      id: "ledger-g-qa",
      metal: "gold",
      ounces: OUNCES,
      source: "ledger",
    });
    expect(lots[0].marketValueNZD).toBeCloseTo(492.12735, 2);
  });

  it("does not rewrite equity or crypto marks, including miners with gold in the name", () => {
    const book = [
      goldLot,
      {
        _id: "a1",
        ticker: "AAPL",
        asset_type: "stock",
        company_name: "Apple",
        shares: 2,
        purchase_price: 180,
        current_price: 212.5,
      },
      {
        _id: "nem",
        ticker: "NEM",
        asset_type: "stock",
        company_name: "Newmont Gold",
        sector: "Gold miners",
        shares: 4,
        purchase_price: 40,
        current_price: 55,
      },
      {
        _id: "btc",
        ticker: "BTC",
        asset_type: "crypto",
        company_name: "Bitcoin",
        shares: 0.01,
        purchase_price: 60000,
        current_price: 64000,
      },
    ];
    const marked = markBookAtBullionSpot(book, spot);
    expect(marked.find((r) => r.ticker === "GOLD")?.current_price).toBe(LIVE_SPOT_NZD);
    expect(marked.find((r) => r.ticker === "AAPL")?.current_price).toBe(212.5);
    expect(marked.find((r) => r.ticker === "NEM")?.current_price).toBe(55);
    expect(marked.find((r) => r.ticker === "BTC")?.current_price).toBe(64000);
    expect(isBullionHolding("stock", "NEM", "Newmont Gold")).toBe(false);
    expect(quoteRouteForHolding("stock", "NEM", "Newmont Gold")).toBe("equity");
    expect(quoteRouteForHolding("stock", "AAPL")).toBe("equity");
    expect(quoteRouteForHolding("crypto", "BTC")).toBe("crypto");
    expect(
      resolveHoldingMarkPrice({
        ticker: "AAPL",
        assetType: "stock",
        storedPrice: 212.5,
        equityQuote: 212.5,
        metalNzdPerOz: LIVE_SPOT_NZD,
      })
    ).toBe(212.5);
  });
});

describe("Headmaster synthesis metals allocation", () => {
  it("marks a ledger gold lot at NZD/oz and includes it in metals, not equities", () => {
    const syn = buildSynthesis({
      stocks: [
        {
          _id: "g1",
          ticker: "GOLD",
          asset_type: "metal",
          company_name: "Gold bullion",
          shares: OUNCES,
          purchase_price: PURCHASE_NZD_PER_OZ,
          current_price: EQUITY_MISQUOTE,
        },
        {
          _id: "a1",
          ticker: "AAPL",
          asset_type: "stock",
          company_name: "Apple",
          shares: 2,
          purchase_price: 180,
          current_price: 200,
        },
      ],
      metals: [],
      spot: {
        gold: { nzdPerOz: SPOT_NZD_PER_OZ, usdPerOz: 4333.9 },
        silver: { nzdPerOz: 110.84, usdPerOz: 66.38 },
        live: true,
        asOf: "2026-09-23T06:38:40.000Z",
      },
      fxToNZD: { NZD: 1, AUD: 1.09, USD: 1.67 },
      cashBalanceNZD: 500,
    });

    const metals = syn.classAllocation.find((c) => c.assetClass === "metals");
    const equities = syn.classAllocation.find((c) => c.assetClass === "equities");
    expect(metals).toBeTruthy();
    expect(metals!.valueNZD).toBeGreaterThan(450);
    expect(metals!.weight).toBeGreaterThan(20);
    expect(equities!.valueNZD).toBeCloseTo(2 * 200 * 1.67, 0);
    expect(syn.positions.find((p) => p.label === "GOLD")?.assetClass).toBe("metals");
    expect(syn.positions.find((p) => p.label === "AAPL")?.assetClass).toBe("equities");
    expect(syn.totalValueNZD).toBeGreaterThan(500 + 450);
  });

  it("still values a precious_metal row at spot per troy ounce", () => {
    const syn = buildSynthesis({
      stocks: [],
      metals: [
        {
          _id: "pm1",
          metal: "gold",
          ounces: OUNCES,
          purchase_price_per_oz: PURCHASE_NZD_PER_OZ,
        },
      ],
      spot: {
        gold: { nzdPerOz: SPOT_NZD_PER_OZ, usdPerOz: 4333.9 },
        silver: { nzdPerOz: 110.84, usdPerOz: 66.38 },
        live: true,
        asOf: "2026-09-23T06:38:40.000Z",
      },
      cashBalanceNZD: 0,
    });
    const metals = syn.classAllocation.find((c) => c.assetClass === "metals");
    expect(metals!.valueNZD).toBeCloseTo(markToMarketBullionNZD(OUNCES, SPOT_NZD_PER_OZ), 2);
    expect(metals!.weight).toBe(100);
  });
});
