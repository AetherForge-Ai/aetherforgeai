"use client";

import type { ReactNode } from "react";
import Link from "next/link";

import { FigureReadout } from "@/components/dashboard/ShowTheMaths";
import { formatNzd } from "@/lib/currency";
import { MISSING_MARK, type PortfolioSnapshot } from "@/lib/portfolio-snapshot";

export function IncomeTaxPanel({ snapshot, loading }: { snapshot: PortfolioSnapshot | null; loading: boolean }) {
  const dividends = (snapshot?.ledger || []).filter((line) => line.type === "dividend");
  const taxLines = (snapshot?.ledger || []).filter((line) => line.type === "tax");
  return (
    <section className="space-y-4" data-section="income-tax" aria-busy={loading || undefined}>
      <div>
        <h2 className="text-base font-semibold">Income and tax</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Income on the total return is the net figure. Tax papers are the same book.
        </p>
      </div>
      {loading || !snapshot ? (
        <div className="h-24 animate-pulse rounded-2xl bg-muted/40 motion-reduce:animate-none" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <FigureCard label="Gross">
            <FigureReadout figure={snapshot.kpis.incomeGross} label="Gross income" showReason className="items-start" />
          </FigureCard>
          <FigureCard label="Withholding">
            <FigureReadout figure={snapshot.kpis.incomeWithholding} label="Withholding" showReason className="items-start" />
          </FigureCard>
          <FigureCard label="Net">
            <FigureReadout figure={snapshot.kpis.income} label="Net income" showReason className="items-start" />
          </FigureCard>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <LedgerList title="Dividends and income" empty="No dividends or income recorded." rows={dividends} />
        <LedgerList title="Tax" empty="No tax lines recorded." rows={taxLines} />
      </div>
      <p className="text-sm">
        <Link href="/tax" className="font-semibold text-primary hover:underline">
          Tax papers
        </Link>
      </p>
    </section>
  );
}

function FigureCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card/50 p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function LedgerList({
  title,
  empty,
  rows,
}: {
  title: string;
  empty: string;
  rows: PortfolioSnapshot["ledger"];
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card/50 p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-2 text-sm">
          {rows.map((line) => (
            <li key={line.id} className="flex items-baseline justify-between gap-3">
              <span>
                {line.ticker || "Cash"} · {line.whenLabel}
              </span>
              <span className="tnum">{Number.isFinite(line.cashNzd) ? formatNzd(line.cashNzd) : MISSING_MARK}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
