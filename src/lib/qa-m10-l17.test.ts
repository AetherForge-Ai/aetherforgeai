import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  formatCleanNumber,
  formatDisplayDate,
  formatDisplayDateTime,
  formatDriftPp,
  formatMoney,
  formatNzd,
  formatSignedMoney,
  formatSignedPercent,
  freshQuotedFill,
  roundMoney,
  sameQuotedUnit,
} from "@/lib/currency";
import { dateOnlyInstant } from "@/lib/auckland-noon";
import { formatLedgerDateTime, lotCivilDay, resolveExecutedInstant } from "@/lib/executed-at";
import { aucklandDateISO } from "@/lib/fill-integrity";
import { computeSummary } from "@/lib/portfolio";
import { SECURITY_HEADERS } from "@/lib/security-headers";
import { distributionLabel } from "@/lib/income-label";
import { earlierCivilDay, exceedsAvailableCash, parseTradeNumber, transactionProblems } from "@/lib/transaction-rules";
import { csvFeesNzd, csvFxSource, csvMoney, csvNotes, csvUnitPrice, transactionCsvCells } from "@/lib/transaction-csv";
import { taxBookSummary } from "@/lib/tax-book";
import { onboardingProgress } from "@/lib/onboarding-steps";

const BASE = { NZD: 1, USD: 1.67, AUD: 1.1 };

describe("M10 dates", () => {
  it("prints Auckland wall time without a leading zero or Sept", () => {
    expect(formatDisplayDateTime("2026-10-10T02:47:53.208Z")).toBe("10 Oct 2026, 3:47 pm");
    expect(formatDisplayDate("2026-09-02")).toBe("2 Sep 2026");
    expect(formatDisplayDate("2026-09-02")).not.toMatch(/Sept/);
  });

  it("hides a clock that was never chosen", () => {
    expect(formatLedgerDateTime("2026-10-10")).toBe("10 Oct 2026");
    expect(formatLedgerDateTime("2026-10-10T00:00:00.000Z")).toBe("10 Oct 2026");
    expect(formatLedgerDateTime("2026-10-09T12:00:00.000Z")).toBe("9 Oct 2026");
    expect(formatLedgerDateTime("2026-10-10T02:47:53.208Z")).toBe("10 Oct 2026, 3:47 pm");
    const now = new Date("2026-10-10T02:00:00.000Z");
    const today = resolveExecutedInstant("2026-10-10", now);
    expect(today.hasClock).toBe(true);
    expect(today.stored).toEqual(now);
    const past = resolveExecutedInstant("2026-10-01", now);
    expect(past.hasClock).toBe(false);
    expect(past.stored).toBe("2026-10-01T12:00:00+13:00");
    expect(past.civilDay).toBe("2026-10-01");
    expect(formatLedgerDateTime(String(past.stored))).toBe("1 Oct 2026");
    expect(formatDisplayDate(String(past.stored))).toBe("1 Oct 2026");
    expect(formatLedgerDateTime("2026-09-30T23:00:00.000Z")).toBe("1 Oct 2026");
    expect(dateOnlyInstant("2026-07-01")).toBe("2026-07-01T12:00:00+12:00");
    expect(lotCivilDay(String(past.stored))).toBe("2026-10-01");
    const noon = resolveExecutedInstant(new Date("2026-10-09T12:00:00.000Z"), now);
    expect(noon.hasClock).toBe(false);
    expect(noon.civilDay).toBe("2026-10-09");
    expect(noon.stored).toBe("2026-10-09T12:00:00+13:00");
    expect(formatLedgerDateTime(String(noon.stored))).toBe("9 Oct 2026");
  });
});

