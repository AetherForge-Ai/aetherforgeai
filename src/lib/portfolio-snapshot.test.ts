import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { buildDividendRecord, withDividendNotes } from "@/lib/dividend-ledger";
import { cashFromLedgerRows } from "@/lib/ledger-cash-lines";
import { roundMoney } from "@/lib/currency";
import { fifoRemainingShareQty, fifoRemainingUnitCosts } from "@/lib/tax-realised";
import type { TaxLedgerRow } from "@/lib/taxable-income";
import {
  buildPortfolioSnapshot,
  checkInvariants,
  countNewImportRows,
  filterSnapshot,
  pageLedger,
  snapshotAsReturnSplit,
  type SnapshotLedgerRow,
  type SnapshotMark,
} from "@/lib/portfolio-snapshot";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function row(partial: SnapshotLedgerRow): SnapshotLedgerRow {
  return {
    asset_type: "stock",
    currency: "NZD",
    fx_rate: 1,
    fees: 0,
    fees_nzd: 0,
    ...partial,
  };
}

const dividend = buildDividendRecord({
  grossNative: 0.25,
  imputationNzd: 0,
  withholdingNative: 0.04,
  drpNative: 0,
  currency: "USD",
  fx: 1.7813,
});
if (!dividend.ok) throw new Error(dividend.message);

/** The signed-in research book from the 13 Oct 2026 crawl. Cash impacts are the stored NZ$ figures. */
const researchBook: SnapshotLedgerRow[] = [
  row({
    _id: "dep-sep",
    type: "deposit",
    trade_date: "2026-09-01",
    cash_nzd: 434.69,
    total: 434.69,
    ticker: "",
  }),
  row({
    _id: "aapl-buy-sep",
    type: "buy",
    ticker: "AAPL",
    asset_name: "Apple Inc.",
    trade_date: "2026-09-01",
    quantity: 2,
    price: 330,
    currency: "USD",
    fx_rate: 1.6975,
    cash_nzd: -1120.35,
    total: -1120.35,
  }),
  row({
    _id: "dep-msft",
    type: "deposit",
    trade_date: "2026-09-02",
    cash_nzd: 720.72,
    total: 720.72,
    ticker: "",
  }),
  row({
    _id: "msft-buy",
    type: "buy",
    ticker: "MSFT",
    trade_date: "2026-09-02",
    quantity: 1,
    price: 420,
    currency: "USD",
    fx_rate: 1.716,
    cash_nzd: -720.72,
    total: -720.72,
  }),
  row({
    _id: "dep-fph",
    type: "deposit",
    trade_date: "2026-09-15",
    cash_nzd: 345,
    total: 345,
    ticker: "",
  }),
  row({
    _id: "fph-buy",
    type: "buy",
    ticker: "FPH.NZ",
    trade_date: "2026-09-15",
    quantity: 10,
    price: 34.5,
    cash_nzd: -345,
    total: -345,
  }),
  row({
    _id: "msft-sell",
    type: "sell",
    ticker: "MSFT",
    trade_date: "2026-09-20",
    quantity: 1,
    price: 430,
    currency: "USD",
    fx_rate: 1.7511,
    cash_nzd: 752.97,
    total: 752.97,
  }),
  row({
    _id: "dep-oct",
    type: "deposit",
    trade_date: "2026-10-11",
    cash_nzd: 1000,
    total: 1000,
    ticker: "",
  }),
  row({
    _id: "aapl-buy-oct",
    type: "buy",
    ticker: "AAPL",
    asset_name: "Apple Inc.",
    trade_date: "2026-10-11",
    quantity: 1,
    price: 336.64,
    currency: "USD",
    fx_rate: 1.782,
    cash_nzd: -599.89,
    total: -599.89,
  }),
  row({
    _id: "div-aapl",
    type: "dividend",
    ticker: "AAPL",
    asset_name: "Apple Inc.",
    trade_date: "2026-10-11",
    currency: "USD",
    fx_rate: 1.7813,
    cash_nzd: 0.38,
    total: 0.38,
    notes: withDividendNotes("", dividend.parts),
  }),
  row({
    _id: "aapl-sell-05",
    type: "sell",
    ticker: "AAPL",
    trade_date: "2026-10-11",
    quantity: 0.5,
    price: 336.64,
    currency: "USD",
    fx_rate: 1.782,
    cash_nzd: 299.95,
    total: 299.95,
  }),
  row({
    _id: "gold-buy",
    type: "buy",
    ticker: "GOLD",
    asset_type: "metal",
    asset_name: "Gold bullion",
    trade_date: "2026-10-11",
    quantity: 0.01,
    price: 7476.62,
    cash_nzd: -74.77,
    total: -74.77,
  }),
  row({
    _id: "aapl-sell-01",
    type: "sell",
    ticker: "AAPL",
    trade_date: "2026-10-11",
    quantity: 0.1,
    price: 336.64,
    currency: "USD",
    fx_rate: 1.782,
    cash_nzd: 59.99,
    total: 59.99,
  }),
];

