import { describe, expect, it, beforeEach } from "vitest";
import { buildLiveReport } from "@/lib/apex";
import { renderReportHtml } from "@/lib/report-html";
import {
  buildSharedBookLog,
  fullBookFromHoldings,
  fullBookFromPositions,
  fullBookSentence,
  illustratedPathFromPayloads,
  pathMissFromSaved,
  pathMissText,
  publishSharedBookLog,
  readSharedBookLog,
  resetSharedBookLog,
} from "@/lib/book-log";
import {
  annotateTickerCalls,
  closedCallSentence,
  illustratedSizeNZD,
  koinsHoldingLine,
  landBand,
  paperFeeSentence,
  priorCallsFromPayloads,
  rollClosedCallScore,
  type SevenDayCall,
} from "@/lib/report-topup";
import { applyCashLine, displayedCashImpact, ledgerSections, netWorthOf } from "@/lib/ledger-cash-lines";
import { applyPaperCashMove } from "@/lib/paper-cash";
import { BASELINE_FX_TO_NZD } from "@/lib/currency";
import { blockchainLabel } from "@/lib/crypto-market";
import { dedupeDexTokens, parseMegafilterPage } from "@/lib/crypto-dex";
import { reportPayloadWasEmailed } from "@/lib/report-email";
import { executiveBriefFromPlan, modelViewSentence } from "@/lib/headmaster-trust";
import { buildAllocationPlan } from "@/lib/headmaster-trust";

const WEEK = 7 * 24 * 60 * 60 * 1000;

describe("shared book log", () => {
  beforeEach(() => resetSharedBookLog());

  it("keeps one net worth that matches cash plus holdings, with dollars and the reserve cap", () => {
    const log = publishSharedBookLog({
      cashNZD: 10000,
      stocksNZD: 55000,
      cryptoNZD: 20000,
      metalsNZD: 15000,
      prices: { BTC: 100, "BONK": 0 },
    });
    expect(log.netWorthNZD).toBe(100000);
    expect(log.netWorthNZD).toBe(log.cashNZD + log.stocksNZD + log.cryptoNZD + log.metalsNZD);
    expect(log.prices.BTC).toBe(100);
    expect(log.prices.BONK).toBeUndefined();
    expect(log.reserveSentence).toMatch(/NZ\$10,000/);
    expect(log.reserveSentence).toMatch(/10%/);
    expect(log.reserveSentence).not.toMatch(/^about 10%$/);
    expect(fullBookSentence(log)).toMatch(/cash NZ\$10,000\.00/);
    expect(fullBookSentence(log)).toMatch(/Net worth NZ\$100,000\.00/);
    expect(readSharedBookLog()?.netWorthNZD).toBe(100000);
    const again = buildSharedBookLog({ cashNZD: 10000, stocksNZD: 55000, cryptoNZD: 20000, metalsNZD: 15000 });
    expect(again.netWorthNZD).toBe(log.netWorthNZD);
  });

  it("states a path miss only after a week, and says there is no miss when the path had no view", () => {
    expect(pathMissText(0, WEEK - 1, 2, 1)).toBeNull();
    const miss = pathMissText(0, WEEK, 2, 1);
    expect(miss).toMatch(/After a week/);
    expect(miss).toMatch(/missed by/);
    expect(pathMissText(0, WEEK, 0, 4)).toMatch(/no view/);
    expect(pathMissText(0, WEEK, 0, 4)).not.toMatch(/0\.00%/);
  });

  it("reads last week's illustrated path from the saved Headmaster report, not from module memory", () => {
    const saved = { illustrated7dPct: 2, netWorthNZD: 1000, issuedAtMs: 0 };
    expect(illustratedPathFromPayloads([JSON.stringify({ illustratedPath: saved })])?.netWorthNZD).toBe(1000);
    expect(pathMissFromSaved(saved, WEEK - 1, 1100)).toBeNull();
    const later = publishSharedBookLog(
      { cashNZD: 1100, stocksNZD: 0, cryptoNZD: 0, metalsNZD: 0, priorIllustratedPath: saved },
      WEEK
    );
    expect(later.pathMiss).toMatch(/After a week/);
    expect(later.pathMiss).toMatch(/illustrated \+2%/);
    resetSharedBookLog();
    const withoutTheSavedPath = publishSharedBookLog(
      { cashNZD: 1100, stocksNZD: 0, cryptoNZD: 0, metalsNZD: 0 },
      WEEK
    );
    expect(withoutTheSavedPath.pathMiss).toBeNull();
    const silent = pathMissFromSaved(
      { illustrated7dPct: 0, netWorthNZD: 1000, issuedAtMs: 0 },
      WEEK,
      1100
    );
    expect(silent).toMatch(/no view/);
    expect(silent).not.toMatch(/0\.00%/);
  });

  it("uses one full book for a stock report and a crypto report when class allocation is missing", () => {
    const rows = [
      { _id: "eq", ticker: "AIA.NZ", asset_type: "stock", shares: 10, purchase_price: 8, current_price: 10 },
      { _id: "coin", ticker: "BONK", asset_type: "crypto", shares: 2, purchase_price: 20, current_price: 25 },
      { _id: "oz", ticker: "GOLD", asset_type: "metal", shares: 1, purchase_price: 4000, current_price: 44 },
    ];
    const book = fullBookFromHoldings({
      rows,
      precious: [{ metal: "silver", ounces: 2, purchase_price_per_oz: 40 }],
      spot: { gold: { nzdPerOz: 4000 }, silver: { nzdPerOz: 50 } },
      cashNZD: 100,
      fxToNZD: { NZD: 1, USD: 2, AUD: 1 },
    });
    expect(book.stocksNZD).toBe(100);
    expect(book.cryptoNZD).toBe(100);
    expect(book.metalsNZD).toBe(4100);
    expect(book.cashNZD).toBe(100);
    expect(book.netWorthNZD).toBe(4400);
    const stockReport = publishSharedBookLog({ ...book, sleeveNZD: 100, sleeveLabel: "Sleeve" });
    const cryptoReport = publishSharedBookLog({ ...book, sleeveNZD: book.cryptoNZD, sleeveLabel: "Sleeve" });
    expect(stockReport.stocksNZD).toBe(cryptoReport.stocksNZD);
    expect(stockReport.cryptoNZD).toBe(cryptoReport.cryptoNZD);
    expect(stockReport.metalsNZD).toBe(cryptoReport.metalsNZD);
    expect(stockReport.netWorthNZD).toBe(cryptoReport.netWorthNZD);
    expect(stockReport.cryptoNZD).not.toBe(0);
    expect(cryptoReport.stocksNZD).not.toBe(0);
    expect(stockReport.sleeveLabel).toBe("Sleeve");
    expect(stockReport.sleeveNZD).toBe(100);
    const fromPositions = fullBookFromPositions([
      { assetClass: "equities", valueNZD: book.stocksNZD },
      { assetClass: "crypto", valueNZD: book.cryptoNZD },
      { assetClass: "metals", valueNZD: book.metalsNZD },
      { assetClass: "cash", valueNZD: book.cashNZD },
    ]);
    expect(fromPositions).toEqual(book);
  });
});

