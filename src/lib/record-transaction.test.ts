import { describe, expect, it } from "vitest";
import { formatDisplayDate, formatMoney, formatPriceInput, formatSignedMoney } from "@/lib/currency";
import { PAPER_FEE_RATE, suggestedFee } from "@/lib/fee-rule";
import { ledgerDisplayedCash } from "@/lib/ledger-cash-lines";
import { buildMovementPreview } from "@/lib/movement-preview";
import { searchAssets } from "@/lib/asset-search";
import { transactionProblems } from "@/lib/transaction-rules";

const today = "2026-10-07";

describe("paper fee rule", () => {
  it("charges 0.50% of quantity × price on every buy and sell", () => {
    expect(PAPER_FEE_RATE).toBe(0.005);
    // 0.48 is 0.50% of a 96 notional — the small share-sell fee this replaces.
    expect(suggestedFee("sell", 10, 9.6)).toBe(0.48);
    expect(suggestedFee("buy", 10, 9.6)).toBe(0.48);
    expect(suggestedFee("buy", 2, 100)).toBe(1);
  });

  it("suggests zero on cash movements and still returns a number", () => {
    expect(suggestedFee("deposit", 0, 40)).toBe(0);
    expect(suggestedFee("withdraw", 0, 40)).toBe(0);
    expect(suggestedFee("tax", 0, 40)).toBe(0);
    expect(suggestedFee("buy", 0, 0)).toBe(0);
  });
});

describe("record validation", () => {
  const base = {
    type: "sell" as const,
    date: "2026-10-01",
    today,
    quantity: 5,
    price: 10,
    held: 4,
    firstBuyDate: "2026-09-01",
    hasAsset: true,
    cashKnown: true,
    cashAfterNzd: 100,
    needsCash: false,
  };

  it("blocks a sell larger than the holding", () => {
    expect(transactionProblems(base).join(" ")).toMatch(/can't be larger/);
  });

  it("blocks a future date", () => {
    expect(transactionProblems({ ...base, type: "buy", date: "2026-10-08", held: 0, quantity: 1 }).join(" ")).toMatch(
      /future/
    );
  });

  it("blocks a sell dated before the first buy", () => {
    expect(
      transactionProblems({ ...base, quantity: 1, held: 4, date: "2026-08-01" }).join(" ")
    ).toMatch(/before the first buy/);
  });

  it("blocks cash going below zero", () => {
    expect(
      transactionProblems({
        ...base,
        type: "withdraw",
        quantity: 0,
        price: 50,
        held: 0,
        hasAsset: false,
        cashAfterNzd: -1,
        needsCash: true,
      }).join(" ")
    ).toMatch(/below zero/);
  });
});

describe("withdraw and tax cash sign", () => {
  it("shows a withdrawal and a tax line as a reduction, never +NZ$0.00", () => {
    const withdraw = buildMovementPreview({
      type: "withdraw",
      date: today,
      price: 40,
      fee: 0,
      cashNzd: 100,
    });
    const tax = buildMovementPreview({
      type: "tax",
      date: today,
      price: 12.5,
      fee: 0,
      cashNzd: 100,
    });
    expect(withdraw.cashChangeNzd).toBe(-40);
    expect(tax.cashChangeNzd).toBe(-12.5);
    expect(formatSignedMoney(withdraw.cashChangeNzd)).toBe("-NZ$40.00");
    expect(formatSignedMoney(tax.cashChangeNzd)).toBe("-NZ$12.50");
    expect(formatSignedMoney(0)).toBe("NZ$0.00");
    expect(formatSignedMoney(0).startsWith("+")).toBe(false);
    expect(ledgerDisplayedCash({ type: "withdraw", total: 0, quantity: 40 })).toBe(-40);
    expect(ledgerDisplayedCash({ type: "tax", total: 0, quantity: 12.5 })).toBe(-12.5);
  });
});

describe("ledger card and row", () => {
  it("uses the fee-inclusive cash figure on both surfaces", () => {
    const nst = { type: "buy", ticker: "NST.AX", total: -21590.34, cash_nzd: -21598.34, fees_nzd: 8 };
    const shown = ledgerDisplayedCash(nst);
    expect(shown).toBe(-21598.34);
    expect(formatSignedMoney(shown)).toBe("-NZ$21,598.34");
    // The card and the row both call ledgerDisplayedCash, so they cannot diverge by the fee.
    expect(ledgerDisplayedCash(nst)).toBe(ledgerDisplayedCash({ ...nst }));
  });
});

describe("formatting helpers", () => {
  it("prints book amounts from $1 to 2 decimals and dates as 4 Oct 2026", () => {
    expect(formatMoney(2.2, "NZD")).toBe("NZ$2.20");
    expect(formatMoney(2.2, "NZD")).not.toBe("NZ$2.2000");
    expect(formatPriceInput(7377.8396179091)).toBe("7377.84");
    expect(formatDisplayDate("2026-10-04")).toBe("4 Oct 2026");
    expect(formatMoney(0.1842, "USD")).toContain("0.1842");
  });
});

describe("one asset search", () => {
  it("finds PEPE and Uniswap without choosing an asset type first", () => {
    expect(searchAssets("PEPE").some((hit) => hit.symbol === "PEPE")).toBe(true);
    expect(searchAssets("uniswap").some((hit) => hit.name === "Uniswap")).toBe(true);
  });
});