describe("M11 money", () => {
  it("rounds book money to cents and never prints negative zero", () => {
    expect(roundMoney(-0.004)).toBe(0);
    expect(Object.is(roundMoney(-0.004), -0)).toBe(false);
    expect(formatSignedPercent(-0.001)).toBe("0.00%");
    expect(formatSignedMoney(-0.004)).toBe("NZ$0.00");
    expect(formatSignedMoney(-0.08008, "AUD")).toBe("-AU$0.08");
    expect(formatNzd(0)).toBe("NZ$0.00");
    expect(formatNzd(100000)).toBe("NZ$100,000.00");
    expect(formatDriftPp(-55)).toBe("-55.0pp");
    expect(formatDriftPp(0)).toBe("0.0pp");
  });

  it("keeps sub-cent digits when an explicit width is wider than 2", () => {
    expect(formatMoney(0.0000040399, "USD", { decimals: 6 })).toBe("US$0.000004");
    expect(formatMoney(0.0000040399, "USD", { decimals: 8 })).toBe("US$0.00000404");
    expect(formatMoney(0.00002797, "USD", { decimals: 6 })).toBe("US$0.000028");
    expect(formatMoney(0.00002797, "USD", { decimals: 8 })).toBe("US$0.00002797");
    expect(formatMoney(17.456789, "USD", { decimals: 8 })).toBe("US$17.45678900");
    expect(formatMoney(-1e-12, "USD", { decimals: 8 })).toBe("US$0.00000000");
    expect(formatMoney(-1e-12, "USD", { decimals: 8 }).startsWith("-")).toBe(false);
  });

  it("zeros a same-day fill only when the stored unit price matches", () => {
    const session = new Date("2026-10-10T01:00:00.000Z");
    expect(sameQuotedUnit(9.44, 9.43996)).toBe(true);
    expect(sameQuotedUnit(10, 10.004)).toBe(false);
    expect(sameQuotedUnit(10, 10.0000004)).toBe(true);
    expect(freshQuotedFill(10, 10.0000004, "2026-10-10", session)).toBe(true);
    expect(freshQuotedFill(10, 10.0000004, "2026-10-09", session)).toBe(false);
    expect(freshQuotedFill(10, 10.004, "2026-10-10", session)).toBe(false);
    expect(freshQuotedFill(10, 10, null, session)).toBe(false);

    const fresh = computeSummary(
      [
        {
          _id: "fresh",
          ticker: "ABC.NZ",
          asset_type: "stock",
          shares: 100000,
          purchase_price: 10,
          current_price: 10.0000004,
          purchase_date: aucklandDateISO(),
        },
      ],
      { baseCurrency: "NZD", fxToNZD: BASE }
    );
    expect(fresh.holdings[0].gain).toBe(0);
    expect(formatSignedMoney(fresh.totalGain)).toBe("NZ$0.00");

    const older = computeSummary(
      [
        {
          _id: "older",
          ticker: "ABC.NZ",
          asset_type: "stock",
          shares: 100000,
          purchase_price: 10,
          current_price: 10.0000004,
          purchase_date: "2020-01-02",
        },
      ],
      { baseCurrency: "NZD", fxToNZD: BASE }
    );
    expect(older.holdings[0].gain).toBe(0.04);
  });

  it("keeps a 0.004 gap on 100,000 shares", () => {
    const summary = computeSummary(
      [
        {
          _id: "wide",
          ticker: "ABC.NZ",
          asset_type: "stock",
          shares: 100000,
          purchase_price: 10,
          current_price: 10.004,
          purchase_date: aucklandDateISO(),
        },
      ],
      { baseCurrency: "NZD", fxToNZD: BASE }
    );
    expect(summary.holdings[0].gain).toBe(400);
    expect(formatSignedMoney(summary.holdings[0].gain)).toBe("+NZ$400.00");
  });

  it("zeros a fresh WOR buy when the live print matches the fill at 4 decimals", () => {
    const summary = computeSummary(
      [
        {
          _id: "wor",
          ticker: "WOR.AX",
          asset_type: "stock",
          shares: 1000,
          purchase_price: 9.44,
          current_price: 9.43996,
          purchase_date: aucklandDateISO(),
        },
      ],
      { baseCurrency: "NZD", fxToNZD: { NZD: 1, USD: 1.67, AUD: 1.244 } }
    );
    const row = summary.holdings[0];
    expect(row.currency).toBe("AUD");
    expect(row.gain).toBe(0);
    expect(formatSignedMoney(row.gain, "AUD")).toBe("AU$0.00");
    expect(formatSignedPercent(row.gainPct)).toBe("0.00%");
    expect(row.baseValue).toBe(roundMoney(1000 * 9.44 * 1.244));
  });

  it("does not print a non-NZ$ sub-cent position gain as US$0.00", () => {
    const summary = computeSummary(
      [
        {
          _id: "pepe",
          ticker: "PEPE",
          asset_type: "crypto",
          shares: 1,
          purchase_price: 0.00001,
          current_price: 0.0000140399,
          purchase_date: "2020-01-02",
        },
      ],
      { baseCurrency: "NZD", fxToNZD: BASE }
    );
    const gain = summary.holdings[0].gain;
    expect(summary.holdings[0].currency).toBe("USD");
    expect(gain).toBeCloseTo(0.0000040399, 12);
    expect(formatSignedMoney(gain, "USD")).toBe("+US$0.0000040399");
    expect(formatSignedMoney(0.00002797, "USD")).toBe("+US$0.00002797");
    expect(formatSignedMoney(gain, "USD")).not.toBe("US$0.00");
    expect(formatSignedMoney(-0.0000040399, "USD")).toBe("-US$0.0000040399");
  });
});

