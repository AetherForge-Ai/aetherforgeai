import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { heldMetalRows } from "@/lib/metal-valuation";
import { xeroStatementCsv } from "@/lib/xero-csv";
import { GAMBLING_WORDS, QUIZ_QUESTIONS, THIRTY_DAY_TASKS, pickPlan } from "@/lib/onboarding-30";
import { addHistoryPoint, wealthTotals } from "@/lib/whole-wealth";
import { PASTE_IMPORT_AI_ENABLED, parsePastedTrades, pastedRowsToCsv } from "@/lib/paste-import";
import { extractCalls, scoreCall, verifyCall, verifyScorecard, weeklyScorecard } from "@/lib/track-record";
import type { SnapshotLedgerLine } from "@/lib/portfolio-snapshot";

const read = (p: string) => readFileSync(p, "utf8");

describe("goal b19", () => {
  it("pins the build", () => expect(read("public/build-version.txt").trim()).toMatch(/^v3-goal-b\d+[a-z]?-2026-10-\d\d$/));

  it("M-1: ticker and toaster load lazily with a height-holding placeholder", () => {
    expect(read("src/app/page.tsx")).toMatch(/LazyMarketTicker/);
    expect(read("src/app/layout.tsx")).toMatch(/LazyToaster/);
    expect(read("src/components/LazyMarketTicker.tsx")).toMatch(/min-h-\[231px\]/);
  });

  it("CR-6: new holding runs the server dry run before anything paints", () => {
    const src = read("src/components/dashboard/RecordTransactionPanel.tsx");
    const i = src.indexOf("/api/transactions?dryRun=1");
    expect(i).toBeGreaterThan(0);
    expect(i).toBeLessThan(src.indexOf("const postedAt = Date.now();"));
  });

  it("G-08: 0.01 oz gold shows a Held row", () => {
    const rows = heldMetalRows([{ metal: "gold", ounces: 0.01, marketValueNZD: 0, purchasePerOz: 4000 } as never]);
    expect(rows).toHaveLength(1);
    expect(rows[0].ounces).toBe(0.01);
  });

  it("G-29: Xero statement CSV, DD/MM/YYYY, 2dp, signed, no GST", () => {
    const line = (o: Partial<SnapshotLedgerLine>): SnapshotLedgerLine =>
      ({ id: "x", type: "buy", ticker: "", quantity: null, price: null, feesNzd: null, currency: "NZD", fx: 1, fxDisplay: "", cashNzd: 0, realisedNzd: null, when: "", whenLabel: "", ...o }) as SnapshotLedgerLine;
    const { csv, rows, skipped } = xeroStatementCsv([
      line({ id: "b", type: "buy", ticker: "FPH.NZ", quantity: 10, price: 28.5, cashNzd: -290, when: "2026-10-13" }),
      line({ id: "a", type: "deposit", cashNzd: 10000, when: "2026-10-01" }),
      line({ id: "c", type: "dividend", ticker: "SPK.NZ", cashNzd: 12.345, when: "2026-10-14" }),
      line({ id: "d", type: "buy", cashNzd: -5, when: "" }),
    ]);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("Date,Amount,Payee,Description,Reference");
    expect(lines[1]).toBe("01/10/2026,10000.00,AetherForge paper book,Deposit,a");
    expect(lines[2]).toBe("13/10/2026,-290.00,AetherForge paper book,Buy FPH.NZ 10 @ 28.5 NZD,b");
    expect(lines[3]).toMatch(/^14\/10\/2026,12\.35,/);
    expect(rows).toBe(3);
    expect(skipped).toBe(1);
    expect(csv).not.toMatch(/GST|tax rate/i);
  });

  it("G-28: 30-day checklist and quiz, no gambling wording", () => {
    const all = JSON.stringify([THIRTY_DAY_TASKS, QUIZ_QUESTIONS]) + read("src/components/dashboard/Onboarding30Days.tsx");
    expect(GAMBLING_WORDS.test(all)).toBe(false);
    expect(pickPlan({ holdings: "10", exports: false, assistantHeavy: false }).plan).toBe("Free");
    expect(pickPlan({ holdings: "10", exports: true, assistantHeavy: false }).plan).toBe("Starter");
    expect(pickPlan({ holdings: "75", exports: true, assistantHeavy: false }).plan).toBe("Pro");
    expect(pickPlan({ holdings: "more", exports: false, assistantHeavy: false }).plan).toBe("Ultimate");
    expect(read("src/lib/onboarding-30.ts")).toMatch(/recordFunnel/);
  });

  it("G-21: net worth equals the sum of parts to the cent, goal gap shown", () => {
    const t = wealthTotals(12345.675, [
      { id: "1", kind: "kiwisaver", label: "KS", valueNzd: 45678.9 },
      { id: "2", kind: "other", label: "Car", valueNzd: 0.1 },
      { id: "3", kind: "debt", label: "Loan", valueNzd: 0.2 },
    ], 100000);
    expect(t.netWorthNzd).toBe(12345.68 + 45678.9 + 0.1 - 0.2);
    expect(Math.round(t.netWorthNzd! * 100)).toBe(Math.round(12345.68 * 100) + 4567890 + 10 - 20);
    expect(t.goalGapNzd).toBeCloseTo(100000 - t.netWorthNzd!, 2);
    expect(wealthTotals(null, [], 5).netWorthNzd).toBeNull();
    expect(addHistoryPoint([{ day: "2026-10-17", netWorthNzd: 1 }], "2026-10-17", 2)).toEqual([{ day: "2026-10-17", netWorthNzd: 2 }]);
  });

  it("G-24: 20 synthetic samples read 95%+ correctly; AI off by default; nothing saved before review", () => {
    expect(PASTE_IMPORT_AI_ENABLED).toBe(false);
    const samples: Array<[string, { type: string; ticker: string; quantity: number; price: number; date: string; currency: string | null }]> = [
      ["You bought 25 shares of FPH.NZ at NZ$28.50 on 13 Oct 2026.", { type: "Buy", ticker: "FPH.NZ", quantity: 25, price: 28.5, date: "2026-10-13", currency: "NZD" }],
      ["Sold 10 AAPL @ US$190.25 on 2026-10-02", { type: "Sell", ticker: "AAPL", quantity: 10, price: 190.25, date: "2026-10-02", currency: "USD" }],
      ["Buy 100 AIR.NZ at $0.62\nTrade date: 01/10/2026", { type: "Buy", ticker: "AIR.NZ", quantity: 100, price: 0.62, date: "2026-10-01", currency: "NZD" }], // b41 G-24: a bare $ on an NZX ticker is NZD
      ["Contract note 778812\nWe sold 40 units of SPK.NZ at 2.88 NZD\nDate 7 Oct 2026\nBrokerage: $15.00", { type: "Sell", ticker: "SPK.NZ", quantity: 40, price: 2.88, date: "2026-10-07", currency: "NZD" }],
      ["Purchased 5 x MSFT at USD 410.10 on 3 Sep 2026", { type: "Buy", ticker: "MSFT", quantity: 5, price: 410.1, date: "2026-09-03", currency: "USD" }],
      ["Order filled: bought 1,000 KMD.NZ at NZ$0.71 (12 Aug 2026)", { type: "Buy", ticker: "KMD.NZ", quantity: 1000, price: 0.71, date: "2026-08-12", currency: "NZD" }],
      ["You sold 12 shares of CBA.AX at A$150.40 on 15 Sep 2026", { type: "Sell", ticker: "CBA.AX", quantity: 12, price: 150.4, date: "2026-09-15", currency: "AUD" }],
      ["Bought 3 VOO at US$520.00 on 2026-07-21. Fee: 3.00", { type: "Buy", ticker: "VOO", quantity: 3, price: 520, date: "2026-07-21", currency: "USD" }],
      ["Sell 200 MEL.NZ @ NZ$5.10 on 4 Oct 2026", { type: "Sell", ticker: "MEL.NZ", quantity: 200, price: 5.1, date: "2026-10-04", currency: "NZD" }],
      ["Buy 7 BHP.AX at AUD 44.20 on 9 Oct 2026", { type: "Buy", ticker: "BHP.AX", quantity: 7, price: 44.2, date: "2026-10-09", currency: "AUD" }],
      ["Hi Max, confirmation 55AA21: you bought 50 IFT.NZ at NZ$11.05 on 30 Sep 2026.", { type: "Buy", ticker: "IFT.NZ", quantity: 50, price: 11.05, date: "2026-09-30", currency: "NZD" }],
      ["Trade: SOLD 15 NVDA at US$118.60 on 2026-10-10", { type: "Sell", ticker: "NVDA", quantity: 15, price: 118.6, date: "2026-10-10", currency: "USD" }],
      ["bought 2.5 shares of TSLA at US$250.00 on 1 Oct 2026", { type: "Buy", ticker: "TSLA", quantity: 2.5, price: 250, date: "2026-10-01", currency: "USD" }],
      ["Sold 300 CEN.NZ at NZ$9.80 on 11 Sep 2026", { type: "Sell", ticker: "CEN.NZ", quantity: 300, price: 9.8, date: "2026-09-11", currency: "NZD" }],
      ["Buy 20 WBC.AX @ A$31.15 on 2 Oct 2026", { type: "Buy", ticker: "WBC.AX", quantity: 20, price: 31.15, date: "2026-10-02", currency: "AUD" }],
      ["We bought 60 units of MFT.NZ at NZ$70.50\n6 Oct 2026", { type: "Buy", ticker: "MFT.NZ", quantity: 60, price: 70.5, date: "2026-10-06", currency: "NZD" }],
      ["Sold 8 GOOG at US$165.30 on 2026-09-29", { type: "Sell", ticker: "GOOG", quantity: 8, price: 165.3, date: "2026-09-29", currency: "USD" }],
      ["Buy 45 ATM.NZ at NZ$6.02 on 14 Oct 2026", { type: "Buy", ticker: "ATM.NZ", quantity: 45, price: 6.02, date: "2026-10-14", currency: "NZD" }],
      ["Purchase 11 AMZN at USD 185.00 on 25 Sep 2026", { type: "Buy", ticker: "AMZN", quantity: 11, price: 185, date: "2026-09-25", currency: "USD" }],
      ["Sell 90 CSL.AX at A$280.00 on 8 Oct 2026", { type: "Sell", ticker: "CSL.AX", quantity: 90, price: 280, date: "2026-10-08", currency: "AUD" }],
    ];
    let correct = 0;
    for (const [text, want] of samples) {
      const { rows } = parsePastedTrades(text);
      const r = rows[0];
      if (rows.length === 1 && r.type === want.type && r.ticker === want.ticker && r.quantity === want.quantity && r.price === want.price && r.date === want.date && r.currency === want.currency) correct++;
      else console.log("miss", text, JSON.stringify(rows));
    }
    expect(correct / samples.length).toBeGreaterThanOrEqual(0.95);
    expect(pastedRowsToCsv(parsePastedTrades(samples[0][0]).rows).split("\n")[0]).toBe("Date,Type,Ticker,Quantity,Price,Currency,Fees,Reference");
    expect(read("src/components/import/BrokerImportPanel.tsx")).toMatch(/Review them below before anything is saved/);
  });

  it("G-20: calls are hashed, verifiable, losers counted, never published", async () => {
    const calls = await extractCalls({ _id: "r1", bot: "stox", generated_at: "2026-10-12T20:00:00.000Z", payload: JSON.stringify({ tickers: [
      { ticker: "FPH.NZ", price: 28, signal: "Buy" }, { ticker: "AIR.NZ", price: 0.6, signal: "Sell" }, { ticker: "SPK.NZ", price: 3, signal: "Hold" }, { ticker: "X", price: 0, signal: "Buy" },
    ] }) });
    expect(calls).toHaveLength(3);
    expect(await verifyCall(calls[0])).toBe(true);
    expect(await verifyCall({ ...calls[0], priceAtCall: 29 })).toBe(false);
    expect(scoreCall(calls[0], 27)).toBe("miss");
    expect(scoreCall(calls[1], 0.5)).toBe("hit");
    const card = await weeklyScorecard("2026-10-18", calls, { [calls[0].hash]: 27 });
    expect(card).toMatchObject({ hits: 0, misses: 1, pending: 1, unscored: 1, published: false });
    expect(card.scorecardHash).toMatch(/^[0-9a-f]{64}$/);
    expect(await verifyScorecard(card)).toBe(true);
    expect(card.calls.some((c) => c.result === "miss")).toBe(true);
    expect(await verifyScorecard({ ...card, misses: 0 })).toBe(false);
  });
});
