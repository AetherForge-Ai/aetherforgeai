import { describe, expect, it } from "vitest";
import {
  formatDisplayDate,
  formatFxInput,
  formatMoney,
  formatSavedFx,
  formatPriceInput,
  formatQuantity,
  formatSignedMoney,
} from "@/lib/currency";
import { defaultFeePresetId } from "@/lib/broker-fees";
import { PAPER_FEE_SUMMARY, suggestedFee } from "@/lib/fee-rule";
import { ledgerDisplayedCash } from "@/lib/ledger-cash-lines";
import { buildMovementPreview } from "@/lib/movement-preview";
import { applyPaperCashMove } from "@/lib/paper-cash";
import { paperFeeNZD } from "@/lib/report-topup";
import { planSellFeeBackfill } from "@/lib/sell-fee-backfill";
import { dexSearchHits, searchAssets } from "@/lib/asset-search";
import { dexPriceForSymbol, type DexTokenRow } from "@/lib/crypto-dex";
import { openingFx, priceForBooking, publicPageMetadata, ratesForBooking, reviewedFxAllowed } from "@/lib/reviewed-book";
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
    expect(panel).toContain("fees: preview.feeNative");
    expect(panel).not.toContain("0.50%");
    expect(read("src/app/trust/page.tsx")).toContain("PAPER_FEE_SUMMARY");
  });
});

describe("one asset search", () => {
  it("finds PEPE and Uniswap without choosing an asset type first", () => {
    const pepe = searchAssets("PEPE");
    expect(pepe.some((hit) => hit.symbol === "PEPE")).toBe(true);
    expect(pepe[0]?.market).toBe("DEX");
    const uni = searchAssets("uniswap");
    expect(uni.some((hit) => hit.name === "Uniswap" && hit.market === "DEX")).toBe(true);
  });
});

describe("reviewed figures are the figures that are saved", () => {
  const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

  it("books the reviewed WOR.AX price and FX, not today's snapshot", () => {
    const reviewed = buildMovementPreview({
      type: "buy",
      date: "2026-10-01",
      asset: "WOR.AX",
      quantity: 1,
      price: 9.52,
      fee: 0,
      currency: "AUD",
      fxRate: 1.2378,
      cashNzd: 1000,
      hasAsset: true,
    });
    expect(reviewed.priceNative).toBe(9.52);
    expect(reviewed.fxRate).toBe(1.2378);
    expect(reviewed.cashChangeNzd).toBe(-11.78);
    const todaySnapshot = { NZD: 1 as const, USD: 1.67, AUD: 1.2419 };
    const booked = applyPaperCashMove({
      side: "buy",
      quantity: reviewed.quantity,
      price: priceForBooking(reviewed.priceNative, 9.55),
      fees: 0,
      currency: "AUD",
      rates: ratesForBooking("AUD", reviewed.fxRate, todaySnapshot),
      cashNZD: 1000,
      shares: 0,
    });
    expect(booked.cashDeltaNZD).toBe(reviewed.cashChangeNzd);
    expect(booked.cashDeltaNZD).not.toBe(-11.82);
  });

  it("keeps a reviewed SOL fill when a newer spot arrives before save", () => {
    const reviewed = buildMovementPreview({
      type: "sell",
      date: "2026-10-07",
      asset: "SOL",
      quantity: 0.5,
      price: 118.75,
      fee: 0,
      currency: "USD",
      fxRate: 1.6715,
      cashNzd: 500,
      hasAsset: true,
    });
    expect(formatMoney(reviewed.priceNative, "USD")).toBe("US$118.75");
    const bookedPrice = priceForBooking(reviewed.priceNative, 118.79);
    expect(bookedPrice).toBe(118.75);
    const rates = ratesForBooking("USD", reviewed.fxRate, { NZD: 1, USD: 1.68, AUD: 1.2419 });
    const booked = applyPaperCashMove({
      side: "sell",
      quantity: reviewed.quantity,
      price: bookedPrice,
      fees: 0,
      currency: "USD",
      rates,
      cashNZD: 500,
      shares: 1,
    });
    expect(booked.cashDeltaNZD).toBe(reviewed.cashChangeNzd);
    const repriced = buildMovementPreview({
      type: "sell",
      date: "2026-10-07",
      asset: "SOL",
      quantity: 0.5,
      price: 118.79,
      fee: 0,
      currency: "USD",
      fxRate: reviewed.fxRate,
      cashNzd: 500,
      hasAsset: true,
    });
    expect(booked.cashDeltaNZD).not.toBe(repriced.cashChangeNzd);
    const writer = read("src/lib/transactions.ts");
    expect(writer).toContain("price = priceForBooking(price, liveSpot)");
    expect(writer).toContain("ratesForBooking(currency, input.fx_rate, fx.ratesToNZD)");
    expect(writer).not.toContain("price = liveSpot");
    const panel = read("src/components/dashboard/RecordTransactionPanel.tsx");
    expect(panel).toContain("payload.price = preview.priceNative");
    expect(panel).toContain("payload.fx_rate = preview.fxRate");
    expect(panel).toContain("purchase_price: preview.priceNative");
    expect(panel).not.toContain("payload.price = Number(price)");
  });
});

