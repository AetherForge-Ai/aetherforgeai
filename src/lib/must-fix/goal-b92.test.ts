/** b92 (Build 3): M-3 copy, G-01 dividends ledger, G-08 0.01 oz Held row, G-12 FIF cents. pull-check:v3-b92-2026-10-31 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { BOT_EXAMPLES, BOT_GUIDE_PARAGRAPHS, BOT_PAGE_NOTES } from "@/lib/bot-guides";
import {
  buildDividendRecord,
  dividendCsv,
  dividendIncome,
  dividendViewFromRow,
  summariseDividends,
  withDividendNotes,
} from "@/lib/dividend-ledger";
import { heldMetalRows } from "@/lib/metal-valuation";
import { buildFifPaper, fifTotals } from "@/lib/fif-working-paper";
import { fifCsv } from "@/lib/tax-pack";
import { formatNzd, moneyCell } from "@/lib/currency";

const read = (p: string) => readFileSync(p, "utf8");
const sentences = (text: string) => text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
const pageCell = (v: number) => formatNzd(v).replace(/[^0-9.-]/g, "");

describe("b92 version", () => {
  it("build version is b92 and the qa file keeps the b91 line", () => {
    expect(read("public/build-version.txt").trim()).toBe("v3-b93-2026-10-31");
    const qa = read("qa/PULL-CHECK-2026-10-12.md");
    expect(qa).toContain("pull-check:v3-b92-2026-10-31 — b92:");
    expect(qa).toContain("pull-check:v3-b91-2026-10-29");
  });
});

describe("M-3 copy: no repeated sentence on a bot page", () => {
  for (const kind of ["stox", "koins", "smitty", "headmaster"] as const) {
    it(`${kind}: every sentence of the guide, note and example appears once`, () => {
      const all = sentences([...BOT_GUIDE_PARAGRAPHS[kind], BOT_PAGE_NOTES[kind], BOT_EXAMPLES[kind].report].join(" "));
      const repeats = all.filter((s, i) => all.indexOf(s) !== i);
      expect(repeats).toEqual([]);
    });
  }
  it("the TT 29 Oct repeats now appear once", () => {
    const count = (kind: "koins" | "headmaster", s: string) => sentences(BOT_GUIDE_PARAGRAPHS[kind].join(" ")).filter((x) => x === s).length;
    expect(count("headmaster", "Starter includes a basic Headmaster.")).toBe(1);
    expect(count("headmaster", "Pro and Ultimate include the full planner.")).toBe(1);
    expect(count("koins", "Free and Starter include one of Stox or Koins.")).toBe(1);
  });
});

function divRow(id: string, when: string, ticker: string, rec: Parameters<typeof buildDividendRecord>[0]) {
  const built = buildDividendRecord(rec);
  if (!built.ok) throw new Error(built.message);
  return dividendViewFromRow({
    _id: id,
    type: "dividend",
    ticker,
    asset_type: "stock",
    executed_at: when,
    cash_nzd: built.parts.netCashNzd,
    notes: withDividendNotes("", built.parts),
  });
}

describe("G-01 dividends: NZ imputed, US 15% withheld, DRP; CSV = page; 31 Mar / 1 Apr", () => {
  // 31 Mar 2026 23:59 NZDT = 10:59Z; 1 Apr 2026 00:00 NZDT = 11:00Z.
  const rows = [
    divRow("nz", "2026-03-31T10:59:00Z", "FPH.NZ", { grossNative: 100, imputationNzd: 38.89, withholdingNative: 0, drpNative: 0, currency: "NZD", fx: 1 }),
    divRow("us", "2026-03-31T11:00:00Z", "AAPL", { grossNative: 33.33, imputationNzd: 0, withholdingNative: 5, drpNative: 0, currency: "USD", fx: 1.7123 }),
    divRow("drp", "2026-04-15", "AIR.NZ", { grossNative: 50, imputationNzd: 19.44, withholdingNative: 0, drpNative: 50, currency: "NZD", fx: 1, drpShares: 75 }),
  ];
  const income = dividendIncome(rows, { asOf: "2026-10-28", costNzd: 10000, valueNzd: 12000 });

  it("each row is right to the cent", () => {
    expect(rows[0].parts).toMatchObject({ grossNzd: 100, imputationNzd: 38.89, netCashNzd: 100 });
    // US$33.33 × 1.7123 = 57.07; US$5.00 (15%) withheld × 1.7123 = 8.56
    expect(rows[1].parts).toMatchObject({ grossNzd: 57.07, withholdingNzd: 8.56, netCashNzd: 48.51 });
    expect(rows[2].parts).toMatchObject({ grossNzd: 50, drpNzd: 50, netCashNzd: 0, drpShares: 75 });
  });

  it("31 Mar lands in the year ending 2026, 1 Apr in the year ending 2027", () => {
    expect(income.years.map((y) => [y.endingYear, y.grossNzd, y.netCashNzd, y.totalReturnNzd])).toEqual([
      [2026, 100, 100, 100],
      [2027, 107.07, 48.51, 98.51],
    ]);
    expect(income.months.map((m) => [m.month, m.grossNzd])).toEqual([
      ["2026-03", 100],
      ["2026-04", 107.07],
    ]);
  });

  it("cash and total return include the DRP line once; DRP listed", () => {
    expect(income.cashNzd).toBe(148.51);
    expect(income.totalReturnNzd).toBe(198.51);
    expect(income.drp.map((r) => r.ticker)).toEqual(["AIR.NZ"]);
    expect(income.yieldOnCost).toBeCloseTo(207.07 / 10000, 10);
    expect(income.yieldOnValue).toBeCloseTo(207.07 / 12000, 10);
  });

  it("CSV total row = page totals", () => {
    const totals = summariseDividends(rows);
    const last = dividendCsv(rows, (d) => d).trim().split("\n").pop()!.split(",");
    expect(last.slice(5, 10)).toEqual(
      [totals.grossNzd, totals.imputationNzd, totals.withholdingNzd, totals.drpNzd, totals.netCashNzd].map(pageCell)
    );
    expect(last.slice(5, 10)).toEqual(["207.07", "58.33", "8.56", "50.00", "148.51"]);
  });
});

describe("G-08 metals: a Free book with 0.01 oz gold gets a Held row", () => {
  it("0.01 oz is a row, shown as 0.01 oz", () => {
    const rows = heldMetalRows([{ id: "l1", metal: "gold", ounces: 0.01, purchasePerOz: 4500, marketValueNZD: 0, source: "ledger" }], { gold: 7391.47 });
    expect(rows).toHaveLength(1);
    expect(rows[0].ounces.toLocaleString("en-NZ", { maximumFractionDigits: 4 })).toBe("0.01");
    expect(rows[0].valueNzd).toBe(73.91);
  });
  it("the metals panel has no 'paid plan' sentence", () => {
    expect(read("src/components/dashboard/PreciousMetals.tsx")).not.toMatch(/paid plan/i);
    expect(read("src/app/dashboard/metals/page.tsx")).not.toMatch(/paid plan/i);
  });
});

describe("G-12 FIF: 5-holding fixture sums to the printed total; CSV = page", () => {
  const buys = [
    ["AAPL", 7, 189.33, 1.6789],
    ["MSFT", 3, 411.07, 1.6611],
    ["VOO", 11, 503.19, 1.7013],
    ["NVDA", 13, 121.77, 1.6955],
    ["TSLA", 2, 243.55, 1.6722],
  ] as const;
  const rows = buys.map(([ticker, quantity, price, fx], i) => ({
    _id: `b${i}`, type: "buy", ticker, asset_type: "stock", quantity, price, currency: "USD", fx_rate: fx, executed_at: "2025-03-10",
  }));
  const markets = buys.map(([ticker], i) => ({ ticker, openingNzd: 2000.1 + i * 3333.3, closingNzd: 2100.07 + i * 3333.3 }));
  const paper = buildFifPaper({ rows, markets, endingYear: 2026 });

  it("all five attribute and the total is the sum of the rounded lines", () => {
    expect(paper.attributing).toHaveLength(5);
    const totals = fifTotals(paper.attributing);
    for (const key of ["costNzd", "fdrNzd"] as const) {
      const cents = paper.attributing.reduce((s, p) => s + Math.round(Number(moneyCell(p[key]!)) * 100), 0);
      expect(Math.round(totals[key]! * 100)).toBe(cents);
    }
  });

  it("each CSV line and the CSV total equal the page figures", () => {
    const lines = fifCsv(paper).split("\n");
    for (const p of paper.attributing) {
      const cells = lines.find((l) => l.startsWith(`${p.ticker},`))!.split(",");
      expect(cells[2]).toBe(pageCell(p.costNzd!));
      expect(cells[5]).toBe(pageCell(p.fdrNzd!));
    }
    const total = lines.find((l) => l.startsWith("Total,"))!.split(",");
    const t = fifTotals(paper.attributing);
    expect([total[2], total[5]]).toEqual([pageCell(t.costNzd!), pageCell(t.fdrNzd!)]);
  });
});