describe("closed-call score", () => {
  const call: SevenDayCall = {
    id: "AAA:1",
    ticker: "AAA",
    issuedAtMs: 0,
    bearLow: 8,
    bearHigh: 9,
    baseLow: 10,
    baseHigh: 12,
    bullLow: 13,
    bullHigh: 15,
  };

  it("counts where price landed and does not invent a hit rate", () => {
    expect(landBand(11, call)).toBe("base");
    expect(landBand(8.5, call)).toBe("bear");
    expect(landBand(14, call)).toBe("bull");
    expect(landBand(1, call)).toBe("outside");
    const score = rollClosedCallScore(null, [call], { AAA: 11 }, WEEK);
    expect(score.base).toBe(1);
    expect(score.closed).toBe(1);
    expect(score.shortSample).toBe(true);
    expect(score.sentence).toMatch(/sample is short/);
    expect(score.sentence).not.toMatch(/hit rate/i);
    expect(score.sentence).not.toMatch(/%/);
    const again = rollClosedCallScore(score, [call], { AAA: 11 }, WEEK * 2);
    expect(again.closed).toBe(1);
    const waiting = rollClosedCallScore(null, [call], {}, WEEK);
    expect(waiting.closed).toBe(0);
    expect(closedCallSentence(0, 0, 0, 0)).not.toMatch(/%/);
  });

  it("reads earlier open calls from saved payloads", () => {
    const prior = priorCallsFromPayloads([
      JSON.stringify({ openCalls: [call], closedCallScore: rollClosedCallScore(null, [], {}, 0) }),
    ]);
    expect(prior.calls).toHaveLength(1);
    expect(prior.score?.sentence).toMatch(/sample is short/);
  });
});

