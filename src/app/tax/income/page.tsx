import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { CsvExportButton } from "@/components/tax/CsvExportButton";
import { PrintButton } from "@/components/tax/PrintButton";
import { TaxSectionNav } from "@/components/tax/TaxSectionNav";
import { formatDisplayDate, formatNzd, formatSignedMoney } from "@/lib/currency";
import { canExportCsv } from "@/lib/entitlements";
import { aucklandCivilToday, isNzTaxYearEnding, nzTaxYearEnding, nzTaxYearLabel } from "@/lib/nz-tax-year";
import { publicPageMetadata } from "@/lib/reviewed-book";
import { getCurrentUser } from "@/lib/session";
import { loadTaxRows } from "@/lib/tax-book-server";
import { TAX_INDICATIVE_LABEL } from "@/lib/tax-disclaimer";
import { taxableIncome, taxYearChoices, type TaxableIncomeReport } from "@/lib/taxable-income";

export const dynamic = "force-dynamic";

export const metadata = {
  ...publicPageMetadata("/tax/income", {
    title: "Income summary (indicative) · AetherForge AI",
    description: "Indicative income summary for a New Zealand tax year. Not tax advice.",
  }),
  // Member books can sit on this URL. Keep it reachable and leave it out of the index.
  robots: { index: false, follow: false },
};

function moneyOrBlank(value: number | null): string {
  if (value == null) return "—";
  return formatNzd(value);
}