describe("M14 headers", () => {
  it("sets a one-year HSTS without preload, a report-only script policy, and no X-Frame-Options", () => {
    const headers = SECURITY_HEADERS as Record<string, string>;
    expect(headers["Strict-Transport-Security"]).toBe("max-age=31536000; includeSubDomains");
    expect(headers["Strict-Transport-Security"]).not.toMatch(/preload/i);
    expect(headers["Content-Security-Policy"]).toBe(
      "frame-ancestors 'self' https://web.totalum.app https://totalum-frontend-test.web.app"
    );
    expect(headers["Content-Security-Policy"]).not.toContain("script-src");
    expect(headers["Content-Security-Policy-Report-Only"]).toContain("script-src 'self' https://www.googletagmanager.com");
    expect(headers["Content-Security-Policy-Report-Only"]).not.toContain("unsafe-inline");
    expect(headers["Permissions-Policy"]).toContain("camera=()");
    expect(headers["X-Frame-Options"]).toBeUndefined();
    const securityTxt = readFileSync("public/.well-known/security.txt", "utf8");
    expect(securityTxt).toContain("Contact: mailto:admin@aetherforgeai.co.nz");
    expect(securityTxt).toContain("Expires: 2027-10-08T00:00:00.000Z");
    expect(securityTxt).not.toContain("www.aetherforgeai.co.nz");
  });
});