describe("ticker call lines", () => {
  it("shows a paper fee of zero and shrinks size when volatility was high", () => {
    expect(paperFeeSentence(0)).toBe("The range is before fees and spread. Paper fee NZ$0.00.");
    const calm = illustratedSizeNZD({
      cashNZD: 50000,
      bookNZD: 100000,
      sleeveWeightPct: 20,
      realizedVolPct: 10,
      names: 2,
    });
    const wild = illustratedSizeNZD({
      cashNZD: 50000,
      bookNZD: 100000,
      sleeveWeightPct: 20,
      realizedVolPct: 40,
      names: 2,
    });
    expect(wild).toBeLessThan(calm);
    expect(calm).toBeLessThanOrEqual(20000);
  });

  it("keeps an unavailable name on the report and still shows the fee line on a priced name", () => {
    const report = buildLiveReport("crypto", [
      { ticker: "BONK", name: "Bonk", price: 0, shares: 10, priceUnavailable: true },
    ]);
    expect(report.tickers.map((t) => t.ticker)).toContain("BONK");
    expect(report.tickers[0].note).toMatch(/Live price unavailable/);
    expect(report.marketMovers).toBeDefined();
    expect(report.projectionLeaders).toBeDefined();
    expect(report.directRecommendations).toBeDefined();
    expect(report.pathwayPlan).toBeDefined();
    const line = koinsHoldingLine({ ticker: "BONK", name: "Bonk", shares: 10, livePrice: null });
    expect(line.priceStatus).toBe("unavailable");
    expect(line.sentence).toMatch(/Live price unavailable/);
    const live = koinsHoldingLine({ ticker: "BONK", name: "Bonk", shares: 10, livePrice: 0.00002 });
    expect(live.sentence).toMatch(/0\.00002/);
    const html = renderReportHtml(report, {
      generatedAtLabel: "1 Oct 2026",
      bookLog: publishSharedBookLog({ cashNZD: 1000, stocksNZD: 0, cryptoNZD: 0, metalsNZD: 0 }),
      closedCallScore: rollClosedCallScore(null, [], {}, WEEK),
    });
    expect(html).toContain("Full book:");
    expect(html).toContain("Closed-call score");
    expect(html).toContain("BONK");
    expect(html).toContain("Unavailable");
    expect(html).toContain("Live price unavailable");
    expect(html).not.toContain("Total Worth");
    expect(html).toContain("Top gainers identified");
    expect(html).toContain("Full multi-timeframe mover sweep");
    const priced = buildLiveReport("crypto", [{ ticker: "ETH", name: "Ether", price: 2000, shares: 1 }]);
    const noted = annotateTickerCalls(priced.tickers, { cashNZD: 10000, netWorthNZD: 20000 }, "crypto");
    expect(noted[0].note).toMatch(/Paper fee NZ\$/);
    expect(noted[0].note).toMatch(/horizon/);
  });
});

describe("Headmaster model view", () => {
  it("says the model has no view instead of printing 0.00%", () => {
    expect(modelViewSentence(0, 0)).toBe("The model has no view.");
    expect(modelViewSentence(0, 0)).not.toMatch(/0\.00%/);
    const plan = buildAllocationPlan({
      modelName: "Balanced Growth",
      riskLabel: "Balanced",
      totalValueNZD: 10000,
      cashBalanceNZD: 10000,
      targets: { equities: 55, crypto: 20, metals: 15, cash: 10 },
      projectedReturnPct: 0,
      projectedVolPct: 0,
      classes: [],
    });
    const brief = executiveBriefFromPlan(plan);
    expect(brief).toContain("The model has no view.");
    expect(brief).not.toMatch(/0\.00%/);
    expect(brief).toMatch(/10% of the live book/);
  });
});

describe("email proof", () => {
  it("does not call a saved report emailed unless a message id came back", () => {
    expect(reportPayloadWasEmailed({ emailDelivered: true })).toBe(false);
    expect(reportPayloadWasEmailed({ emailDelivered: true, emailMessageId: "" })).toBe(false);
    expect(reportPayloadWasEmailed({ emailDelivered: true, emailMessageId: "msg_1" })).toBe(true);
  });
});

