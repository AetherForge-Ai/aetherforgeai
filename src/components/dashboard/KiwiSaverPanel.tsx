"use client";

import { useMemo, useState } from "react";
import {
  G22_LABEL,
  G22_SOURCES,
  NZ_SUPER_2026,
  S2_PRIOR_RATE_FOR_YEAR,
  S2_RATE_FOR_YEAR,
  cents,
  contributionsForYear,
  coupleNzSuperNetYear,
  formatNzd,
  inTodaysDollars,
  netReturn,
  projectBalance,
  rate,
} from "@/lib/kiwisaver";

/**
 * G-22 (GOAL-LOCK #57): KiwiSaver and NZ Super in the goal planner. Exact cents, half-up. Inputs stay in
 * this browser; nothing is saved (no new tables). Illustrative, not financial advice.
 */
export function KiwiSaverPanel() {
  const [salary, setSalary] = useState("85000");
  const [age, setAge] = useState("30");
  const [balance, setBalance] = useState("20000");
  const view = useMemo(() => {
    try {
      const s = cents(salary || "0");
      const years = Math.max(0, 65 - Math.floor(Number(age) || 0));
      const year1 = contributionsForYear({
        salary: s,
        paysPerYear: 12,
        employeeRate: rate(35, 1000),
        employerRate: rate(35, 1000),
        esctThreshold: s + (s * BigInt(3)) / BigInt(100),
      });
      const at = (r: ReturnType<typeof rate>) =>
        projectBalance({ openingBalance: cents(balance || "0"), salary: s, years, rateForYear: S2_RATE_FOR_YEAR, priorEmployerRateForYear: S2_PRIOR_RATE_FOR_YEAR, netReturn: r });
      const mid = at(netReturn(rate(625, 10000), rate(28, 100), rate(5, 1000)));
      return { year1, years, mid, today: inTodaysDollars(mid, rate(2, 100), years), low: at(rate(25, 1000)), high: at(rate(55, 1000)) };
    } catch {
      return null;
    }
  }, [salary, age, balance]);
  return (
    <section className="mt-6 space-y-3 rounded-2xl border border-border/70 bg-card/70 p-4 text-sm" data-kiwisaver-panel>
      <h3 className="font-display text-base font-bold">KiwiSaver and NZ Super</h3>
      <p className="font-semibold" data-g22-label>{G22_LABEL}</p>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Salary (NZ$ a year)</span>
          <input className="w-full rounded border px-2 py-1" inputMode="decimal" value={salary} onChange={(e) => setSalary(e.target.value.replace(/[^0-9.]/g, ""))} />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Age</span>
          <input className="w-full rounded border px-2 py-1" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, ""))} />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">KiwiSaver balance (NZ$)</span>
          <input className="w-full rounded border px-2 py-1" inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value.replace(/[^0-9.]/g, ""))} />
        </label>
      </div>
      {view ? (
        <ul className="space-y-1" data-kiwisaver-results>
          <li>This year (monthly pay, 3.5% each, ESCT on whole dollars per pay): you {formatNzd(view.year1.employee)}, employer after ESCT {formatNzd(view.year1.employerNet)}, government {formatNzd(view.year1.government)}; total {formatNzd(view.year1.total)}.</li>
          <li>At 65 ({view.years} years; 4% each from 1 Apr 2028; 4.00% a year after PIE tax at 28% and 0.50% fees): {formatNzd(view.mid)}, about {formatNzd(view.today)} in today&apos;s dollars at 2% inflation. Range {formatNzd(view.low)} (2.5% a year) to {formatNzd(view.high)} (5.5% a year).</li>
          <li>NZ Super for a couple who both qualify (rates from {NZ_SUPER_2026.ratesFrom}, tax code M): {formatNzd(coupleNzSuperNetYear())} a year after tax.</li>
        </ul>
      ) : (
        <p role="status">Enter amounts as numbers to see the figures.</p>
      )}
      <p className="text-xs text-muted-foreground">
        Simplified: salary held flat, contributions credited at year end, the government contribution paid in full each year (really 1 Jul–30 Jun, pro-rated at 65), fees vary by provider.
      </p>
      <details className="text-xs text-muted-foreground" data-g22-sources>
        <summary>Sources and dates</summary>
        <ul className="mt-1 space-y-1">
          {G22_SOURCES.map((s) => (
            <li key={s.id}>
              {s.what}: <a className="underline" href={s.url} rel="noreferrer" target="_blank">{new URL(s.url).hostname}</a> ({s.dated})
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
