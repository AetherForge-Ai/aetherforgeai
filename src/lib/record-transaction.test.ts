import { describe, expect, it } from "vitest";
import { formatDisplayDate, formatMoney, formatPriceInput, formatSignedMoney } from "@/lib/currency";
import { defaultFeePresetId } from "@/lib/broker-fees";
import { PAPER_FEE_SUMMARY, suggestedFee } from "@/lib/fee-rule";
import { ledgerDisplayedCash } from "@/lib/ledger-cash-lines";
import { buildMovementPreview } from "@/lib/movement-preview";
import { applyPaperCashMove } from "@/lib/paper-cash";
import { paperFeeNZD } from "@/lib/report-topup";
import { planSellFeeBackfill } from "@/lib/sell-fee-backfill";
import { searchAssets } from "@/lib/asset-search";
import { readFileSync } from "node:fs";
import path from "node:path";
import { assessMovement, transactionProblems } from "@/lib/transaction-rules";

const today = "2026-10-07";

describe("paper fee rule", () => {
  it("defaults to zero on every transaction type and every asset", () => {
    for (const type of ["buy", "sell", "dividend", "deposit", "withdraw", "tax", "opening_balance", "correction"]) {
      expect(suggestedFee(type, 10, 9.6)).toBe(0);
    }
    expect(suggestedFee("buy", 2, 100)).toBe(0);
    expect(suggestedFee("sell", 1, 4000)).toBe(0);
    expect(PAPER_FEE_SUMMARY).toMatch(/NZ\$0\.00/);
    expect(PAPER_FEE_SUMMARY).toMatch(/whatever you enter/);
    expect(PAPER_FEE_SUMMARY).not.toMatch(/0\.50%|0\.5%/);
    expect(defaultFeePresetId("AIA.NZ", "stock")).toBe("zero");
    expect(defaultFeePresetId("CLW", "stock")).toBe("zero");
    expect(defaultFeePresetId("PEPE", "crypto")).toBe("zero");
    expect(defaultFeePresetId("GOLD", "metal")).toBe("zero");
    expect(paperFeeNZD(1000, "ETH", "crypto")).toBe(0);
    expect(
      planSellFeeBackfill({
        _id: "tx-clw",
        type: "sell",
        ticker: "CLW",
        asset_type: "stock",
        quantity: 10,
        price: 4.2,
        fees: 0,
      })
    ).toBeNull();
  });

  it("applies a typed fee to cash and the ledger, and leaves an omitted fee at zero", () => {
    const typed = buildMovementPreview({
      type: "buy",
      date: today,
      asset: "AIA.NZ",
      quantity: 10,
      price: 9.6,
      fee: 2.5,
      currency: "NZD",
      cashNzd: 1000,
    });
    expect(typed.feeNative).toBe(2.5);
    expect(typed.feeNzd).toBe(2.5);
    expect(typed.cashChangeNzd).toBe(-98.5);
    expect(typed.cashAfterNzd).toBe(901.5);

    const sold = buildMovementPreview({
      type: "sell",
      date: today,
      asset: "PEPE",
      quantity: 1000,
      price: 0.004218,
      fee: 1.25,
      currency: "USD",
      fxRate: 1.7,
      cashNzd: 200,
    });
    expect(sold.feeNative).toBe(1.25);
    expect(sold.cashChangeNzd).toBeCloseTo((1000 * 0.004218 - 1.25) * 1.7, 2);
    expect(sold.cashAfterNzd).toBeCloseTo(200 + sold.cashChangeNzd, 2);

    const cash = applyPaperCashMove({
      side: "buy",
      quantity: 10,
      price: 9.6,
      fees: 2.5,
      currency: "NZD",
      cashNZD: 1000,
      shares: 0,
    });
    expect(cash.ok).toBe(true);
    expect(cash.cashDeltaNZD).toBe(-98.5);
    expect(cash.cashNZD).toBe(901.5);

    const ledgerRow = {
      type: "buy" as const,
      fees: typed.feeNative,
      fees_nzd: typed.feeNzd,
      cash_nzd: typed.cashChangeNzd,
      total: typed.cashChangeNzd,
    };
    expect(ledgerRow.fees).toBe(2.5);
    expect(ledgerRow.fees_nzd).toBe(2.5);
    expect(ledgerDisplayedCash(ledgerRow)).toBe(-98.5);

    const omitted = buildMovementPreview({
      type: "buy",
      date: today,
      asset: "AIA.NZ",
      quantity: 10,
      price: 9.6,
      currency: "NZD",
      cashNzd: 1000,
    });
    expect(omitted.feeNative).toBe(0);
    expect(omitted.cashChangeNzd).toBe(-96);
    expect(omitted.cashAfterNzd).toBe(904);

    const gold = buildMovementPreview({
      type: "sell",
      date: today,
      asset: "GOLD",
      quantity: 1,
      price: 4000,
      currency: "NZD",
      cashNzd: 100,
    });
    expect(gold.feeNative).toBe(0);
    expect(gold.cashChangeNzd).toBe(4000);
    expect(gold.cashAfterNzd).toBe(4100);

    const untouched = applyPaperCashMove({
      side: "sell",
      quantity: 10,
      price: 9.6,
      currency: "NZD",
      cashNZD: 100,
      shares: 10,
    });
    expect(untouched.cashDeltaNZD).toBe(96);
    expect(untouched.cashNZD).toBe(196);
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

  it("blocks a sell dated before the first buy and prints the day, not the ISO date", () => {
    const message = transactionProblems({
      ...base,
      quantity: 1,
      held: 4,
      date: "2026-08-01",
      firstBuyDate: "2026-10-04",
    }).join(" ");
    expect(message).toMatch(/before the first buy/);
    expect(message).toContain(formatDisplayDate("2026-10-04"));
    expect(message).toContain("4 Oct 2026");
    expect(message).not.toContain("2026-10-04");
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

  it("blocks a sell whose fee would take cash below zero", () => {
    expect(
      transactionProblems({
        ...base,
        quantity: 1,
        held: 4,
        cashAfterNzd: -2,
        cashChangeNzd: -5,
      }).join(" ")
    ).toMatch(/below zero/);
  });

  it("still allows a sell that adds cash when the balance is already short", () => {
    expect(
      transactionProblems({
        ...base,
        quantity: 1,
        held: 4,
        cashAfterNzd: -2,
        cashChangeNzd: 10,
      }).join(" ")
    ).not.toMatch(/below zero/);
  });

  it("links a dividend to a holding you already have", () => {
    expect(
      transactionProblems({
        ...base,
        type: "dividend",
        quantity: 0,
        price: 12,
        held: 0,
        hasAsset: true,
      }).join(" ")
    ).toMatch(/linked to a holding/);
    expect(
      transactionProblems({
        ...base,
        type: "dividend",
        quantity: 0,
        price: 12,
        held: 10,
        hasAsset: true,
      }).join(" ")
    ).not.toMatch(/linked to a holding/);
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

describe("server-side movement rejection", () => {
  const sell = {
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
  const owned = {
    type: "correction" as const,
    date: today,
    today,
    quantity: 8,
    price: 2,
    held: 8,
    hasAsset: true,
    cashKnown: true,
    cashAfterNzd: 100,
    needsCash: false,
    fromHoldingEdit: true,
  };

  it("rejects a future date, an oversell, a sell before the first buy, and cash below zero", () => {
    expect(assessMovement({ ...sell, type: "buy", date: "2026-10-08", held: 0, quantity: 1 })).toMatch(/future/);
    expect(assessMovement(sell)).toMatch(/can't be larger/);
    expect(
      assessMovement({ ...sell, quantity: 1, held: 4, date: "2026-08-01", firstBuyDate: "2026-10-04" })
    ).toBe(`This sell is dated before the first buy of this asset (${formatDisplayDate("2026-10-04")}).`);
    expect(
      assessMovement({
        ...sell,
        type: "withdraw",
        quantity: 0,
        price: 50,
        held: 0,
        hasAsset: false,
        cashAfterNzd: -1,
        needsCash: true,
      })
    ).toMatch(/below zero/);
  });

  it("refuses a correction that did not come from Holding Edit", () => {
    expect(assessMovement({ ...owned, fromHoldingEdit: false })).toBe(
      "A correction can only be recorded from Holding Edit on a holding you own."
    );
  });

  it("still rejects a Holding Edit correction that is negative, in the future, or not this holding", () => {
    expect(assessMovement({ ...owned, quantity: -2 })).toMatch(/greater than zero/);
    expect(assessMovement({ ...owned, quantity: 0 })).toMatch(/greater than zero/);
    expect(assessMovement({ ...owned, date: "2026-10-08" })).toMatch(/future/);
    expect(assessMovement({ ...owned, held: 0 })).toMatch(/holding you own/);
    expect(assessMovement(owned)).toBeNull();
  });

  it("wires the same rejection into POST /api/transactions and Holding Edit", () => {
    const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
    const post = read("src/app/api/transactions/route.ts");
    expect(post).toContain("movementRejectionForUser");
    expect(post).toContain("fromHoldingEdit: false");
    expect(post).toContain("A correction can only be recorded from Holding Edit on a holding you own.");
    const edit = read("src/app/api/stocks/[id]/route.ts");
    expect(edit).toContain('type: "correction"');
    expect(edit).toContain("fromHoldingEdit: true");
    expect(edit).toContain("The date can't be in the future.");
    const writer = read("src/lib/transactions.ts");
    expect(writer).toContain("movementRejectionForUser(user, input, opts)");
    const panel = read("src/components/dashboard/RecordTransactionPanel.tsx");
    expect(panel).toContain("formatDisplayDate(preview.date)");
    expect(panel).toContain("formatSignedMoney(preview.cashChangeNzd)");
    expect(panel).toContain("formatNzd(preview.cashAfterNzd)");
    expect(panel).toContain("formatMoneyWithNzd(preview.priceNative");
  });

  it("books only the typed fee on the server, the metal sell, and a holding correction", () => {
    const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
    const writer = read("src/lib/transactions.ts");
    expect(writer).toContain("const fees = Math.max(0, Number(input.fees) || 0)");
    expect(writer).not.toContain("suggestedFee");
    expect(writer).not.toContain("estimateFee");
    expect(writer).not.toContain("0.005");
    const post = read("src/app/api/transactions/route.ts");
    expect(post).not.toContain("suggestedFee");
    expect(post).not.toContain("estimateFee");
    const metals = read("src/app/api/metals/[id]/route.ts");
    expect(metals).toContain("let fees = 0");
    expect(metals).not.toContain("estimateFee");
    expect(metals).not.toContain("suggestedFee");
    const metalBuy = read("src/app/api/metals/route.ts");
    expect(metalBuy).not.toContain("estimateFee");
    expect(metalBuy).not.toContain("suggestedFee");
    const holding = read("src/app/api/stocks/[id]/route.ts");
    expect(holding).not.toContain("estimateFee");
    expect(holding).not.toContain("suggestedFee");
    expect(read("src/lib/sell-fee-backfill.ts")).not.toContain("estimateFee");
    expect(read("src/lib/report-topup.ts")).not.toContain("estimateFee");
    expect(read("src/lib/fee-rule.ts")).not.toContain("0.005");
    expect(read("src/lib/fee-rule.ts")).not.toContain("0.50%");
    const panel = read("src/components/dashboard/RecordTransactionPanel.tsx");
    expect(panel).toContain('id="record-fee"');
    expect(panel).toContain("fees: Number(fee) || 0");
    expect(panel).not.toContain("0.50%");
    expect(read("src/app/trust/page.tsx")).toContain("PAPER_FEE_SUMMARY");
  });
});

describe("one asset search", () => {
  it("finds PEPE and Uniswap without choosing an asset type first", () => {
    expect(searchAssets("PEPE").some((hit) => hit.symbol === "PEPE")).toBe(true);
    expect(searchAssets("uniswap").some((hit) => hit.name === "Uniswap")).toBe(true);
  });
});
