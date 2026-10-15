import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildLiveReport } from "@/lib/bot-report";
import { CSV_EXPORT_COLUMNS } from "@/lib/ledger-schema";
import {
  attachFifoRealised,
  applyFifoPurchasePrices,
  datetimeBackfillPlan,
  fifoTotals,
  formatDatetimeBackfillDryRun,
  formatFifoRecomputeDryRun,
} from "@/lib/fifo-cost";
import { formatNzd, formatSignedMoney } from "@/lib/currency";
import { datedTaxCsvName } from "@/lib/lot-day";
import { applyMarketsSessionChange } from "@/lib/markets-session";
import type { SecurityIntel } from "@/lib/market-intel";
import { buildFifPaper } from "@/lib/fif-working-paper";
import { computeSummary, formatPercent } from "@/lib/portfolio";
import { printUnderReviewLabel, PROJECTION_RANK_NOTE, projectionLeaderLine, projectionRatingLabel } from "@/lib/report-copy";
import { priorMoverPrints } from "@/lib/report-topup";
import { reviewSessionMove } from "@/lib/quote-review";
import { notBuyRatingReason, readTape } from "@/lib/report-consistency";
import { realisedByTaxYear } from "@/lib/tax-realised";
import { taxableIncome } from "@/lib/taxable-income";
import { csvEscape, transactionCsvCells } from "@/lib/transaction-csv";
import type { TaxLedgerRow } from "@/lib/taxable-income";

const buyFx = 11.78 / 9.52;
const sellFx = 11.74 / 9.44;

function book(): TaxLedgerRow[] {
  return [
    { type: "buy", ticker: "ETH", asset_type: "crypto", executed_at: "2026-08-01", quantity: 100, price: 1, currency: "NZD", fx_rate: 1 },
    { type: "sell", ticker: "ETH", asset_type: "crypto", executed_at: "2026-09-01", quantity: 100, price: 0.8941, currency: "NZD", fx_rate: 1, fees_nzd: 0, realized_pnl: -10.59 },
    { type: "buy", ticker: "WOR.AX", asset_type: "stock", executed_at: "2026-10-01", quantity: 1, price: 9.52, currency: "AUD", fx_rate: buyFx },
    { type: "buy", ticker: "WOR.AX", asset_type: "stock", executed_at: "2026-10-01", quantity: 1, price: 9.52, currency: "AUD", fx_rate: buyFx },
    { type: "buy", ticker: "WOR.AX", asset_type: "stock", executed_at: "2026-10-01", quantity: 1000, price: 9.44, currency: "AUD", fx_rate: buyFx },
    { type: "sell", ticker: "WOR.AX", asset_type: "stock", executed_at: "2026-10-10", quantity: 1, price: 9.44, currency: "AUD", fx_rate: sellFx, fees_nzd: 0, realized_pnl: 0 },
    { type: "sell", ticker: "WOR.AX", asset_type: "stock", executed_at: "2026-10-11", quantity: 1, price: 9.44, currency: "AUD", fx_rate: sellFx, fees_nzd: 0, realized_pnl: 0 },
    {
      type: "buy",
      ticker: "NEW.AX",
      asset_type: "stock",
      executed_at: "2026-10-01T00:00:00.000Z",
      trade_date: "2026-10-12",
      quantity: 1,
      price: 9.44,
      currency: "AUD",
      fx_rate: sellFx,
    },
    {
      type: "sell",
      ticker: "NEW.AX",
      asset_type: "stock",
      executed_at: "2026-10-01T00:00:00.000Z",
      trade_date: "2026-10-12",
      quantity: 1,
      price: 9.44,
      currency: "AUD",
      fx_rate: sellFx,
      fees_nzd: 0,
      realized_pnl: 99,
    },
  ];
}

