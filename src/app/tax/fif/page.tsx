import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { CsvExportButton } from "@/components/tax/CsvExportButton";
import { FifPositionCard } from "@/components/tax/FifWorkingPaper";
import { PrintButton } from "@/components/tax/PrintButton";
import { TaxCompletenessList } from "@/components/tax/TaxCompletenessList";
import { TaxSectionNav } from "@/components/tax/TaxSectionNav";
import { canExportCsv } from "@/lib/entitlements";
import { formatNzd } from "@/lib/currency";
import {
  FIF_ASSUMPTIONS,
  FIF_SOURCES,
  buildFifPaper,
  fifThresholdSentence,
  marketsFromNotes,
} from "@/lib/fif-working-paper";
import { aucklandCivilToday, isNzTaxYearEnding, nzTaxYearEnding, nzTaxYearLabel } from "@/lib/nz-tax-year";
import { publicPageMetadata } from "@/lib/reviewed-book";
import { getCurrentUser } from "@/lib/session";
import { loadStockNoteRows, loadTaxRows } from "@/lib/tax-book-server";
import { TAX_INDICATIVE_LABEL } from "@/lib/tax-disclaimer";
import { TAX_PACK_NOTE, taxCompleteness } from "@/lib/tax-pack";
import { taxYearChoices, type TaxLedgerRow } from "@/lib/taxable-income";

export const dynamic = "force-dynamic";

export const metadata = {
  ...publicPageMetadata("/tax/fif", {
    title: "FIF working paper · AetherForge AI",
    description: "Indicative foreign investment fund working paper. Not tax advice.",
  }),
  // Member books can sit on this URL. Keep it reachable and leave it out of the index.
  robots: { index: false, follow: false },
};

export default async function FifPage({
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

  let paper = buildFifPaper({ rows: [], markets: [], endingYear });
  let years = [current];
  let saveable = new Set<string>();
  let readError = false;
  let ledgerRows: TaxLedgerRow[] = [];
  if (user) {
    try {
      const [rows, stocks] = await Promise.all([loadTaxRows(user._id), loadStockNoteRows(user._id)]);
      ledgerRows = rows;
      years = taxYearChoices(rows, today);
      if (!years.includes(endingYear)) years = [endingYear, ...years];
      paper = buildFifPaper({
        rows,
        markets: marketsFromNotes(stocks, endingYear),
        endingYear,
      });
      saveable = new Set(stocks.map((stock) => stock.ticker));
    } catch {
      readError = true;
    }
  }

  return (
    <AppShell user={shellUser} guest={!user}>
      <article className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">New Zealand</p>
        <h1 className="mt-2 font-display text-3xl font-bold">FIF working paper</h1>
        <TaxSectionNav current="/tax/fif" />
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{TAX_INDICATIVE_LABEL}</p>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Indicative foreign investment fund paper for {nzTaxYearLabel(endingYear)}. Cost is taken from your ledger.
          Opening and closing market values are figures you enter. A live price is not used as the 1 April or 31 March
          value.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-2 print:hidden">
          {years.map((year) => (
            <Link
              key={year}
              href={`/tax/fif?year=${year}`}
              className={
                year === endingYear
                  ? "rounded-lg border border-primary bg-primary/10 px-2.5 py-1.5 text-xs font-semibold text-primary"
                  : "rounded-lg border border-border/70 px-2.5 py-1.5 text-xs font-semibold text-muted-foreground"
              }
            >
              {nzTaxYearLabel(year)}
            </Link>
          ))}
          {user && !readError ? (
            <>
              <CsvExportButton
                href={`/api/tax/fif/export?year=${endingYear}`}
                allowed={canExportCsv(user.subscription_plan)}
                exportName="FIF CSV"
              />
              <CsvExportButton
                href={`/api/tax/pack/pdf?paper=fif&year=${endingYear}`}
                allowed={canExportCsv(user.subscription_plan)}
                exportName="FIF PDF"
                idleLabel="PDF"
              />
              <PrintButton />
            </>
          ) : null}
        </div>
        {user && !readError ? <p className="mt-3 text-sm text-muted-foreground">{TAX_PACK_NOTE}</p> : null}

        {!user ? (
          <p className="mt-6 text-sm text-muted-foreground">
            <a className="text-primary underline-offset-4 hover:underline" href="/login?redirect=%2Ftax%2Ffif">
              Sign in
            </a>{" "}
            to build this paper from your book.
          </p>
        ) : readError ? (
          <p className="mt-6 text-sm text-muted-foreground">The working paper could not be read.</p>
        ) : (
          <>
            <h2 className="mt-8 font-display text-lg font-semibold">$50,000 cost test</h2>
            <p className="mt-2 text-sm text-muted-foreground">{fifThresholdSentence(paper)}</p>

            <h2 className="mt-8 font-display text-lg font-semibold">Attributing interests</h2>
            {paper.attributing.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                {paper.peakCostNzd != null && paper.peakCostNzd > 0
                  ? "No other overseas shares on this book. The cost above includes the Australian listings."
                  : "No attributing overseas shares on this book."}
              </p>
            ) : (
              paper.attributing.map((position) => (
                <FifPositionCard
                  key={position.ticker}
                  position={position}
                  year={endingYear}
                  canSave={saveable.has(position.ticker)}
                />
              ))
            )}

            <h2 className="mt-8 font-display text-lg font-semibold">Australian listings</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Australian listings are included in the highest cost above. Inland Revenue says an exemption can apply when the
              company is on the ASX list Inland Revenue names, is Australian resident and not treated as resident in another country
              under a treaty, maintains a franking account, and the stock is not stapled. This book cannot check those
              conditions. If you leave an exempt company out, remove that cost from the total. Australian franking credits cannot be claimed in New
              Zealand. Fair dividend rate and comparative value are not calculated for this group.
            </p>
            {paper.australian.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No Australian listings on this book.</p>
            ) : (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {paper.australian.map((position) => (
                  <li key={position.ticker}>
                    {position.ticker}: cost {position.costNzd == null ? "Not recorded" : formatNzd(position.costNzd)}.
                  </li>
                ))}
              </ul>
            )}

            {paper.newZealand.length > 0 ? (
              <>
                <h2 className="mt-8 font-display text-lg font-semibold">New Zealand listings</h2>
                <p className="mt-2 text-sm text-muted-foreground">Left out of this paper: {paper.newZealand.join(", ")}.</p>
              </>
            ) : null}
          </>
        )}

        {user && !readError ? <TaxCompletenessList items={taxCompleteness(ledgerRows)} /> : null}

        <h2 className="mt-8 font-display text-lg font-semibold">Assumptions</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {FIF_ASSUMPTIONS.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>

        <h2 className="mt-8 font-display text-lg font-semibold">Inland Revenue pages used</h2>
        <ul className="mt-2 space-y-2 text-sm">
          {FIF_SOURCES.map((source) => (
            <li key={source.href}>
              <a href={source.href} className="text-primary underline-offset-4 hover:underline" rel="noreferrer">
                {source.label}
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-sm text-muted-foreground">{TAX_INDICATIVE_LABEL}</p>
      </article>
    </AppShell>
  );
}
