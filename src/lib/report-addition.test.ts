import { describe, expect, it, beforeEach } from "vitest";
import { buildLiveReport } from "@/lib/apex";
import { renderReportHtml } from "@/lib/report-html";
import {
  buildSharedBookLog,
  fullBookSentence,
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
import { applyCashLine, ledgerSections, netWorthOf } from "@/lib/ledger-cash-lines";
import { recordListedTrade } from "@/lib/listed-trade";
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
  });
});

describe("extended crypto and DEX paper trades", () => {
  it("records a buy and a sell of a name from the extended lists", () => {
    const listing = { symbol: "BONK", name: "Bonk", id: "bonk", price: 0.00002, list: "dex" as const };
    const bought = recordListedTrade({ cashNZD: 500, holdings: {} }, { side: "buy", listing, quantity: 1000 });
    expect(bought.ok).toBe(true);
    expect(bought.book.holdings.BONK.shares).toBe(1000);
    const sold = recordListedTrade(bought.book, { side: "sell", listing, quantity: 400 });
    expect(sold.ok).toBe(true);
    expect(sold.book.holdings.BONK.shares).toBe(600);
    const closed = recordListedTrade(sold.book, { side: "sell", listing, quantity: 600 });
    expect(closed.book.holdings.BONK).toBeUndefined();
    const refused = recordListedTrade(
      { cashNZD: 500, holdings: {} },
      { side: "buy", listing: { ...listing, price: null }, quantity: 1 }
    );
    expect(refused.ok).toBe(false);
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