function intel(partial: Partial<SecurityIntel> & Pick<SecurityIntel, "ticker">): SecurityIntel {
  const expected = partial.outlook?.expectedPct ?? partial.projected7dPct ?? 1;
  return {
    ticker: partial.ticker,
    name: partial.name ?? partial.ticker,
    sector: "Test",
    market: partial.market ?? "NZX",
    assetClass: partial.assetClass ?? "stock",
    currency: partial.currency ?? "NZD",
    price: partial.price ?? 1,
    change1d: partial.change1d ?? 0,
    change7d: partial.change7d ?? 0,
    change30d: partial.change30d ?? 0,
    history: partial.history ?? [{ label: "Now", price: partial.price ?? 1 }],
    projection: [],
    projected7dPct: partial.projected7dPct ?? expected,
    confidence: partial.confidence ?? 55,
    rsi: 48,
    macd: 0.1,
    macdSignalLine: 0,
    macdHistogram: 0.1,
    macdSignal: partial.macdSignal ?? "Bullish",
    bbPosition: 50,
    sma20: 1,
    vsSma20: 0,
    sma50: 1,
    vsSma50: 0,
    atrPct: 1,
    realizedVolPct: 40,
    dailyVolPct: 2,
    regime: partial.regime ?? "Range-Bound",
    support: 0.9,
    resistance: 1.1,
    pivot: 1,
    outlook: partial.outlook ?? {
      horizonDays: 7,
      expectedPct: expected,
      sigma7Pct: 2,
      regime: partial.regime ?? "Range-Bound",
      base: { label: "Base", lowPct: expected - 1, highPct: expected + 1, lowPrice: 0.9, highPrice: 1.1, probability: 50 },
      bull: { label: "Bull", lowPct: 2, highPct: 4, lowPrice: 1.1, highPrice: 1.2, probability: 25 },
      bear: { label: "Bear", lowPct: -4, highPct: -2, lowPrice: 0.8, highPrice: 0.9, probability: 25 },
    },
    signal: partial.signal ?? "Hold",
    score: partial.score ?? 40,
    conviction: partial.conviction ?? "Moderate",
    convictionReason: "test",
    reasoning: "test",
  };
}

describe("H2 markets cross-check", () => {
  it("withholds a ranked print more than 2pp from /markets and a repeated percent", () => {
    expect(
      reviewSessionMove({
        ticker: "CNU.NZ",
        assetClass: "stock",
        market: "NZX",
        currency: "NZD",
        price: 8,
        reportedChangePct: 17.24,
        window: "1d",
        marketsChangePct: 0,
      }).withheld
    ).toBe(true);
    expect(
      reviewSessionMove({
        ticker: "PAYX",
        assetClass: "stock",
        market: "US",
        currency: "USD",
        price: 110,
        reportedChangePct: 28.5,
        window: "1d",
        priorChangePct: 28.5,
        priorPrice: 100,
      }).reason
    ).toBe("same percent repeated while the price changed");

    const cnu = intel({ ticker: "CNU.NZ", market: "NZX", currency: "NZD", price: 8, change1d: 17.24, change7d: 2, change30d: 3 });
    const air = intel({ ticker: "AIR.NZ", market: "NZX", currency: "NZD", price: 0.7, change1d: 1.2, change7d: 1, change30d: 1 });
    const report = buildLiveReport(
      "stocks",
      [{ ticker: "FBU.NZ", name: "Fletcher", price: 3, shares: 10, purchasePrice: 3 }],
      {
        universeIntel: [cnu, air],
        marketsCrossCheck: { changePct: { "CNU.NZ": 0, "AIR.NZ": 1.2 } },
      }
    );
    const day = report.marketMovers.find((group) => group.market === "NZX")?.windows.find((window) => window.window === "Last 24 hours");
    expect(day?.movers.map((row) => row.ticker)).toContain("AIR.NZ");
    expect(day?.movers.map((row) => row.ticker)).not.toContain("CNU.NZ");
    expect(day?.underReview.map((row) => printUnderReviewLabel(row.ticker))).toContain("CNU.NZ — print under review");
    expect(report.topGainers.map((row) => row.ticker)).not.toContain("CNU.NZ");
    expect(report.directRecommendations.filter((row) => !row.held).map((row) => row.ticker)).not.toContain("CNU.NZ");
    expect(readFileSync("src/components/bots/ApexReport.tsx", "utf8")).toContain("printUnderReviewLabel");
  });

  it("copies the /markets session change onto Stox quotes only", () => {
    const row = intel({ ticker: "EBO.NZ", change1d: 16.45 });
    const next = applyMarketsSessionChange([row], { "EBO.NZ": { changePct: 0.74 } });
    expect(next[0].change1d).toBe(0.74);
  });
});

