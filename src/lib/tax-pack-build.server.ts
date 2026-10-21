import "server-only";
import { formatDisplayDate } from "@/lib/currency";
import { dividendCsv, dividendViewFromRow, summariseDividends } from "@/lib/dividend-ledger";
import { buildFifPaper, marketsFromNotes } from "@/lib/fif-working-paper";
import { readFifThreshold } from "@/lib/fif-setting.server";
import { inNzTaxYear } from "@/lib/nz-tax-year";
import { loadDividendRows, loadStockNoteRows, loadTaxRows } from "@/lib/tax-book-server";
import { dividendPaperLines, fifCsv, fifPaperLines, fxRateLines, incomePaperLines, realisedPaperLines, taxPaperPdf } from "@/lib/tax-pack";
import { corporateActionsCsv, positionsCsv, tradesCsv } from "@/lib/tax-pack-zip";
import { realisedByTaxYear, realisedCsv } from "@/lib/tax-realised";
import { taxableIncome, taxableIncomeCsv } from "@/lib/taxable-income";
import { buildIr3Helper, ir3HelperCsv, ir3PaperLines } from "@/lib/ir3/ir3-helper";

/** b29 H-9: one build of the full tax pack, so the PDF and the ZIP come from the same data. */
export async function buildFullTaxPack(userId: string, endingYear: number) {
  const [rows, stocks, divRows, thresholdNzd] = await Promise.all([
    loadTaxRows(userId),
    loadStockNoteRows(userId),
    loadDividendRows(userId),
    readFifThreshold(userId),
  ]);
  const fif = buildFifPaper({ rows, markets: marketsFromNotes(stocks, endingYear), endingYear, thresholdNzd });
  const realised = realisedByTaxYear(rows, endingYear);
  const income = taxableIncome(rows, endingYear);
  const divs = divRows.map(dividendViewFromRow).filter((row) => inNzTaxYear(row.when, endingYear));
  const yearRows = (rows as unknown as { executed_at?: string | null }[]).filter((r) => r.executed_at && inNzTaxYear(String(r.executed_at), endingYear));
  const ir3 = buildIr3Helper({ income, fif }); // G-31: same reports as sections 1 and 3
  const lines = [
    "", "1. FIF working paper", ...fifPaperLines(fif, rows as never),
    "", "2. Realised profit and loss", ...realisedPaperLines(realised),
    "", "3. Income summary", ...incomePaperLines(income),
    "", "4. Dividend ledger", ...dividendPaperLines(summariseDividends(divs)),
    "", "5. FX rates", ...fxRateLines(yearRows as never),
    "", "6. IR3 helper", ...ir3PaperLines(ir3),
  ];
  const pdf = taxPaperPdf({ title: "NZ tax pack", taxYear: fif.label, lines, endingYear });
  const fmt = (value: string) => {
    const shown = formatDisplayDate(value);
    return shown === "—" ? "" : shown;
  };
  return {
    fif,
    ir3,
    pdf,
    csvs: {
      realised: realisedCsv(realised, fmt),
      dividends: dividendCsv(divs, fmt),
      fif: fifCsv(fif),
      income: taxableIncomeCsv(income, fmt),
      positions: positionsCsv(fif),
      trades: tradesCsv(rows, endingYear),
      corporateActions: corporateActionsCsv(rows, endingYear),
      ir3: ir3HelperCsv(ir3),
    },
  };
}
