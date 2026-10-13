/**
 * Income and FIF lines for one New Zealand tax year, from the snapshot ledger.
 * A missing opening value stays a dash. Nothing here is estimated.
 */

import { formatNzd } from "@/lib/currency";
import { aucklandCivilToday, inNzTaxYear, nzTaxYearEnding, nzTaxYearLabel } from "@/lib/nz-tax-year";
import type { PortfolioSnapshot } from "@/lib/portfolio-snapshot";

export interface TaxFigure {
  display: string;
  reason: string | null;
}

export interface IncomeTaxSummary {
  endingYear: number;
  label: string;
  dividends: TaxFigure;
  realised: TaxFigure;
  fif: TaxFigure;
  /** True when this year has no dividend and no sale on the ledger. */
  empty: boolean;
}

export function taxYearsOnBook(snapshot: PortfolioSnapshot, today = aucklandCivilToday()): number[] {
  const years = new Set<number>();
  const current = nzTaxYearEnding(today);
  if (current) years.add(current);
  for (const line of snapshot.ledger) {
    const year = nzTaxYearEnding(line.when);
    if (year) years.add(year);
  }
  return [...years].sort((a, b) => b - a);
}

export function incomeTaxSummary(snapshot: PortfolioSnapshot, endingYear: number): IncomeTaxSummary {
  const lines = snapshot.ledger.filter((line) => inNzTaxYear(line.when, endingYear));
  const dividends = lines.filter((line) => line.type === "dividend" || line.type === "interest");
  const sales = lines.filter((line) => line.type === "sell");
  const realisedKnown = sales.filter((line) => line.realisedNzd != null && Number.isFinite(line.realisedNzd));
  const dividendSum = dividends.reduce((sum, line) => sum + (Number.isFinite(line.cashNzd) ? line.cashNzd : 0), 0);
  const realisedSum = realisedKnown.reduce((sum, line) => sum + (line.realisedNzd as number), 0);
  const foreign = snapshot.groups
    .flatMap((group) => group.positions)
    .filter((position) => position.assetClass === "shares" && position.currency !== "NZD" && !position.closed);
  const dividendFigure: TaxFigure = dividends.length
    ? { display: formatNzd(dividendSum), reason: null }
    : { display: "—", reason: "No dividends were recorded for this tax year." };
  const realisedFigure: TaxFigure =
    sales.length === 0
      ? { display: "—", reason: "No sales were recorded for this tax year." }
      : realisedKnown.length === 0
        ? { display: "—", reason: "Realised gain was not stored on the sales in this tax year." }
        : { display: formatNzd(realisedSum), reason: null };
  const fif: TaxFigure = {
    display: "—",
    reason: foreign.length
      ? "FIF opening value is not stored for this tax year."
      : "No foreign shares are open on this book, so there is no FIF figure.",
  };
  return {
    endingYear,
    label: nzTaxYearLabel(endingYear),
    dividends: dividendFigure,
    realised: realisedFigure,
    fif,
    empty: dividends.length === 0 && sales.length === 0,
  };
}