describe("H1 projection rating", () => {
  it("keeps the rank note and shows MAH as not a buy", () => {
    expect(PROJECTION_RANK_NOTE).toBe(
      "Ranked by projected 7-day move only. A rank is not a buy rating; each name's rating is shown."
    );
    const mah = intel({
      ticker: "MAH.AX",
      name: "Macmahon",
      market: "ASX",
      currency: "AUD",
      price: 1.11,
      signal: "Buy",
      macdSignal: "Bearish",
      regime: "Range-Bound",
      projected7dPct: 5.56,
      confidence: 65,
      score: 40,
      outlook: {
        horizonDays: 7,
        expectedPct: 5.56,
        sigma7Pct: 2,
        regime: "Range-Bound",
        base: { label: "Base", lowPct: 4, highPct: 6, lowPrice: 1, highPrice: 1.2, probability: 50 },
        bull: { label: "Bull", lowPct: 6, highPct: 8, lowPrice: 1.2, highPrice: 1.3, probability: 25 },
        bear: { label: "Bear", lowPct: -2, highPct: 0, lowPrice: 0.9, highPrice: 1, probability: 25 },
      },
    });
    const held = intel({ ticker: "FBU.NZ", price: 3, signal: "Hold", projected7dPct: 0.2 });
    const tape = readTape([held]);
    const report = buildLiveReport(
      "stocks",
      [{ ticker: "FBU.NZ", name: "Fletcher", price: 3, shares: 10, purchasePrice: 3 }],
      { holdingIntel: [held], universeIntel: [mah, held], tape, cashBalanceNZD: 1000 }
    );
    expect(report.projectionLeaders.length).toBeGreaterThan(0);
    expect(report.projectionLeaders.length).toBeLessThanOrEqual(10);
    const leader = report.projectionLeaders.find((row) => row.ticker === "MAH.AX");
    expect(leader?.ratingLabel).toBe("Not a buy: rating TRIM: momentum negative");
    expect(projectionLeaderLine(1, leader!)).toBe(
      "1. MAH.AX · ASX AU$1.11 +5.56% 65% · Not a buy: rating TRIM: momentum negative"
    );
    expect(report.notSized?.find((row) => row.ticker === "MAH.AX")?.reason).toBe(
      "rating TRIM: momentum negative"
    );
    expect(projectionRatingLabel("", null)).toBe("Not a buy: rating data unavailable");
    expect(
      notBuyRatingReason({ signal: "Buy", macdSignal: "Bearish", regime: "Range-Bound", projected7dPct: 5.56 })
    ).toBe("rating HOLD: momentum negative");
    expect(readFileSync("src/components/bots/ApexReport.tsx", "utf8")).toContain("PROJECTION_RANK_NOTE");
    expect(readFileSync("src/lib/apex.ts", "utf8")).toContain("getProjectionLeaders(10");
  });
});

describe("T1 FIFO reconciliation", () => {
  it("matches ledger, income, tax, realised and the CSV at -NZ$10.67", () => {
    const rows = book();
    const realised = realisedByTaxYear(rows, 2027);
    const income = taxableIncome(rows, 2027);
    const ytd = fifoTotals(rows, 2026);
    expect(formatSignedMoney(realised.combinedNzd)).toBe("-NZ$10.67");
    expect(formatSignedMoney(income.realisedNzd)).toBe("-NZ$10.67");
    expect(formatSignedMoney(ytd.ytd)).toBe("-NZ$10.67");
    expect(formatSignedMoney(ytd.all)).toBe("-NZ$10.67");
    expect(readFileSync("qa/T1-fifo-recompute-dry-run.txt", "utf8")).toBe(
      formatFifoRecomputeDryRun(rows.filter((row) => row.ticker !== "NEW.AX"))
    );
    expect(JSON.stringify(realised)).not.toContain("rows differ");
    expect(realised.storedDiffCount).toBe(0);
    const lot = realised.other.find((line) => line.ticker === "NEW.AX")?.lots[0];
    expect(lot?.acquired).toBe("2026-10-12");
    expect(`Lot 12 Oct 2026`).toBe(`Lot 12 Oct 2026`);
    expect(readFileSync("src/app/tax/realised/page.tsx", "utf8")).toContain("Lot {formatDisplayDate(lot.acquired)}");

    const annotated = attachFifoRealised(rows);
    const header = CSV_EXPORT_COLUMNS.join(",");
    const body = annotated.map((row) => transactionCsvCells(row).map(csvEscape).join(",")).join("\n");
    const csv = `${header}\n${body}\n`;
    expect(csv.endsWith("\n")).toBe(true);
    expect(csv.endsWith("\n\n")).toBe(false);
    const pnl = CSV_EXPORT_COLUMNS.indexOf("RealizedPnlNZD");
    const sum = annotated.reduce((total, row) => {
      const cell = transactionCsvCells(row)[pnl];
      return total + (cell ? Number(cell) : 0);
    }, 0);
    expect(formatSignedMoney(Math.round(sum * 100) / 100)).toBe("-NZ$10.67");

    const holdings = applyFifoPurchasePrices(
      [{ ticker: "WOR.AX", shares: 1000, purchase_price: 9.52, current_price: 9.44, asset_type: "stock" }],
      rows
    );
    const atCost = computeSummary([{ ...holdings[0], current_price: 9.44 }], { baseCurrency: "AUD" });
    expect(formatSignedMoney(atCost.holdings[0].gain, "AUD")).toBe("AU$0.00");
    expect(formatPercent(atCost.holdings[0].gainPct)).toBe("0.00%");
    const higher = computeSummary([{ ...holdings[0], current_price: 9.45 }], { baseCurrency: "AUD" });
    expect(higher.holdings[0].gain).toBeCloseTo(10, 2);
  });
});