describe("L6 L9 L10 L11 L12 L13", () => {
  it("counts visible onboarding steps and ticks a cash deposit", () => {
    const progress = onboardingProgress({ hasHoldings: false, hasCash: true });
    expect(`${progress.completed}/${progress.total}`).toBe("1/4");
    expect(progress.steps.find((step) => step.id === "buy")?.done).toBe(true);
  });

  it("writes CSV money at 2dp, FX at 4dp, and full unit prices", () => {
    const row = {
      type: "sell",
      executed_at: "2026-10-10T02:47:53.208Z",
      ticker: "WOR.AX",
      asset_type: "stock",
      quantity: 2.0062,
      price: 7476.62,
      fees: 1.5,
      currency: "AUD",
      fx_rate: 1.244,
      cash_nzd: 2.0062 * 7476.62,
      realized_pnl: -10.864,
      notes: "",
    };
    expect(csvMoney(2.0062 * 7476.62)).toBe("14999.60");
    expect(csvUnitPrice(17.456789)).toBe("17.456789");
    expect(csvUnitPrice(9.44)).not.toBe("9.440000");
    expect(csvFeesNzd(row)).toBe("1.87");
    expect(csvFxSource(row)).toBe("daily");
    expect(csvFxSource({ currency: "NZD" })).toBe("nzd");
    expect(csvNotes(row)).toBe("Sell recorded on the paper book.");
    const cells = transactionCsvCells(row);
    expect(cells[0]).toBe("10 Oct 2026");
    expect(cells[1]).toBe("10 Oct 2026, 3:47 pm");
    expect(cells[16]).toBe("1.87");
    expect(cells[18]).toBe("1.2440");
    expect(cells[19]).toBe("daily");
    expect(cells[13]).toBe("");
    expect(cells[14]).toBe("");
    expect(cells[21]).toBe("");
    expect(cells[22]).toBe("");
    expect(cells[28]).toBe("");
    expect(cells[29]).toBe("");
    expect(cells[30]).toContain("Not a signal fill.");
    expect(cells[30]).not.toMatch(/\d/);
    expect(cells).toHaveLength(31);
  });

  it("keeps a date-only row on its civil day and labels columns that do not apply", () => {
    expect(formatCleanNumber(7476.61570345871)).toBe("7476.6157");
    expect(formatCleanNumber(0.00000402332293400169)).not.toContain("32293400169");
    const row = {
      type: "buy",
      executed_at: "2026-10-09T12:00:00.000Z",
      ticker: "GOLD",
      asset_type: "metal",
      quantity: 2.0062,
      price: 7476.62,
      currency: "NZD",
      fx_rate: 1,
      notes:
        "[audit 10/10/2026, 10:57:02 pm] FILLED buy qty=2.0062 fill=7476.62 NZD live=7476.61570345871 source=user_fill.",
    };
    const notes = csvNotes(row);
    expect(notes).toContain("[audit 10 Oct 2026, 10:57 pm]");
    expect(notes).not.toContain("10/10/2026");
    expect(notes).not.toContain("7476.61570345871");
    expect(notes).toContain("live=7476.6157");
    const cells = transactionCsvCells(row);
    expect(cells[0]).toBe("9 Oct 2026");
    expect(cells[1]).toBe("9 Oct 2026");
    expect(cells[1]).not.toMatch(/1:00/);
    expect(cells[7]).toBe("GOLD");
    expect(cells[12]).toBe("");
    expect(cells[13]).toBe("");
    expect(cells[14]).toBe("");
    expect(cells[21]).toBe("0.00");
    expect(cells[22]).toBe("0.00");
    expect(cells[30]).toContain("Quote time was not stored.");
    expect(cells[30]).toContain("Not a signal fill.");
    expect(cells[30]).toContain("Not marked at export.");
    const cash = transactionCsvCells({ type: "deposit", executed_at: "2026-10-10", currency: "NZD", total: 100 });
    expect(cash[1]).toBe("10 Oct 2026");
    expect(cash[7]).toBe("");
    expect(cash[30]).toContain("Cash has no asset id.");
    const unsold = transactionCsvCells({
      type: "sell",
      executed_at: "2026-10-10T02:47:53.208Z",
      ticker: "WOR.AX",
      currency: "AUD",
    });
    expect(unsold[21]).toBe("");
    expect(unsold[22]).toBe("");
    expect(unsold[30]).toContain("Price and FX split was not stored.");
    expect(unsold[21]).not.toMatch(/[A-Za-z]/);
  });

  it("writes one correction sentence and hides the DEX notes prefix", () => {
    const notes =
      "[DEX:Ethereum] Correction: 9000 at 2.22 → 9000 at 2.21. Correction: 9000 at 2.22 → 9000 at 2.21.";
    const row = { type: "correction", notes, ticker: "PEPE", asset_type: "crypto" };
    expect(csvNotes(row)).toBe("Correction: 9000 at NZ$2.22 → 9000 at NZ$2.21. Cash unchanged.");
    expect(csvNotes(row)).not.toContain("[DEX:");
    const cells = transactionCsvCells(row);
    expect(cells[27]).toBe("Correction: 9000 at NZ$2.22 → 9000 at NZ$2.21. Cash unchanged.");
    expect(cells[28]).toBe("DEX");
    expect(cells[29]).toBe("Ethereum");
  });

  it("keeps the earlier civil day when a buy is merged", () => {
    expect(earlierCivilDay("2026-10-10T01:00:00.000Z", "2026-10-01")).toBe("2026-10-01");
    expect(earlierCivilDay("2026-10-01", "2026-10-10")).toBe("2026-10-01");
    expect(lotCivilDay("2026-10-09T12:00:00.000Z")).toBe("2026-10-09");
    expect(lotCivilDay("2026-10-01T00:00:00.000Z")).toBe("2026-10-01");
    const route = readFileSync("src/app/api/stocks/[id]/route.ts", "utf8");
    expect(route).toContain("delete patch.purchase_date");
  });

  it("asks for a number when quantity is not numeric", () => {
    expect(parseTradeNumber("abc").ok).toBe(false);
    expect(parseTradeNumber("-5")).toEqual({ ok: true, value: -5 });
    const messages = transactionProblems({
      type: "buy",
      date: "2026-10-10",
      today: "2026-10-10",
      quantity: 0,
      price: 9.44,
      quantityRaw: "abc",
      held: 0,
      hasAsset: true,
      cashKnown: true,
      cashAfterNzd: 100,
      needsCash: true,
    });
    expect(messages).toContain("Enter a number.");
    expect(messages).not.toContain("Quantity must be greater than zero.");
    const waiting = transactionProblems({
      type: "deposit",
      date: "2026-10-10",
      today: "2026-10-10",
      quantity: 0,
      price: 50,
      held: 0,
      hasAsset: false,
      cashKnown: false,
      cashAfterNzd: 0,
      cashChangeNzd: 50,
      needsCash: true,
    });
    expect(waiting).toEqual([]);
    expect(exceedsAvailableCash(10, 0)).toBe(true);
    expect(exceedsAvailableCash(10, 9.99)).toBe(true);
    expect(exceedsAvailableCash(10, 10)).toBe(false);
    expect(exceedsAvailableCash(0, 0)).toBe(false);
    const writer = readFileSync("src/lib/transactions.ts", "utf8");
    expect(writer).toContain("exceedsAvailableCash(-delta, currentCash)");
    expect(writer).toContain("exceedsAvailableCash(costNZD, currentCash)");
    expect(writer).toContain("exceedsAvailableCash(cost, currentCash)");
    expect(writer).toContain("cashKnown: true");
    expect(writer).not.toMatch(/cashKnown:\s*(input|false)/);
  });

  it("labels dividends only for shares and ETFs", () => {
    expect(distributionLabel("stock")).toBe("Dividend");
    expect(distributionLabel("etf")).toBe("Dividend");
    expect(distributionLabel("crypto")).toBe("Income");
    expect(distributionLabel("metal")).toBe("Income");
    expect(distributionLabel("cash")).toBe("Income");
  });

  it("sums paper-book dividends and realised P&L without negative zero", () => {
    const book = taxBookSummary([
      { type: "dividend", cash_nzd: 25 },
      { type: "sell", realized_pnl: -10.864 },
      { type: "buy", realized_pnl: 0 },
    ]);
    expect(book.dividendsNzd).toBe(25);
    expect(book.realisedPnlNzd).toBe(-10.86);
    expect(formatNzd(book.dividendsNzd)).toBe("NZ$25.00");
    expect(formatSignedMoney(book.realisedPnlNzd)).toBe("-NZ$10.86");
  });
});
