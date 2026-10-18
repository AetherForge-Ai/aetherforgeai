"use client";

import { useEffect, useState } from "react";
import { BENCHMARKS, bookPerformance, pct, type BookPerformance } from "@/lib/performance-book";
import { performanceSourceLine, type PerformanceFigure, type PerformancePeriod } from "@/lib/performance-math";
import { formatDisplayDate, formatDisplayDateTime } from "@/lib/currency";

const PERIOD_LABEL: Record<PerformancePeriod, string> = { "1M": "1M", "3M": "3M", YTD: "YTD", "1Y": "1Y", since: "Since start" };

function Figure({ label, f }: { label: string; f: PerformanceFigure }) {
  return (
    <div className="rounded-xl border border-border/70 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="tnum mt-1 text-2xl font-bold" data-perf-value>{pct(f.value)}</p>
      {f.value != null && f.annualised === false ? <p className="text-xs text-muted-foreground">Not annualised: under 90 days.</p> : null}
      {f.reason ? <p className="mt-1 text-xs text-muted-foreground">{f.reason}</p> : null}
      <p className="mt-2 text-[0.7rem] text-muted-foreground">{performanceSourceLine(f)}</p>
    </div>
  );
}

/** Goal b12 G-02 panel. Reads the same snapshot the dashboard header uses. */
export function PerformancePanel() {
  const [state, setState] = useState<{ perf: BookPerformance; asOf: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bench, setBench] = useState<BenchRow[] | null>(null);
  useEffect(() => {
    fetch("/api/portfolio/snapshot", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: any) => {
        if (!j?.ok || !j.data) throw new Error("Portfolio snapshot unavailable");
        const asOfIso = String(j.data.asOf || new Date().toISOString());
        const asOf = new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Auckland" }).format(new Date(asOfIso));
        const perf = bookPerformance({ ledger: j.data.ledger || [], netWorthNzd: j.data.kpis?.netWorth?.value ?? null, asOf, source: j.data.source || "Portfolio snapshot" });
        fetch(`/api/benchmarks?asOf=${asOf}&start=${perf.startDate ?? ""}`)
          .then((r) => r.json())
          .then((b: { benchmarks?: BenchRow[] }) => setBench(b.benchmarks ?? []))
          .catch(() => setBench([]));
        setState({
          asOf: asOfIso,
          perf: bookPerformance({ ledger: j.data.ledger || [], netWorthNzd: j.data.kpis?.netWorth?.value ?? null, asOf, source: j.data.source || "Portfolio snapshot" }),
        });
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load performance"));
  }, []);

  return (
    <main className="mx-auto max-w-5xl space-y-6" aria-labelledby="perf-title">
      <header>
        <h1 id="perf-title" className="font-display text-2xl font-bold">Performance</h1>
        <p className="text-sm text-muted-foreground">
          Money-weighted (XIRR) and time-weighted (TWR) returns from your deposits, withdrawals and today&apos;s net worth.
          General information, not financial advice.
        </p>
      </header>
      {error ? <p role="alert" className="text-sm">— {error}</p> : null}
      {!state && !error ? <p className="text-sm text-muted-foreground" aria-live="polite">Loading performance…</p> : null}
      {state && !state.perf.report ? <p className="rounded-xl border p-4 text-sm" data-perf-empty>{state.perf.message}</p> : null}
      {state?.perf.report ? (
        <>
          <p className="text-xs text-muted-foreground">As of {formatDisplayDateTime(state.asOf)} · {state.perf.flows} cash flow{state.perf.flows === 1 ? "" : "s"}</p>
          {state.perf.message ? <p className="text-sm text-muted-foreground">{state.perf.message}</p> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Figure label="XIRR since start" f={state.perf.report.xirr} />
            <Figure label="TWR since start" f={state.perf.report.twr} />
          </div>
          <section aria-labelledby="perf-periods">
            <h2 id="perf-periods" className="font-display text-lg font-semibold">Periods</h2>
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-muted-foreground"><th className="py-2">Period</th><th className="text-right">XIRR</th><th className="text-right">TWR</th><th className="text-right">NZX 50</th><th className="text-right">S&amp;P 500 (NZ$)</th><th className="pl-4">Note</th></tr>
              </thead>
              <tbody>
                {(Object.keys(PERIOD_LABEL) as PerformancePeriod[]).map((p) => {
                  const row = state.perf.report!.periods[p];
                  return (
                    <tr key={p} className="border-t border-border/60">
                      <th scope="row" className="py-2 text-left font-medium">{PERIOD_LABEL[p]}</th>
                      <td className="tnum text-right">{pct(row.xirr.value)}</td>
                      <td className="tnum text-right">{pct(row.twr.value)}</td>
                      {(["nzx50", "sp500nzd"] as const).map((id) => {
                        const b = bench?.find((x) => x.id === id)?.periods[p];
                        return (
                          <td key={id} className="tnum text-right" data-bench={id} title={b?.reason ?? undefined}>
                            {b ? pct(b.value) : "—"}
                          </td>
                        );
                      })}
                      <td className="pl-4 text-xs text-muted-foreground">{row.xirr.reason || row.twr.reason || ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
          <section aria-labelledby="perf-bench">
            <h2 id="perf-bench" className="font-display text-lg font-semibold">Benchmarks</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {bench && bench.length
                ? bench.map((b) => (
                    <li key={b.id} data-bench-source>
                      <strong>{b.name}:</strong> {b.id === "nzx50" ? "S&P/NZX 50 Gross index (dividends included)" : "price return (dividends not included)"}, as of {formatDisplayDate(b.asOf)} close · {b.source}
                    </li>
                  ))
                : BENCHMARKS.map((b) => (
                    <li key={b.name}><strong>{b.name}:</strong> — <span className="text-muted-foreground">{bench ? "The stored index history could not be read." : "Loading the stored index history."}</span></li>
                  ))}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">Dates shown as {formatDisplayDate(state.asOf)}. Delayed public data, not a direct NZX/ASX feed.</p>
            {/* Goal b22 G-02: both dates side by side, so a book on today's quotes is not read as a same-day comparison. */}
            {bench && bench.length > 0 ? (
              <p className="mt-1 text-xs" data-compare-dates>
                Book valued {formatDisplayDate(state.asOf)} · benchmarks{" "}
                {Array.from(new Set(bench.map((b) => b.asOf))).map((d) => formatDisplayDate(d)).join(", ")} close
                {bench.some((b) => b.asOf.slice(0, 10) !== new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Auckland" }).format(new Date(state.asOf)))
                  ? ". The dates differ, so this is not a same-day comparison."
                  : ". Same date."}
              </p>
            ) : null}
          </section>
        </>
      ) : null}
    </main>
  );
}

type BenchRow = {
  id: "nzx50" | "sp500nzd";
  name: string;
  asOf: string;
  source: string;
  periods: Record<PerformancePeriod, { value: number | null; reason: string | null }>;
};
