import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
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
import { aucklandDateISO } from "@/lib/fill-integrity";
import { computeSummary } from "@/lib/portfolio";
import { SECURITY_HEADERS } from "@/lib/security-headers";
import { distributionLabel } from "@/lib/income-label";
import { earlierCivilDay, parseTradeNumber, transactionProblems } from "@/lib/transaction-rules";
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
    expect(sameQuotedUnit(9.44, 9.43996)).toBe(false);
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
    expect(cells[28]).toBe("");
    expect(cells[29]).toBe("");
    expect(cells).toHaveLength(30);
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