describe("reviewed FX stays near the market rate", () => {
  it("books a back-dated rate within 5% of that day's rate", () => {
    const allowed = reviewedFxAllowed({
      currency: "AUD",
      reviewed: 1.22,
      snapshot: 1.7,
      historical: 1.2,
    });
    expect(allowed.ok).toBe(true);
    expect(priceForBooking(9.52, 9.55)).toBe(9.52);
    expect(ratesForBooking("AUD", 1.22, { NZD: 1, USD: 1.7, AUD: 1.7 }).AUD).toBe(1.22);
  });

  it("rejects a rate that matches neither the snapshot nor the trade date", () => {
    const rejected = reviewedFxAllowed({
      currency: "USD",
      reviewed: 1.1,
      snapshot: 1.7,
      historical: 1.2,
    });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.message).toMatch(/within 5%/);
  });
});

describe("row sell uses the same FX as the add panel", () => {
  it("leaves the field blank until the live rate arrives, then shows 4 decimals", () => {
    expect(openingFx({ currency: "AUD", live: false, liveRate: 1.09 })).toBeNull();
    expect(openingFx({ currency: "AUD", live: true, liveRate: 1.2419490651849387 })).toBe("1.2419");
    expect(openingFx({ currency: "NZD", live: false, liveRate: 1 })).toBe("1.0000");
    const panel = readFileSync(path.join(process.cwd(), "src/components/dashboard/RecordTransactionPanel.tsx"), "utf8");
    expect(panel).toContain("openingFx(");
    expect(panel).not.toContain("String(rates[");
    expect(panel).not.toContain("cash after still loading");
    expect(panel).toContain("Loading cash…");
  });
});

describe("DEX tokens", () => {
  const pepe = dexSearchHits([
    { symbol: "PEPE", name: "Pepe", price: 0.00000912, id: "pool-pepe", detailId: "pepe" },
  ]);
  const uni = dexSearchHits([
    { symbol: "UNI", name: "Uniswap", price: 7.42, id: "pool-uni" },
  ]);

  it("returns a DEX badge and a live price ahead of the coin-list row", () => {
    const hits = searchAssets("PEPE", {
      dex: pepe,
      coins: [{ symbol: "PEPE", name: "Pepe", market: "Crypto", assetType: "crypto", id: "pepe" }],
    });
    expect(hits[0]?.market).toBe("DEX");
    expect(hits[0]?.price).toBeGreaterThan(0);
    expect(hits.some((hit) => hit.market === "DEX" && hit.symbol === "PEPE")).toBe(true);
    const uniswap = searchAssets("uniswap", { dex: uni });
    expect(uniswap.some((hit) => hit.market === "DEX" && hit.name === "Uniswap" && (hit.price || 0) > 0)).toBe(true);
    const row: DexTokenRow = {
      id: "pool-pepe",
      symbol: "PEPE",
      name: "Pepe",
      price: 0.00000912,
      priceUnavailable: false,
      volume24h: 1,
      network: "Ethereum",
      dex: "uniswap",
      detailId: "pepe",
    };
    expect(dexPriceForSymbol("PEPE", [row])).toBe(0.00000912);
    const quote = readFileSync(path.join(process.cwd(), "src/app/api/tickers/quote/route.ts"), "utf8");
    expect(quote).toContain("dexPriceForSymbol");
    expect(quote).toContain('market !== "dex"');
    expect(quote).toContain('market === "dex"');
    expect(quote).toContain("dexQuoteRows");
    const panel = readFileSync(path.join(process.cwd(), "src/components/dashboard/RecordTransactionPanel.tsx"), "utf8");
    expect(panel).toContain('asset.market === "DEX" ? "&market=dex"');
    expect(panel).toContain('if (kind !== "dividend") return found');
    expect(panel).toContain("Saving…");
  });
});

