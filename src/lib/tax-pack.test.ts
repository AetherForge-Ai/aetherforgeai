import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildFifPaper } from "@/lib/fif-working-paper";
import { realisedByTaxYear } from "@/lib/tax-realised";
import {
  cryptoDisposalCsv,
  fifCsv,
  fifPaperLines,
  realisedPaperLines,
  salesSummary,
  taxCompleteness,
  taxPaperPdf,
  TAX_PACK_NOTE,
} from "@/lib/tax-pack";
import type { TaxLedgerRow } from "@/lib/taxable-income";

function read(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

const shareBook: TaxLedgerRow[] = [
  { type: "buy", ticker: "FBU.NZ", asset_type: "stock", executed_at: "2026-05-01", quantity: 10, price: 2, currency: "NZD", fx_rate: 1 },
  { type: "buy", ticker: "FBU.NZ", asset_type: "stock", executed_at: "2026-06-01", quantity: 10, price: 3, currency: "NZD", fx_rate: 1 },
  { type: "sell", ticker: "FBU.NZ", asset_type: "stock", executed_at: "2026-08-01", quantity: 15, price: 4, currency: "NZD", fx_rate: 1, fees_nzd: 0 },
];

const cryptoBook: TaxLedgerRow[] = [
  { type: "buy", ticker: "ETH", asset_type: "crypto", executed_at: "2026-04-02", quantity: 2, price: 100, currency: "USD", fx_rate: 1.6 },
  { type: "sell", ticker: "ETH", asset_type: "crypto", executed_at: "2026-09-01", quantity: 1, price: 150, currency: "USD", fx_rate: 1.7 },
];

describe("tax pack", () => {
  it("matches the example crypto disposal to the cent on CSV and PDF", () => {
    const report = realisedByTaxYear([...shareBook, ...cryptoBook], 2027);
    const summary = salesSummary(report);
    expect(summary.otherRealisedNzd).toBe(25);
    expect(summary.cryptoRealisedNzd).toBe(95);
    expect(summary.combinedNzd).toBe(120);
    expect(summary.cryptoProceedsNzd).toBe(255);
    expect(summary.cryptoCostNzd).toBe(160);

    const csv = cryptoDisposalCsv(report, (value) => value);
    expect(csv).toContain("2026-09-01,ETH,1,255.00,160.00,95.00");
    expect(csv).toContain(",,total,255.00,160.00,95.00");
    expect(csv).toContain("Indicative, not tax advice.");

    const pdf = taxPaperPdf({
      title: "Realised profit and loss",
      taxYear: report.label,
      lines: realisedPaperLines(report),
    });
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf.indexOf("Indicative, not tax advice.")).toBeLessThan(pdf.indexOf("Realised profit and loss"));
    expect(pdf).toContain(TAX_PACK_NOTE);
    expect(pdf).toContain("Other realised NZD 25.00");
    expect(pdf).toContain("Crypto FIFO NZD 95.00");
    expect(pdf).toContain("Combined NZD 120.00");
    expect(pdf).toContain("Crypto proceeds NZD 255.00");
    expect(pdf).toContain("Crypto cost NZD 160.00");
    expect(pdf).toContain(report.label);
  });

  it("leaves the FIF total blank when a foreign buy has no exchange rate", () => {
    const paper = buildFifPaper({
      rows: [
        {
          type: "buy",
          ticker: "MSFT",
          asset_type: "stock",
          executed_at: "2026-05-01",
          quantity: 1,
          price: 10,
          currency: "USD",
          fx_rate: null,
        },
      ],
      markets: [],
      endingYear: 2027,
    });
    const csv = fifCsv(paper);
    const peak = csv.split("\n").find((line) => line.startsWith(",peak-cost,"));
    expect(peak).toBe(',peak-cost,,,,,,"Indicative, not tax advice."');
    expect(csv).toContain(
      "The $50,000 cost test is not calculated because a foreign attributing buy has no stored exchange rate."
    );
    const pdf = taxPaperPdf({
      title: "FIF working paper",
      taxYear: paper.label,
      lines: fifPaperLines(paper),
    });
    expect(pdf).toContain("Indicative, not tax advice.");
    expect(pdf).toContain("Peak cost NZD not calculated");
    expect(pdf).toContain("no stored exchange rate");
  });

  it("lists a buy missing an exchange rate and a dividend missing gross", () => {
    const items = taxCompleteness([
      { type: "buy", ticker: "msft", currency: "USD", fx_rate: null },
      { type: "buy", ticker: "AIR.NZ", currency: "NZD", fx_rate: 1 },
      { type: "dividend", ticker: "fbu.nz", notes: "cash only" },
    ]);
    expect(items.map((item) => item.detail)).toEqual([
      "Buys missing FX rate: MSFT has no stored exchange rate.",
      "Dividends missing gross: FBU.NZ has cash but no stored gross.",
    ]);
  });

  it("keeps the label on each working paper and leaves sign-off and banned words out", () => {
    const pages = [
      "src/components/tax/TaxPageContent.tsx",
      "src/app/tax/fif/page.tsx",
      "src/app/tax/realised/page.tsx",
      "src/app/tax/income/page.tsx",
      "src/components/tax/DividendLedgerView.tsx",
    ];
    const taxWord = ["G", "ST"].join("");
    const pack = read("src/lib/tax-pack.ts");
    expect(pack).toContain("pull-check:batch2-2026-10-11 B2-4");
    expect(pack).toContain("TAX_INDICATIVE_LABEL");
    expect(pack).not.toContain(taxWord);
    expect(pack).not.toMatch(/\b(SuperGrok|Grok|xAI|Claude|Gemini|GPT-\d|ZENITH|ULTRA)\b/);
    for (const rel of pages) {
      const text = read(rel);
      expect(text, rel).toContain("TAX_INDICATIVE_LABEL");
      expect(text, rel).not.toContain(taxWord);
    }
    expect(read("src/app/tax/fif/page.tsx")).toContain("/api/tax/fif/export");
    expect(read("src/app/tax/fif/page.tsx")).toContain("paper=fif");
    expect(read("src/app/tax/realised/page.tsx")).toContain("/api/tax/crypto/export");
    expect(read("src/app/tax/realised/page.tsx")).toContain("salesSummary");
    expect(read("src/app/tax/income/page.tsx")).toContain("paper=income");
    expect(read("src/components/tax/DividendLedgerView.tsx")).toContain("paper=dividends");
    expect(read("src/app/api/tax/fif/export/route.ts")).toContain("canExportCsv");
    expect(read("src/app/api/tax/pack/pdf/route.ts")).toContain("canExportCsv");
  });
});