function ReportTables({ report }: { report: TaxableIncomeReport }) {
  return (
    <>
      <h2 className="mt-8 font-display text-lg font-semibold">Dividends</h2>
      {report.dividends.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No dividends in this tax year.</p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-2xl border border-border/70">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Holding</th>
                <th className="px-3 py-2 text-right font-medium">Gross</th>
                <th className="px-3 py-2 text-right font-medium">Imputation credits</th>
                <th className="px-3 py-2 text-right font-medium">Withholding</th>
                <th className="px-3 py-2 text-right font-medium">DRP</th>
              </tr>
            </thead>
            <tbody>
              {report.dividends.map((row, index) => (
                <tr key={`${row.ticker}-${row.when}-${index}`} className="border-b border-border/40 last:border-0">
                  <td className="px-3 py-2">{formatDisplayDate(row.when)}</td>
                  <td className="px-3 py-2">
                    {row.ticker || "—"}
                    {row.legacyCashNzd != null ? (
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        Cash, no breakdown: {formatNzd(row.legacyCashNzd)}. This cash is not added to gross.
                      </span>
                    ) : null}
                  </td>
                  <td className="tnum px-3 py-2 text-right">{moneyOrBlank(row.grossNzd)}</td>
                  <td className="tnum px-3 py-2 text-right">{moneyOrBlank(row.imputationNzd)}</td>
                  <td className="tnum px-3 py-2 text-right">{moneyOrBlank(row.withholdingNzd)}</td>
                  <td className="tnum px-3 py-2 text-right">{moneyOrBlank(row.drpNzd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mt-8 font-display text-lg font-semibold">Realised gains</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        This is the realised amount stored on each sell in this tax year. A sell with no stored amount is left blank
        and is not counted as zero.
      </p>
      {report.realised.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No sells in this tax year.</p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-2xl border border-border/70">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Holding</th>
                <th className="px-3 py-2 text-right font-medium">Realised</th>
              </tr>
            </thead>
            <tbody>
              {report.realised.map((row, index) => (
                <tr key={`${row.ticker}-${row.when}-${index}`} className="border-b border-border/40 last:border-0">
                  <td className="px-3 py-2">{formatDisplayDate(row.when)}</td>
                  <td className="px-3 py-2">{row.ticker || "—"}</td>
                  <td className="tnum px-3 py-2 text-right">
                    {row.realisedNzd == null ? "—" : formatSignedMoney(row.realisedNzd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mt-8 font-display text-lg font-semibold">Totals</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Gross {formatNzd(report.grossNzd)}. Imputation credits {formatNzd(report.imputationNzd)}. Withholding{" "}
        {formatNzd(report.withholdingNzd)}. DRP {formatNzd(report.drpNzd)}. Realised{" "}
        {formatSignedMoney(report.realisedNzd)}.
        {report.legacyCount > 0
          ? ` Cash, no breakdown: ${formatNzd(report.legacyCashNzd)} on ${report.legacyCount} row${report.legacyCount === 1 ? "" : "s"}. That cash is not added to gross.`
          : ""}
      </p>
    </>
  );
}

export default async function TaxableIncomePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const user = await getCurrentUser();
  const shellUser = user
    ? {
        name: user.name,
        email: user.email,
        image: user.image,
        subscription_status: user.subscription_status,
        subscription_plan: user.subscription_plan,
      }
    : { name: "Guest", email: "Sign in to activate your account" };

  const today = aucklandCivilToday();
  const current = nzTaxYearEnding(today) ?? new Date().getFullYear();
  const requested = Number((await searchParams).year);
  const endingYear = isNzTaxYearEnding(requested) ? requested : current;

  let report: TaxableIncomeReport | null = null;
  let years: number[] = [current];
  let readError = false;
  if (user) {
    try {
      const rows = await loadTaxRows(user._id);
      years = taxYearChoices(rows, today);
      if (!years.includes(endingYear)) years = [endingYear, ...years];
      report = taxableIncome(rows, endingYear);
    } catch {
      readError = true;
    }
  }

  return (
    <AppShell user={shellUser} guest={!user}>
      <article className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">New Zealand</p>
        <h1 className="mt-2 font-display text-3xl font-bold">Income summary (indicative)</h1>
        <TaxSectionNav current="/tax/income" />
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{TAX_INDICATIVE_LABEL}</p>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Summary for the income year {nzTaxYearLabel(endingYear)}. The year runs from 1 April to 31 March. Dividends
          show gross, NZ imputation credits and withholding in NZ$. Realised gains are included where a sell stored one.
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>This paper reads up to 5,000 ledger rows.</li>
          <li>A dividend saved without a breakdown is shown as cash only and is not added to gross.</li>
          <li>
            Realised amounts are the figures stored on the sell. The FIFO paper is the{" "}
            <Link href="/tax/realised" className="text-primary underline-offset-4 hover:underline">
              realised profit and loss
            </Link>{" "}
            page.
          </li>
        </ul>

        <div className="mt-6 flex flex-wrap items-center gap-2 print:hidden">
          {years.map((year) => (
            <Link
              key={year}
              href={`/tax/income?year=${year}`}
              className={
                year === endingYear
                  ? "rounded-lg border border-primary bg-primary/10 px-2.5 py-1.5 text-xs font-semibold text-primary"
                  : "rounded-lg border border-border/70 px-2.5 py-1.5 text-xs font-semibold text-muted-foreground"
              }
            >
              {nzTaxYearLabel(year)}
            </Link>
          ))}
          {user && report ? (
            <CsvExportButton
              href={`/api/tax/income/export?year=${endingYear}`}
              allowed={canExportCsv(user.subscription_plan)}
            />
          ) : null}
          {user && report ? <PrintButton /> : null}
        </div>

        {!user ? (
          <p className="mt-6 text-sm text-muted-foreground">
            <a className="text-primary underline-offset-4 hover:underline" href="/login?redirect=%2Ftax%2Fincome">
              Sign in
            </a>{" "}
            to summarise your paper book.
          </p>
        ) : readError ? (
          <p className="mt-6 text-sm text-muted-foreground">The ledger could not be read.</p>
        ) : report ? (
          <ReportTables report={report} />
        ) : null}
        <p className="mt-8 text-sm text-muted-foreground">{TAX_INDICATIVE_LABEL}</p>
      </article>
    </AppShell>
  );
}