describe("display formatters", () => {
  it("shows FX to 4 decimals, dates without a leading zero, and grouped quantities", () => {
    expect(formatFxInput(1.2419490651849387)).toBe("1.2419");
    expect(formatFxInput(1.7788213529715213)).toBe("1.7788");
    expect(formatSavedFx(1.2419490651849387)).toBe("1.2419");
    expect(formatSavedFx(null)).toBe("");
    expect(formatSavedFx(undefined)).toBe("");
    expect(formatSavedFx("")).toBe("");
    expect(formatDisplayDate("2026-10-04")).toBe("4 Oct 2026");
    expect(formatDisplayDate("2026-10-01")).toBe("1 Oct 2026");
    expect(formatDisplayDate("2026-07-08")).toBe("8 Jul 2026");
    expect(formatPriceInput(9.510307)).toBe("9.51");
    expect(formatQuantity(9824)).toBe("9,824");
    const held = transactionProblems({
      type: "sell",
      date: today,
      today,
      quantity: 10000,
      price: 1,
      held: 9824,
      hasAsset: true,
      cashKnown: true,
      cashAfterNzd: 10,
      needsCash: false,
    });
    expect(held.join(" ")).toContain("9,824");
    expect(held.join(" ")).not.toContain("9824");
    const dashboard = readFileSync(path.join(process.cwd(), "src/components/dashboard/PortfolioDashboard.tsx"), "utf8");
    const table = readFileSync(path.join(process.cwd(), "src/components/dashboard/HoldingsOwnedTable.tsx"), "utf8");
    expect(dashboard).toContain("return formatDisplayDate(iso)");
    expect(table).toContain("return formatDisplayDate(iso)");
    expect(dashboard).not.toContain('day: "2-digit"');
    expect(readFileSync(path.join(process.cwd(), "src/components/performance/LiveExamplesGallery.tsx"), "utf8")).toContain(
      'const TODAY_LABEL = "8 Jul 2026"'
    );
  });
});

describe("holding edit writes a ledger correction", () => {
  it("opens the record panel instead of the old edit form", () => {
    const dashboard = readFileSync(path.join(process.cwd(), "src/components/dashboard/PortfolioDashboard.tsx"), "utf8");
    expect(dashboard).toContain('mode: "correction"');
    expect(dashboard).not.toContain("StockDialog");
    expect(dashboard).toContain("holdingId: stock._id");
    const dialog = readFileSync(path.join(process.cwd(), "src/components/dashboard/TransactionDialog.tsx"), "utf8");
    expect(dialog).toContain("Correct this holding");
    expect(dialog).not.toContain("Update the date, amount or purchase price for this position");
    const edit = readFileSync(path.join(process.cwd(), "src/app/api/stocks/[id]/route.ts"), "utf8");
    expect(edit).toContain("executed_at: civilDay");
    expect(edit).toContain("trade_date: civilDay");
    expect(edit).not.toContain("T12:00:00.000Z");
    expect(edit).toContain("The date can't be in the future.");
    expect(edit).toContain("fromHoldingEdit: true");
  });
});

describe("public page canonical URLs", () => {
  const pages = [
    "/trust",
    "/tax",
    "/markets",
    "/terms-of-service",
    "/privacy-policy",
    "/ai-disclaimer",
    "/pricing",
    "/docs",
    "/about",
    "/blog",
    "/performance",
    "/how-it-works",
    "/how-to-maximize-results",
    "/projections",
    "/market-news",
    "/free-trial",
  ];

  it("points canonical and og:url at the page itself", () => {
    for (const page of pages) {
      const meta = publicPageMetadata(page, { title: "Title", description: "Description" });
      expect(meta.alternates?.canonical).toBe(page);
      expect(meta.openGraph && "url" in meta.openGraph ? meta.openGraph.url : null).toBe(page);
      const file = readFileSync(path.join(process.cwd(), `src/app${page}/page.tsx`), "utf8");
      expect(file).toContain(`publicPageMetadata("${page}"`);
    }
    const crypto = readFileSync(path.join(process.cwd(), "src/app/markets/crypto/[id]/page.tsx"), "utf8");
    const stock = readFileSync(path.join(process.cwd(), "src/app/markets/stock/[ticker]/page.tsx"), "utf8");
    expect(crypto).toContain("generateMetadata");
    expect(crypto).toContain("publicPageMetadata(`/markets/crypto/${id}`");
    expect(stock).toContain("generateMetadata");
    expect(stock).toContain("publicPageMetadata(`/markets/stock/${ticker}`");
    const trust = readFileSync(path.join(process.cwd(), "src/app/trust/page.tsx"), "utf8");
    expect(trust).toContain("<SiteHeader");
    expect(trust).toContain('href="/"');
    const footer = readFileSync(path.join(process.cwd(), "src/components/SiteFooter.tsx"), "utf8");
    expect(footer).toContain('aria-label="Footer"');
    expect(footer).toContain("Privacy Policy");
    expect(footer).toContain('label: "Terms"');
    expect(footer).toContain("NZBN");
    expect(readFileSync(path.join(process.cwd(), "src/app/layout.tsx"), "utf8")).toContain("<SiteFooter");
    const login = readFileSync(path.join(process.cwd(), "src/app/login/layout.tsx"), "utf8");
    expect(login).toContain('publicPageMetadata("/login"');
    const stocks = readFileSync(path.join(process.cwd(), "src/app/dashboard/stocks/page.tsx"), "utf8");
    expect(stocks).toContain('publicPageMetadata("/dashboard/stocks"');
  });
});