const valuedMarks: SnapshotMark[] = [
  { ticker: "AAPL", price: 336.64, currency: "USD", source: "Test price", asOf: "2026-10-13" },
  { ticker: "FPH.NZ", price: 34.5, currency: "NZD", source: "Test price", asOf: "2026-10-13" },
  { ticker: "GOLD", price: 7476.62, currency: "NZD", assetType: "metal", source: "Test price", asOf: "2026-10-13" },
];

function valuedBook(fxUsd = 1.782) {
  return buildPortfolioSnapshot({
    rows: researchBook,
    marks: valuedMarks,
    fxNow: { USD: fxUsd, NZD: 1 },
    fxSourced: true,
    fxSource: "Test rate",
    fxAsOf: "2026-10-13",
    asOf: "2026-10-13T00:00:00.000Z",
    priceSource: "Test price",
  });
}

describe("portfolio snapshot calc engine", () => {
  it("A1 replays cash to 752.97 from deposits, buys, sells, and the net dividend", () => {
    const snapshot = valuedBook();
    expect(snapshot.cashReplayNzd).toBe(752.97);
    expect(snapshot.kpis.cash.value).toBe(752.97);
    expect(snapshot.kpis.cash.display).toBe("NZ$752.97");
    expect(snapshot.kpis.contributions.value).toBe(2500.41);
    expect(cashFromLedgerRows(researchBook)).toBe(752.97);
    const deposits = 434.69 + 720.72 + 345 + 1000;
    const buys = 1120.35 + 720.72 + 345 + 599.89 + 74.77;
    const sells = 752.97 + 299.95 + 59.99;
    expect(roundMoney(deposits - buys + sells + 0.38)).toBe(752.97);
    expect(snapshot.cashWarning).toBeNull();
  });

  it("A2 sums realised profit to 56.08", () => {
    const snapshot = valuedBook();
    const sells = snapshot.ledger.filter((line) => line.type === "sell");
    const byId = Object.fromEntries(sells.map((line) => [line.id, line.realisedNzd]));
    expect(byId["msft-sell"]).toBe(32.25);
    expect(byId["aapl-sell-05"]).toBe(19.86);
    expect(byId["aapl-sell-01"]).toBe(3.97);
    expect(roundMoney(32.25 + 19.86 + 3.97)).toBe(56.08);
    expect(snapshot.kpis.realised.value).toBe(56.08);
  });

  it("A3 uses dividend net 0.38 and keeps gross 0.45 and withholding 0.07", () => {
    expect(dividend.ok && dividend.parts.grossNzd).toBe(0.45);
    expect(dividend.ok && dividend.parts.withholdingNzd).toBe(0.07);
    expect(dividend.ok && dividend.parts.netCashNzd).toBe(0.38);
    const snapshot = valuedBook();
    expect(snapshot.kpis.incomeGross.value).toBe(0.45);
    expect(snapshot.kpis.incomeWithholding.value).toBe(0.07);
    expect(snapshot.kpis.income.value).toBe(0.38);
    expect(snapshot.kpis.income.display).toBe("NZ$0.38");
  });

  it("A4 consumes the 1 Sep AAPL lot first and leaves 2.4 open", () => {
    const snapshot = valuedBook();
    const aapl = snapshot.groups.find((group) => group.id === "shares")?.positions.find((position) => position.ticker === "AAPL");
    expect(aapl?.quantity).toBeCloseTo(2.4, 6);
    expect(aapl?.lots.map((lot) => ({ day: lot.acquired, qty: lot.quantity, fx: lot.fx }))).toEqual([
      { day: "2026-09-01", qty: 1.4, fx: 1.6975 },
      { day: "2026-10-11", qty: 1, fx: 1.782 },
    ]);
    expect(aapl?.lots[0]?.acquiredLabel).toBe("1 Sep 2026");
  });

  it("A5 splits the closed MSFT sale into price and exchange-rate parts that add to 32.25", () => {
    const snapshot = valuedBook();
    const msft = snapshot.groups.find((group) => group.id === "shares")?.positions.find((position) => position.ticker === "MSFT");
    expect(msft?.closed).toBe(true);
    expect(msft?.quantity).toBe(0);
    expect(msft?.realised.value).toBe(32.25);
    expect(msft?.realisedFx.value).toBe(14.74);
    expect(msft?.realisedPrice.value).toBe(17.51);
    expect(roundMoney((msft?.realisedPrice.value || 0) + (msft?.realisedFx.value || 0))).toBe(32.25);
    const price = 1 * (430 - 420) * 1.7511;
    const fx = 1 * 420 * (1.7511 - 1.716);
    expect(price + fx).toBeCloseTo(32.253, 3);
    expect(roundMoney(price + fx)).toBe(32.25);
  });

  it("A6 keeps one net worth and one snapshot time across filters", () => {
    const snapshot = valuedBook();
    const shares = filterSnapshot(snapshot, { assetClass: "shares" });
    const crypto = filterSnapshot(snapshot, { assetClass: "crypto" });
    const closed = filterSnapshot(snapshot, { open: "closed" });
    expect(shares.kpis.netWorth.value).toBe(snapshot.kpis.netWorth.value);
    expect(crypto.kpis.netWorth.value).toBe(snapshot.kpis.netWorth.value);
    expect(closed.kpis.holdingsValue.value).toBe(snapshot.kpis.holdingsValue.value);
    expect(shares.asOf).toBe(snapshot.asOf);
    expect(crypto.asOf).toBe(snapshot.asOf);
    expect(shares.filteredNote).toBeTruthy();
    expect(snapshot.filteredNote).toBeNull();
    expect(snapshot.asOfLabel).toBe("13 Oct 2026");
  });

  it("A7 marks the book reconciled when I1–I7 pass", () => {
    const snapshot = valuedBook();
    const invariants = checkInvariants(snapshot);
    expect(invariants.map((item) => item.id)).toEqual(["I1", "I2", "I3", "I4", "I5", "I6", "I7"]);
    expect(invariants.every((item) => item.ok)).toBe(true);
    expect(snapshot.reconciliation.ok).toBe(true);
    expect(snapshot.reconciliation.label).toBe("✓ Reconciled");
    expect(snapshot.grand.value).toBe(snapshot.kpis.netWorth.value);
    const groupSum = roundMoney(snapshot.groups.reduce((total, group) => total + (group.marketValue.value || 0), 0));
    expect(groupSum).toBe(snapshot.grand.value);
    const segments = roundMoney(
      (snapshot.kpis.capital.value || 0) +
        (snapshot.kpis.income.value || 0) +
        (snapshot.kpis.currency.value || 0) +
        (snapshot.kpis.fees.value || 0)
    );
    expect(segments).toBe(snapshot.kpis.totalReturn.value);
  });

  it("A8 adds realised exchange-rate profit to the open-lot currency effect", () => {
    const openOnly = 100 * 10 * (1.64005 - 1.6);
    expect(openOnly).toBeCloseTo(40.05, 6);
    const msftFx = 1 * 420 * (1.7511 - 1.716);
    expect(msftFx).toBeCloseTo(14.742, 6);
    const snapshot = buildPortfolioSnapshot({
      rows: [
        row({
          _id: "buy",
          type: "buy",
          ticker: "USD",
          trade_date: "2026-01-02",
          quantity: 100,
          price: 10,
          currency: "USD",
          fx_rate: 1.6,
          cash_nzd: -1600,
          total: -1600,
        }),
        row({
          _id: "dep",
          type: "deposit",
          trade_date: "2026-01-02",
          cash_nzd: 2320.72,
          total: 2320.72,
          ticker: "",
        }),
        row({
          _id: "msft-buy",
          type: "buy",
          ticker: "MSFT",
          trade_date: "2026-02-02",
          quantity: 1,
          price: 420,
          currency: "USD",
          fx_rate: 1.716,
          cash_nzd: -720.72,
          total: -720.72,
        }),
        row({
          _id: "msft-sell",
          type: "sell",
          ticker: "MSFT",
          trade_date: "2026-06-02",
          quantity: 1,
          price: 430,
          currency: "USD",
          fx_rate: 1.7511,
          cash_nzd: 752.97,
          total: 752.97,
        }),
      ],
      marks: [{ ticker: "USD", price: 10, currency: "USD", source: "Test price" }],
      fxNow: { USD: 1.64005 },
      fxSourced: true,
      fxSource: "Test rate",
      asOf: "2026-10-13",
    });
    expect(snapshot.kpis.currency.value).toBe(roundMoney(openOnly + msftFx));
    expect(snapshot.kpis.currency.value).not.toBe(roundMoney(openOnly));
    expect(snapshot.kpis.currency.maths.inputs.join(" ")).toContain("Realised");
    expect(snapshot.kpis.currency.display).toBe("NZ$54.79");
  });

  it("A9 pages 13 ledger rows as 1–5 of 13, 1–25, and show all", () => {
    const snapshot = valuedBook();
    expect(snapshot.ledger).toHaveLength(13);
    const five = pageLedger(snapshot.ledger, { page: 1, pageSize: 5 });
    expect(five.label).toBe("1–5 of 13");
    expect(five.rows).toHaveLength(5);
    expect(five.pageCount).toBe(3);
    const twentyFive = pageLedger(snapshot.ledger, { page: 1, pageSize: 25 });
    expect(twentyFive.label).toBe("1–13 of 13");
    expect(twentyFive.rows).toHaveLength(13);
    const all = pageLedger(snapshot.ledger, { showAll: true });
    expect(all.label).toBe("1–13 of 13");
    expect(all.rows).toHaveLength(13);
    expect(all.showAll).toBe(true);
  });

  it("leaves a missing price and a missing rate as an em dash", () => {
    const missingPrice = buildPortfolioSnapshot({
      rows: researchBook,
      marks: valuedMarks.map((mark) => (mark.ticker === "AAPL" ? { ...mark, price: null, reason: "No price is stored for this holding." } : mark)),
      fxNow: { USD: 1.782 },
      fxSourced: true,
      asOf: "2026-10-13",
    });
    expect(missingPrice.kpis.holdingsValue.value).toBeNull();
    expect(missingPrice.kpis.holdingsValue.display).toBe("—");
    expect(missingPrice.kpis.holdingsValue.reason).toMatch(/price/i);
    expect(missingPrice.kpis.netWorth.display).toBe("—");
    expect(missingPrice.reconciliation.label).toBe("⚠ Incomplete");
    expect(snapshotAsReturnSplit(missingPrice)).toBeNull();

    const missingFx = buildPortfolioSnapshot({
      rows: researchBook,
      marks: valuedMarks,
      fxSourced: false,
      asOf: "2026-10-13",
    });
    expect(missingFx.kpis.netWorth.display).toBe("—");
    expect(missingFx.kpis.netWorth.reason).toMatch(/exchange[- ]rate|price/i);
  });

  it("does not clamp negative cash", () => {
    const snapshot = buildPortfolioSnapshot({
      rows: [
        row({ _id: "w", type: "withdraw", trade_date: "2026-10-01", cash_nzd: -20, total: -20, ticker: "" }),
      ],
      fxSourced: true,
      asOf: "2026-10-13",
    });
    expect(snapshot.kpis.cash.value).toBe(-20);
    expect(snapshot.cashWarning).toMatch(/below zero/i);
  });

  it("re-imports the same rows as zero new rows", () => {
    const snapshot = valuedBook();
    expect(countNewImportRows(snapshot.importKeys, snapshot.importKeys)).toBe(0);
    expect(countNewImportRows(snapshot.importKeys, [...snapshot.importKeys, "new-row"])).toBe(1);
  });

  it("keeps per-year return off until the period is 90 days", () => {
    const snapshot = valuedBook();
    expect(snapshot.kpis.annualisedPct.value).toBeNull();
    expect(snapshot.kpis.annualisedPct.reason).toMatch(/90 days/);
    expect(snapshot.kpis.benchmark.display).toBe("—");
    expect(snapshot.kpis.benchmark.reason).toMatch(/benchmark/i);
    expect(snapshot.kpis.today.display).toBe("—");
  });

  it("keeps the header, the group cards, and the positions on the same live marks", () => {
    const snapshot = buildPortfolioSnapshot({
      rows: [
        row({
          _id: "dep",
          type: "deposit",
          trade_date: "2026-01-02",
          cash_nzd: 20000,
          total: 20000,
          ticker: "",
        }),
        row({
          _id: "aapl",
          type: "buy",
          ticker: "AAPL",
          trade_date: "2026-01-02",
          quantity: 2,
          price: 100.125,
          currency: "USD",
          fx_rate: 1.6,
          cash_nzd: -320.4,
          total: -320.4,
        }),
        row({
          _id: "btc",
          type: "buy",
          ticker: "BTC",
          asset_type: "crypto",
          trade_date: "2026-02-02",
          quantity: 0.15,
          price: 50123.45,
          currency: "USD",
          fx_rate: 1.62,
          cash_nzd: -12179.99835,
          total: -12179.99835,
        }),
        row({
          _id: "gold",
          type: "buy",
          ticker: "GOLD",
          asset_type: "metal",
          trade_date: "2026-03-02",
          quantity: 0.25,
          price: 4123.33,
          cash_nzd: -1030.8325,
          total: -1030.8325,
        }),
      ],
      marks: [
        { ticker: "AAPL", price: 180.337, currency: "USD", source: "Equity quote", asOf: "2026-10-13" },
        { ticker: "BTC", price: 64012.5, currency: "USD", assetType: "crypto", source: "Crypto quote", asOf: "2026-10-13" },
        { ticker: "GOLD", price: 7601.27, currency: "NZD", assetType: "metal", source: "Gold spot feed", asOf: "2026-10-13" },
      ],
      fxNow: { USD: 1.7513, NZD: 1 },
      fxSourced: true,
      fxSource: "Test rate",
      asOf: "2026-10-13",
    });
    const header = snapshot.kpis.holdingsValue.value;
    const cards = snapshot.groups.filter((group) => group.id !== "cash");
    const cardSum = roundMoney(cards.reduce((total, group) => total + (group.marketValue.value || 0), 0));
    const positionSum = roundMoney(
      cards
        .flatMap((group) => group.positions)
        .filter((position) => position.quantity > 1e-9)
        .reduce((total, position) => total + (position.marketValue.value || 0), 0)
    );
    expect(header).not.toBeNull();
    expect(cardSum).toBe(header);
    expect(positionSum).toBe(header);
    expect(snapshot.groups.find((group) => group.id === "shares")?.positions[0]?.marketPriceLocal).toBe(180.337);
    expect(snapshot.groups.find((group) => group.id === "crypto")?.positions[0]?.marketPriceLocal).toBe(64012.5);
    expect(snapshot.kpis.netWorth.value).toBe(roundMoney((header || 0) + (snapshot.kpis.cash.value || 0)));
  });

  it("prices open lots the same way as the stocks FIFO book", () => {
    const air: TaxLedgerRow[] = [
      { _id: "b1", type: "buy", ticker: "AIR.NZ", quantity: 10, price: 10, trade_date: "2026-01-01", currency: "NZD", fx_rate: 1, asset_type: "stock" },
      { _id: "b2", type: "buy", ticker: "AIR.NZ", quantity: 10, price: 20, trade_date: "2026-02-01", currency: "NZD", fx_rate: 1, asset_type: "stock" },
      { _id: "s1", type: "sell", ticker: "AIR.NZ", quantity: 10, price: 18, trade_date: "2026-03-01", currency: "NZD", fx_rate: 1, asset_type: "stock" },
    ];
    // Newest same-day buy is first, which is the order loadLedger hands the stocks route.
    const sameDay: TaxLedgerRow[] = [
      { _id: "late", type: "buy", ticker: "ZZ", quantity: 1, price: 30, trade_date: "2026-10-01", currency: "NZD", fx_rate: 1, asset_type: "stock" },
      { _id: "early", type: "buy", ticker: "ZZ", quantity: 1, price: 10, trade_date: "2026-10-01", currency: "NZD", fx_rate: 1, asset_type: "stock" },
      { _id: "sell", type: "sell", ticker: "ZZ", quantity: 1, price: 20, trade_date: "2026-10-02", currency: "NZD", fx_rate: 1, asset_type: "stock" },
    ];
    for (const rows of [researchBook as TaxLedgerRow[], air, sameDay]) {
      const costs = fifoRemainingUnitCosts(rows);
      const quantities = fifoRemainingShareQty(rows);
      const snapshot = buildPortfolioSnapshot({
        rows: rows as SnapshotLedgerRow[],
        marks: [...costs.keys()].map((ticker) => ({ ticker, price: 1, currency: "NZD", source: "Test price" })),
        fxNow: { NZD: 1, USD: 1.782 },
        fxSourced: true,
        asOf: "2026-10-13",
      });
      const open = snapshot.groups.flatMap((group) => group.positions).filter((position) => position.quantity > 1e-9);
      expect(open.map((position) => position.ticker).sort()).toEqual([...quantities.keys()].sort());
      for (const position of open) {
        expect(position.quantity).toBeCloseTo(quantities.get(position.ticker) || 0, 6);
        expect(position.averageCostLocal).toBeCloseTo(costs.get(position.ticker) || 0, 6);
      }
    }
    const sameDaySnap = buildPortfolioSnapshot({
      rows: sameDay as SnapshotLedgerRow[],
      marks: [{ ticker: "ZZ", price: 20, currency: "NZD" }],
      fxNow: { NZD: 1 },
      fxSourced: true,
      asOf: "2026-10-13",
    });
    const zz = sameDaySnap.groups.flatMap((group) => group.positions).find((position) => position.ticker === "ZZ");
    expect(zz?.averageCostLocal).toBeCloseTo(10, 6);
    expect(zz?.quantity).toBeCloseTo(1, 6);
  });

  it("keeps a holding id only when one id is known for the ticker", () => {
    const buy = row({
      _id: "one-buy",
      type: "buy",
      ticker: "AAA",
      trade_date: "2026-10-01",
      quantity: 1,
      price: 10,
      cash_nzd: -10,
      total: -10,
    });
    const one = buildPortfolioSnapshot({
      rows: [buy],
      marks: [{ ticker: "AAA", price: 12, currency: "NZD", holdingId: "stock-aaa" }],
      fxNow: { NZD: 1 },
      fxSourced: true,
      asOf: "2026-10-13",
    });
    expect(one.groups.find((group) => group.id === "shares")?.positions[0]?.holdingId).toBe("stock-aaa");

    const two = buildPortfolioSnapshot({
      rows: [buy],
      marks: [
        { ticker: "AAA", price: 12, currency: "NZD", holdingId: "stock-aaa" },
        { ticker: "AAA", price: 13, currency: "NZD", holdingId: "stock-aaa-2" },
      ],
      fxNow: { NZD: 1 },
      fxSourced: true,
      asOf: "2026-10-13",
    });
    expect(two.groups.find((group) => group.id === "shares")?.positions[0]?.holdingId).toBeNull();

    const metal = buildPortfolioSnapshot({
      rows: [],
      extras: [
        {
          id: "pm-gold",
          ticker: "GOLD",
          assetClass: "metals",
          quantity: 1,
          costPrice: 100,
          currency: "NZD",
          fxAtCost: 1,
          markPrice: 110,
        },
      ],
      fxNow: { NZD: 1 },
      fxSourced: true,
      asOf: "2026-10-13",
    });
    expect(metal.groups.find((group) => group.id === "metals")?.positions[0]?.holdingId).toBe("pm-gold");

    const clash = buildPortfolioSnapshot({
      rows: [
        row({
          _id: "gold-buy",
          type: "buy",
          ticker: "GOLD",
          asset_type: "metal",
          trade_date: "2026-10-01",
          quantity: 1,
          price: 100,
          cash_nzd: -100,
          total: -100,
        }),
      ],
      marks: [{ ticker: "GOLD", price: 110, currency: "NZD", assetType: "metal", holdingId: "stock-gold" }],
      extras: [
        {
          id: "pm-gold",
          ticker: "GOLD",
          assetClass: "metals",
          quantity: 1,
          costPrice: 100,
          currency: "NZD",
          fxAtCost: 1,
          markPrice: 110,
        },
      ],
      fxNow: { NZD: 1 },
      fxSourced: true,
      asOf: "2026-10-13",
    });
    expect(clash.groups.flatMap((group) => group.positions).find((position) => position.ticker === "GOLD")?.holdingId).toBeNull();
  });

  it("does not mention GST and the dashboard reads this snapshot", () => {
    const source = read("src/lib/portfolio-snapshot.ts");
    const route = read("src/app/api/portfolio/snapshot/route.ts");
    const dash = read("src/components/dashboard/PortfolioDashboard.tsx");
    expect(source.toLowerCase()).not.toContain("gst");
    expect(source).not.toMatch(/gpt|claude|gemini|openai/i);
    expect(dash).toContain("/api/portfolio/snapshot");
    expect(dash).toContain("rowsFromSnapshot");
    expect(route).toContain("buildPortfolioSnapshot");
    expect(route).toContain("mergeFreshQuantities");
    expect(route).toContain("fetchLiveQuotes");
    expect(route).toContain("fetchCryptoQuotes");
    expect(route).toContain("raceQuoteFetch");
    expect(route).toContain("SNAPSHOT_QUOTE_WAIT_MS");
    expect(route).toContain("bookCacheEpoch");
    expect(route).toContain("readBookCache");
    expect(route).toContain("writeBookCache");
    expect(route).toContain('get("fresh")');
    expect(route).toContain("STORED_HOLDING_PRICE");
    expect(route).toContain("priceFromQuoteOrStored");
    expect(route).toContain("holdingId: row._id");
    expect(read("src/lib/snapshot-quotes.ts")).toContain('STORED_HOLDING_PRICE = "Stored holding price"');
    expect(route).toContain("Silver spot feed");
    expect(route).toContain("Gold spot feed");
    expect(route).not.toContain("spotPx");
    expect(read("src/lib/session-owner.ts")).not.toContain("/api/portfolio/snapshot");
    expect(route).toContain("requestClaimsOtherUser");
    expect(route).toContain("x-af-user-id");
  });
});
