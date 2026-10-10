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
import { realisedByTaxYear, REALISED_ASSUMPTIONS, type RealisedLine, type RealisedReport } from "@/lib/tax-realised";
import { taxYearChoices } from "@/lib/taxable-income";

export const dynamic = "force-dynamic";

export const metadata = {
  ...publicPageMetadata("/tax/realised", {
    title: "Realised profit and loss · AetherForge AI",
    description: "Indicative FIFO realised profit and loss for a New Zealand tax year. Not tax advice.",
  }),
  // Member books can sit on this URL. Keep it reachable and leave it out of the index.
  robots: { index: false, follow: false },
};

function moneyOrBlank(value: number | null): string {
  if (value == null) return "—";
  return formatSignedMoney(value);
}

function DisposalTable({ rows }: { rows: RealisedLine[] }) {
  if (rows.length === 0) {
    return <p className="mt-2 text-sm text-muted-foreground">No disposals in this tax year.</p>;
  }
  return (
    <div className="mt-3 overflow-x-auto rounded-2xl border border-border/70">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2 font-medium">Date</th>
            <th className="px-3 py-2 font-medium">Holding</th>
            <th className="px-3 py-2 text-right font-medium">Quantity</th>
            <th className="px-3 py-2 text-right font-medium">Price gain</th>
            <th className="px-3 py-2 text-right font-medium">FX gain</th>
            <th className="px-3 py-2 text-right font-medium">Sell fee</th>
            <th className="px-3 py-2 text-right font-medium">Realised</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.ticker}-${row.when}-${index}`} className="border-b border-border/40 last:border-0">
              <td className="px-3 py-2">{formatDisplayDate(row.when)}</td>
              <td className="px-3 py-2">
                {row.ticker}
                {row.lots.length > 0 ? (
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {row.lots.map((lot, lotIndex) => (
                      <span key={`${lot.acquired}-${lotIndex}`} className="block">
                        Lot {formatDisplayDate(lot.acquired)} · qty {lot.quantity} · cost {formatNzd(lot.costBasisNzd)}
                      </span>
                    ))}
                    {row.proceedsNzd != null ? <span className="block">Proceeds {formatNzd(row.proceedsNzd)}</span> : null}
                  </span>
                ) : null}
                {row.diffNote ? <span className="mt-0.5 block text-xs text-muted-foreground">{row.diffNote}</span> : null}
              </td>
              <td className="tnum px-3 py-2 text-right">{row.quantity}</td>
              <td className="tnum px-3 py-2 text-right">{moneyOrBlank(row.pricePnlNzd)}</td>
              <td className="tnum px-3 py-2 text-right">{moneyOrBlank(row.fxPnlNzd)}</td>
              <td className="tnum px-3 py-2 text-right">{moneyOrBlank(row.feeNzd)}</td>
              <td className="tnum px-3 py-2 text-right">{moneyOrBlank(row.realisedNzd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReportBody({ report }: { report: RealisedReport }) {
  return (
    <>
      <h2 className="mt-8 font-display text-lg font-semibold">Other disposals</h2>
      <p className="mt-2 text-sm text-muted-foreground">Shares and other holdings, closed oldest first.</p>
      <DisposalTable rows={report.other} />
      <p className="mt-2 text-sm text-muted-foreground">Total {formatSignedMoney(report.otherTotalNzd)}.</p>

      <h2 className="mt-8 font-display text-lg font-semibold">Crypto disposals</h2>
      <p className="mt-2 text-sm text-muted-foreground">Crypto disposals in NZ$, closed oldest first.</p>
      <DisposalTable rows={report.crypto} />
      <p className="mt-2 text-sm text-muted-foreground">Total {formatSignedMoney(report.cryptoTotalNzd)}.</p>

      <h2 className="mt-8 font-display text-lg font-semibold">Combined</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Combined realised {formatSignedMoney(report.combinedNzd)}. This adds the two totals above. A blank row is not
        counted as zero.
        {report.blankCount > 0
          ? ` ${report.blankCount} disposal${report.blankCount === 1 ? "" : "s"} ${report.blankCount === 1 ? "is" : "are"} blank because a rate or a lot was missing.`
          : ""}
        {report.storedDiffCount > 0
          ? ` ${report.storedDiffCount} row${report.storedDiffCount === 1 ? "" : "s"} differ from the amount stored on the sell. The income summary keeps those stored amounts, including a stored NZ$0.00.`
          : ""}
      </p>
    </>
  );
}

export default async function RealisedPage({
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

  let report: RealisedReport | null = null;
  let years = [current];
  let readError = false;
  if (user) {
    try {
      const rows = await loadTaxRows(user._id);
      years = taxYearChoices(rows, today);
      if (!years.includes(endingYear)) years = [endingYear, ...years];
      report = realisedByTaxYear(rows, endingYear);
    } catch {
      readError = true;
    }
  }

  return (
    <AppShell user={shellUser} guest={!user}>
      <article className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">New Zealand</p>
        <h1 className="mt-2 font-display text-3xl font-bold">Realised profit and loss</h1>
        <TaxSectionNav current="/tax/realised" />
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{TAX_INDICATIVE_LABEL}</p>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          FIFO working for {nzTaxYearLabel(endingYear)}. The taxable-income page still shows the realised amount stored
          on each sell. This page rebuilds the gain from the lots.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-2 print:hidden">
          {years.map((year) => (
            <Link
              key={year}
              href={`/tax/realised?year=${year}`}
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
              href={`/api/tax/realised/export?year=${endingYear}`}
              allowed={canExportCsv(user.subscription_plan)}
              exportName="Realised CSV"
            />
          ) : null}
          {user && report ? <PrintButton /> : null}
        </div>
        {!user ? (
          <p className="mt-6 text-sm text-muted-foreground">
            <a className="text-primary underline-offset-4 hover:underline" href="/login?redirect=%2Ftax%2Frealised">
              Sign in
            </a>{" "}
            to build this paper from your book.
          </p>
        ) : readError ? (
          <p className="mt-6 text-sm text-muted-foreground">The working paper could not be read.</p>
        ) : report ? (
          <ReportBody report={report} />
        ) : null}
        <h2 className="mt-8 font-display text-lg font-semibold">Assumptions</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {REALISED_ASSUMPTIONS.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="mt-8 text-sm text-muted-foreground">{TAX_INDICATIVE_LABEL}</p>
      </article>
    </AppShell>
  );
}