describe("dividend and tax ledger lines", () => {
  it("moves cash and net worth by the recorded amounts and leaves holdings put", () => {
    const start = { cashNZD: 1000, holdingsNZD: 250, quantities: { BTC: 2, AIA: 10 } };
    const afterDividend = applyCashLine(start, { type: "dividend", amountNZD: 40 });
    expect(afterDividend.cashNZD).toBe(1040);
    expect(afterDividend.holdingsNZD).toBe(250);
    expect(afterDividend.quantities).toEqual(start.quantities);
    expect(netWorthOf(afterDividend) - netWorthOf(start)).toBe(40);
    const afterTax = applyCashLine(afterDividend, { type: "tax", amountNZD: 15 });
    expect(afterTax.cashNZD).toBe(1025);
    expect(afterTax.holdingsNZD).toBe(250);
    expect(afterTax.quantities).toEqual(start.quantities);
    expect(netWorthOf(afterTax)).toBe(1025 + 250);
    expect(netWorthOf(afterDividend) - netWorthOf(afterTax)).toBe(15);
    const sections = ledgerSections([
      { type: "dividend", asset_name: "Dividend", total: 40 },
      { type: "tax", asset_name: "Tax", total: -15 },
      { type: "buy", asset_name: "BTC" },
    ]);
    expect(sections.dividends).toHaveLength(1);
    expect(sections.tax).toHaveLength(1);
    expect(sections.dividends[0].asset_name).toBe("Dividend");
    expect(sections.tax[0].asset_name).toBe("Tax");
    expect(displayedCashImpact("tax", 15)).toBe(-15);
    expect(displayedCashImpact("tax", -15)).toBe(-15);
    expect(displayedCashImpact("dividend", 40)).toBe(40);
    expect(displayedCashImpact("dividend", -40)).toBe(40);
  });
});

describe("extended crypto and DEX paper trades", () => {
  it("debits cash on a buy at the live price and credits cash when the holding is reduced", () => {
    const price = 0.00002;
    const quantity = 1000;
    const bought = applyPaperCashMove({
      side: "buy",
      quantity,
      price,
      currency: "USD",
      rates: BASELINE_FX_TO_NZD,
      cashNZD: 500,
      shares: 0,
    });
    const costNZD = Math.round((quantity * price * BASELINE_FX_TO_NZD.USD + Number.EPSILON) * 100) / 100;
    expect(bought.ok).toBe(true);
    expect(bought.shares).toBe(1000);
    expect(bought.cashDeltaNZD).toBeCloseTo(-costNZD, 2);
    expect(bought.cashNZD).toBeCloseTo(500 - costNZD, 2);
    expect(bought.cashNZD).toBeLessThan(500);
    const sold = applyPaperCashMove({
      side: "sell",
      quantity: 400,
      price,
      currency: "USD",
      rates: BASELINE_FX_TO_NZD,
      cashNZD: bought.cashNZD,
      shares: bought.shares,
    });
    expect(sold.ok).toBe(true);
    expect(sold.shares).toBe(600);
    expect(sold.cashNZD).toBeGreaterThan(bought.cashNZD);
    const closed = applyPaperCashMove({
      side: "sell",
      quantity: 600,
      price,
      currency: "USD",
      rates: BASELINE_FX_TO_NZD,
      cashNZD: sold.cashNZD,
      shares: sold.shares,
    });
    expect(closed.shares).toBe(0);
    expect(closed.cashNZD).toBeGreaterThan(sold.cashNZD);
    const refused = applyPaperCashMove({
      side: "buy",
      quantity: 1,
      price: null,
      currency: "USD",
      cashNZD: 500,
      shares: 0,
    });
    expect(refused.ok).toBe(false);
    expect(refused.cashNZD).toBe(500);
    expect(refused.shares).toBe(0);
    expect(refused.error).toMatch(/live price unavailable/i);
  });
});

describe("blockchain and DEX rows", () => {
  it("labels a native coin, an unavailable list, and a real platform without guessing", () => {
    expect(blockchainLabel({}, true)).toBe("Native");
    expect(blockchainLabel(null, false)).toBe("Unavailable");
    expect(blockchainLabel({ ethereum: "0xabc" }, true)).toBe("Ethereum");
  });

  it("keeps a live DEX price and says when the print is missing", () => {
    const rows = parseMegafilterPage({
      data: [
        {
          id: "pool-1",
          attributes: { base_token_price_usd: "1.25", volume_usd: { h24: "10" } },
          relationships: {
            base_token: { data: { id: "tok-1" } },
            network: { data: { id: "solana" } },
            dex: { data: { id: "raydium" } },
          },
        },
        {
          id: "pool-2",
          attributes: { base_token_price_usd: null },
          relationships: { base_token: { data: { id: "tok-2" } } },
        },
      ],
      included: [
        { id: "tok-1", type: "token", attributes: { symbol: "jup", name: "Jupiter", coingecko_coin_id: "jupiter-exchange-solana" } },
        { id: "tok-2", type: "token", attributes: { symbol: "zzz", name: "Zed" } },
      ],
    });
    const unique = dedupeDexTokens(rows, 400);
    const jup = unique.find((row) => row.symbol === "JUP");
    const zed = unique.find((row) => row.symbol === "ZZZ");
    expect(jup?.price).toBe(1.25);
    expect(jup?.priceUnavailable).toBe(false);
    expect(zed?.price).toBeNull();
    expect(zed?.priceUnavailable).toBe(true);
  });
});