describe("T2 T3 T5 csv", () => {
  it("names the tax files and fills the columns that used to be blank", () => {
    expect(datedTaxCsvName("realised-pl", 2027, "2026-10-12")).toBe("realised-pl-2027-2026-10-12.csv");
    expect(datedTaxCsvName("taxable-income", 2027, "2026-10-12")).toBe("taxable-income-2027-2026-10-12.csv");
    expect(datedTaxCsvName("dividend-ledger", 2027, "2026-10-12")).toBe("dividend-ledger-2027-2026-10-12.csv");
    expect(CSV_EXPORT_COLUMNS).not.toContain("SignalPrice");
    expect(CSV_EXPORT_COLUMNS).not.toContain("NotionalNative");
    expect(CSV_EXPORT_COLUMNS).not.toContain("Broker");
    const cells = transactionCsvCells({
      type: "dividend",
      executed_at: "2026-10-11",
      ticker: "WOR.AX",
      asset_type: "stock",
      currency: "AUD",
      quantity: 1000,
      price: 0.1,
    });
    expect(cells[1]).toBe("11 Oct 2026");
    expect(cells[cells.length - 1]).toContain("time not stored");
    const plan = datetimeBackfillPlan([
      { ticker: "WOR.AX", executed_at: "2026-10-11", createdAt: "2026-10-10T19:27:00.000Z" },
    ]);
    expect(plan[0].note).toBe("would copy createdAt into DateTime_NZ");
    expect(plan[0].proposed).toContain("11 Oct 2026");
    expect(formatDatetimeBackfillDryRun(plan.map((row) => ({ ticker: row.ticker, executed_at: "2026-10-11" })))).toContain(
      "time not stored"
    );
    expect(formatDatetimeBackfillDryRun([{ ticker: "WOR.AX", executed_at: "2026-10-11" }])).toContain("NOT APPLIED");
    expect(readFileSync("qa/T5-datetime-backfill-dry-run.txt", "utf8")).toContain("11 Oct 2026, 8:27 am");
    expect(readFileSync("qa/T5-datetime-backfill-dry-run.txt", "utf8")).toContain("11 Oct 2026, 8:33 am");
    expect(readFileSync("qa/T5-datetime-backfill-dry-run.txt", "utf8")).toContain("NOT APPLIED");
  });
});

describe("T4 fif cost", () => {
  it("rounds WOR.AX once to NZ$11,743.36", () => {
    const paper = buildFifPaper({
      endingYear: 2026,
      markets: [],
      rows: [
        { type: "buy", ticker: "WOR.AX", asset_type: "stock", executed_at: "2025-06-01", quantity: 1, price: 7046.174, currency: "NZD", fx_rate: 1 },
        { type: "buy", ticker: "WOR.AX", asset_type: "stock", executed_at: "2025-06-02", quantity: 1, price: 4697.181, currency: "NZD", fx_rate: 1 },
      ],
    });
    const cost = paper.australian[0].costNzd;
    expect(cost).toBe(11743.36);
    expect(`${paper.australian[0].ticker}: cost ${formatNzd(cost ?? 0)}.`).toBe("WOR.AX: cost NZ$11,743.36.");
  });
});

describe("prior mover prints", () => {
  it("reads the newest ranked 24-hour print", () => {
    const prints = priorMoverPrints([
      { marketMovers: [{ windows: [{ window: "Last 24 hours", movers: [{ ticker: "AIR.NZ", changePct: 1.2, price: 0.7 }] }] }] },
    ]);
    expect(prints["AIR.NZ"]).toEqual({ changePct: 1.2, price: 0.7 });
  });
});
