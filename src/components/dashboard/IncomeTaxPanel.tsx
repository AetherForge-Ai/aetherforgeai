"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { incomeTaxSummary, taxYearsOnBook, type TaxFigure } from "@/lib/income-tax-summary";
import { aucklandCivilToday, nzTaxYearEnding } from "@/lib/nz-tax-year";
import type { PortfolioSnapshot } from "@/lib/portfolio-snapshot";

export function IncomeTaxPanel({ snapshot, loading }: { snapshot: PortfolioSnapshot | null; loading: boolean }) {
  const years = useMemo(() => (snapshot ? taxYearsOnBook(snapshot) : []), [snapshot]);
  const current = nzTaxYearEnding(aucklandCivilToday()) ?? years[0] ?? new Date().getFullYear();
  const [year, setYear] = useState<number>(current);
  const selected = years.includes(year) ? year : years[0] ?? current;
  const summary = snapshot ? incomeTaxSummary(snapshot, selected) : null;

  return (
    <section className="space-y-4" data-section="income-tax" aria-busy={loading || undefined}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Income and tax</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Figures come from the ledger for the selected New Zealand tax year.
          </p>
        </div>
        <label className="text-xs text-muted-foreground">
          Tax year
          <select
            aria-label="Tax year"
            value={selected}
            disabled={loading || !snapshot}
            onChange={(event) => setYear(Number(event.target.value))}
            className="mt-1 block rounded-md border border-border/70 bg-background px-2 py-1.5 text-sm text-foreground"
          >
            {(years.length ? years : [selected]).map((ending) => (
              <option key={ending} value={ending}>
                Year ending 31 Mar {ending}
              </option>
            ))}
          </select>
        </label>
      </div>
      {loading || !snapshot || !summary ? (
        <div className="h-24 animate-pulse rounded-2xl bg-muted/40 motion-reduce:animate-none" />
      ) : summary.empty ? (
        <div className="rounded-2xl border border-dashed border-border/70 bg-card/40 p-5">
          <p className="text-sm font-medium">Nothing recorded for {summary.label}.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Dividends and realised gains will show here when the ledger has them. FIF stays blank until an opening value is stored.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <FigureCard label="Dividend cash" figure={summary.dividends} />
          <FigureCard label="Realised" figure={summary.realised} />
        </div>
      )}
      {summary ? (
        <div className="rounded-2xl border border-border/70 bg-card/50 p-4">
          <h3 className="text-sm font-semibold">FIF</h3>
          <p className="mt-1 text-xs text-muted-foreground">{summary.label}</p>
          <p className="mt-2 text-lg font-bold" title={summary.fif.reason || undefined}>
            {summary.fif.display}
            {summary.fif.reason ? <span className="sr-only"> {summary.fif.reason}</span> : null}
          </p>
          {summary.fif.reason ? <p className="mt-1 text-xs text-muted-foreground">{summary.fif.reason}</p> : null}
        </div>
      ) : null}
      <p className="text-sm">
        <Link href="/tax" className="font-semibold text-primary hover:underline">
          Tax papers
        </Link>
      </p>
    </section>
  );
}

function FigureCard({ label, figure }: { label: string; figure: TaxFigure }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card/50 p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-bold" title={figure.reason || undefined}>
        {figure.display}
        {figure.reason ? <span className="sr-only"> {figure.reason}</span> : null}
      </p>
      {figure.reason ? <p className="mt-1 text-xs text-muted-foreground">{figure.reason}</p> : null}
    </div>
  );
}
