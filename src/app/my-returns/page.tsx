import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { JsonLd } from "@/components/public/JsonLd";
import { SiteHeader } from "@/components/SiteHeader";
import { holdingBookValuation, type MarkedHolding } from "@/lib/book-valuation";
import { currencyForTicker, roundMoney } from "@/lib/currency";
import { getFxSnapshot } from "@/lib/fx";
import { aucklandCivilToday } from "@/lib/nz-tax-year";
import {
  cashBookPoints,
  externalFlowsFromLedger,
  performanceReport,
  performanceSourceLine,
  type PerformanceFigure,
  type PerformanceReport,
} from "@/lib/performance-math";
import { breadcrumbJsonLd } from "@/lib/public-schema";
import { publicPageMetadata } from "@/lib/reviewed-book";
import { getCurrentUser } from "@/lib/session";
import { loadHoldingMarks, loadOpenHoldings, loadTaxRows } from "@/lib/tax-book-server";
import { fetchYahooCloseOn } from "@/lib/yahoo-finance";

export const dynamic = "force-dynamic";

export const metadata = publicPageMetadata("/my-returns", {
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
      <span className="mt-0.5 block text-xs text-muted-foreground">{performanceSourceLine(figure)}</span>
    </p>
  );
}

function ReportBlock({ report }: { report: PerformanceReport }) {
  const rows: { label: string; figure: PerformanceFigure }[] = [
    {
      label:
        report.xirr.annualised === false
          ? "Period return, since start"
          : "Money-weighted return (XIRR), since start",
      figure: report.xirr,
    },
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
            <FigureLine
              label={report.periods[period].xirr.annualised === false ? "Period return" : "XIRR"}
              figure={report.periods[period].xirr}
            />
            <FigureLine label="Time-weighted" figure={report.periods[period].twr} />
          </div>
        ))}
      </div>
    </div>
  );
}

async function indexPrices(dates: string[]): Promise<{ date: string; level: number }[]> {
  const prices: { date: string; level: number }[] = [];
  for (const date of dates) {
    try {
      const level = await fetchYahooCloseOn("^NZ50", date);
      if (level != null && level > 0) prices.push({ date, level });
    } catch {
      // A missing public price stays missing. No level is invented.
    }
  }
  return prices;
}

export default async function ReturnsPage() {
  const user = await getCurrentUser();
  let report: PerformanceReport | null = null;
  let note = "Sign in to see the deposits and withdrawals on your paper book.";
  if (user) {
    try {
      const [rows, open, marks] = await Promise.all([
        loadTaxRows(user._id),
        loadOpenHoldings(user._id),
        loadHoldingMarks(user._id),
      ]);
      const flows = externalFlowsFromLedger(rows);
      const today = aucklandCivilToday();
      if (open.length > 0) {
        const byTicker = new Map(marks.map((row) => [row.ticker, row]));
        const holdings: MarkedHolding[] = open.map((row) => {
          const stored = byTicker.get(row.ticker);
          if (stored) return stored;
          return {
            ticker: row.ticker,
            shares: row.shares,
            currentPrice: null,
            currency: currencyForTicker(row.ticker, row.assetType),
            updatedAt: null,
          };
        });
        const fx = await getFxSnapshot();
        const valuation = holdingBookValuation(holdings, fx.ratesToNZD, today);
        if (valuation.ok === false) {
          note = `Return is not shown. ${valuation.reason}`;
        } else if (!flows.length) {
          note = "This book has no deposit or withdrawal to measure. The stored marks are not turned into a return without one.";
        } else {
          const cash = typeof user.cash_balance === "number" ? user.cash_balance : 0;
          const dates = [...new Set([...flows.map((flow) => flow.date), valuation.asOf])];
          const prices = await indexPrices(dates);
          report = performanceReport({
            points: flows.map((flow) => ({
              date: flow.date,
              valueBeforeNzd: 0,
              flowNzd: flow.amountNzd,
              valueKnown: false,
            })),
            endingNzd: roundMoney(valuation.holdingsNzd + cash),
            asOf: valuation.asOf,
            source: valuation.source,
            benchmark: {
              name: "NZX 50",
              source: "A delayed public price for ^NZ50. This is not a direct NZX feed.",
              prices,
            },
          });
          note = "The ending value is the stored marks plus paper cash. Buys and sells are not treated as new money.";
        }
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
            asOf: today,
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
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Return", path: "/my-returns" },
        ])}
      />
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
