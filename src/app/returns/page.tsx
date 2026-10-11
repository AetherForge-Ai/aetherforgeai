import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { SiteHeader } from "@/components/SiteHeader";
import { aucklandCivilToday } from "@/lib/nz-tax-year";
import {
  cashBookPoints,
  externalFlowsFromLedger,
  performanceReport,
  type PerformanceFigure,
  type PerformanceReport,
} from "@/lib/performance-math";
import { publicPageMetadata } from "@/lib/reviewed-book";
import { getCurrentUser } from "@/lib/session";
import { loadOpenHoldings, loadTaxRows } from "@/lib/tax-book-server";

export const dynamic = "force-dynamic";

export const metadata = publicPageMetadata("/returns", {
  title: "Return · AetherForge AI",
  description:
    "Money-weighted and time-weighted return for a paper book, with a benchmark only when a delayed public price series is attached.",
});

function percent(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "Not shown";
  return `${(value * 100).toFixed(2)}%`;
}

function FigureLine({ label, figure }: { label: string; figure: PerformanceFigure }) {
  return (
    <p className="text-sm leading-relaxed">
      <span className="font-semibold text-foreground">{label}: </span>
      <span className="tnum">{percent(figure.value)}</span>
      {figure.reason ? <span className="text-muted-foreground"> {figure.reason}</span> : null}
      <span className="mt-0.5 block text-xs text-muted-foreground">
        As of {figure.asOf}. Source: {figure.source}.
      </span>
    </p>
  );
}

function ReportBlock({ report }: { report: PerformanceReport }) {
  const rows: { label: string; figure: PerformanceFigure }[] = [
    { label: "Money-weighted return (XIRR), since start", figure: report.xirr },
    { label: "Time-weighted return, since start", figure: report.twr },
  ];
  if (report.benchmark) rows.push({ label: "Benchmark, bought on deposit dates", figure: report.benchmark });
  return (
    <div className="mt-4 space-y-3">
      {rows.map((row) => (
        <FigureLine key={row.label} label={row.label} figure={row.figure} />
      ))}
      <div className="grid gap-3 sm:grid-cols-2">
        {(Object.keys(report.periods) as (keyof PerformanceReport["periods"])[]).map((period) => (
          <div key={period} className="rounded-xl border border-border/70 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">{period}</p>
            <FigureLine label="XIRR" figure={report.periods[period].xirr} />
            <FigureLine label="Time-weighted" figure={report.periods[period].twr} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function ReturnsPage() {
  const user = await getCurrentUser();
  let report: PerformanceReport | null = null;
  let note = "Sign in to see the deposits and withdrawals on your paper book.";
  if (user) {
    try {
      const [rows, holdings] = await Promise.all([loadTaxRows(user._id), loadOpenHoldings(user._id)]);
      const flows = externalFlowsFromLedger(rows);
      if (holdings.length > 0) {
        note =
          "Return is not shown. This book has holdings, and no market valuation with a source was attached. Cost is not used as a market value.";
      } else if (!flows.length) {
        note = "This book has no deposit or withdrawal to measure.";
      } else {
        const cash = typeof user.cash_balance === "number" ? user.cash_balance : 0;
        const book = cashBookPoints(flows, cash);
        if (!book) {
          note =
            "Return is not shown. The paper cash balance does not equal deposits minus withdrawals, so a valuation was not assumed.";
        } else {
          report = performanceReport({
            points: book.points,
            endingNzd: book.endingNzd,
            asOf: aucklandCivilToday(),
            source: "Paper cash balance",
          });
          note = "This book has no holdings. The valuation is the paper cash balance.";
        }
      }
    } catch {
      note = "The book could not be read.";
    }
  }

  const shell = (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="font-display text-3xl font-bold">Return</h1>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        Money-weighted return (XIRR) uses deposits, withdrawals, and a valuation. Time-weighted return
        links the change in value between those cash flows. A benchmark buys the NZX 50 or the S&amp;P 500
        on your own deposit dates when a public price series is attached. That series is delayed public
        market data (Yahoo Finance), not a direct NZX or ASX feed. Every figure shows its as-of date and
        its source. A missing valuation is left blank.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Periods are one month, three months, the calendar year to date, one year, and since the first
        cash flow. Buys and sells inside the book are not treated as new money. Per-holding return uses
        the same working once that holding has its own valuation.
      </p>
      <p className="mt-6 text-sm leading-relaxed text-muted-foreground">{note}</p>
      {report ? <ReportBlock report={report} /> : null}
      {!user ? (
        <p className="mt-4 text-sm">
          <Link href="/login?redirect=%2Freturns" className="font-semibold text-primary underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      ) : null}
      <p className="mt-8 text-sm text-muted-foreground">
        <Link href="/docs" className="font-semibold text-primary underline-offset-4 hover:underline">
          Docs
        </Link>
      </p>
    </main>
  );

  if (!user) {
    return (
      <div className="relative min-h-screen bg-grid">
        <div className="pointer-events-none absolute inset-0 bg-aurora" />
        <div className="relative">
          <SiteHeader />
          {shell}
        </div>
      </div>
    );
  }

  return (
    <AppShell
      user={{
        name: user.name,
        email: user.email,
        image: user.image,
        subscription_status: user.subscription_status,
        subscription_plan: user.subscription_plan,
      }}
    >
      {shell}
    </AppShell>
  );
}
