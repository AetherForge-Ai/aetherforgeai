"use client";

import { useMemo, useState } from "react";
import {
  G22_LABEL,
  G22_SOURCES,
  NZ_SUPER_2026,
  cents,
  contributionsForYear,
  formatNzd,
  rate,
} from "@/lib/kiwisaver";
import {
  EMPLOYEE_RATE_CHOICES,
  type Household,
  planRange,
  retirementIncomeYear1,
  runWhatIfs,
} from "@/lib/kiwisaver-planner";

const HOUSEHOLDS: Array<[Household, string]> = [
  ["single-alone", "Single, living alone"],
  ["single-sharing", "Single, sharing"],
  ["couple-both", "Couple, both qualify"],
];

/**
 * G-22 (GOAL-LOCK #57): KiwiSaver and NZ Super in the goal planner. Exact cents, half-up. b65 adds the
 * what-ifs (rate, extra contributions, retirement age, pay rises), ranges and the NZ Super household.
 * Inputs stay in this browser; nothing is saved until the goal_plan table exists. Illustrative, not financial advice.
 */
export function KiwiSaverPanel() {
  const [salary, setSalary] = useState("85000");
  const [age, setAge] = useState("30");
  const [balance, setBalance] = useState("20000");
  const [ratePm, setRatePm] = useState<number>(35);
  const [extra, setExtra] = useState("0");
  const [retireAge, setRetireAge] = useState("65");
  const [household, setHousehold] = useState<Household>("couple-both");
  const view = useMemo(() => {
    try {
      const s = cents(salary || "0");
      const base = {
        age: Math.floor(Number(age) || 0),
        retireAge: Math.min(75, Math.max(Math.floor(Number(age) || 0), Math.floor(Number(retireAge) || 65))),
        openingBalance: cents(balance || "0"),
        salary: s,
        employeeRatePerMille: ratePm,
        voluntaryYearly: cents(extra || "0"),
      };
      const year1 = contributionsForYear({
        salary: s,
        paysPerYear: 12,
        employeeRate: rate(ratePm, 1000),
        employerRate: rate(35, 1000),
        esctThreshold: s + (s * BigInt(3)) / BigInt(100),
      });
      const range = planRange(base);
      const whatIfs = runWhatIfs(base);
      const income = retirementIncomeYear1(household, range.mid);
      return { year1, range, whatIfs, income, retireAge: base.retireAge };
    } catch {
      return null;
    }
  }, [salary, age, balance, ratePm, extra, retireAge, household]);
  const field = "w-full rounded border px-2 py-1";
  return (
    <section className="mt-6 space-y-3 rounded-2xl border border-border/70 bg-card/70 p-4 text-sm" data-kiwisaver-panel aria-labelledby="g22-title">
      <h3 id="g22-title" className="font-display text-base font-bold">KiwiSaver and NZ Super</h3>
      <p className="font-semibold" data-g22-label>{G22_LABEL}</p>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Salary (NZ$ a year)</span>
          <input className={field} inputMode="decimal" value={salary} onChange={(e) => setSalary(e.target.value.replace(/[^0-9.]/g, ""))} />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Age</span>
          <input className={field} inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, ""))} />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">KiwiSaver balance (NZ$)</span>
          <input className={field} inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value.replace(/[^0-9.]/g, ""))} />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Your contribution rate</span>
          <select className={field} value={ratePm} onChange={(e) => setRatePm(Number(e.target.value))} data-g22-rate>
            {EMPLOYEE_RATE_CHOICES.map((r) => (
              <option key={r} value={r}>{(r / 10).toFixed(1)}%</option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Extra you add (NZ$ a year)</span>
          <input className={field} inputMode="decimal" value={extra} onChange={(e) => setExtra(e.target.value.replace(/[^0-9.]/g, ""))} data-g22-extra />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Withdraw at age</span>
          <input className={field} inputMode="numeric" value={retireAge} onChange={(e) => setRetireAge(e.target.value.replace(/\D/g, ""))} data-g22-retire />
        </label>
        <label className="space-y-1 sm:col-span-3">
          <span className="text-xs text-muted-foreground">NZ Super household</span>
          <select className={field} value={household} onChange={(e) => setHousehold(e.target.value as Household)} data-g22-household>
            {HOUSEHOLDS.map(([k, l]) => (
              <option key={k} value={k}>{l}</option>
            ))}
          </select>
        </label>
      </div>
      {view ? (
        <>
          <ul className="space-y-1" data-kiwisaver-results>
            <li>This year (monthly pay, you {(ratePm / 10).toFixed(1)}%, employer 3.5%, ESCT on whole dollars per pay): you {formatNzd(view.year1.employee)}, employer after ESCT {formatNzd(view.year1.employerNet)}, government {formatNzd(view.year1.government)}; total {formatNzd(view.year1.total)}.</li>
            <li data-g22-range>At {view.retireAge} ({view.range.years} years; at least 4% each from 1 Apr 2028; 4.00% a year after PIE tax at 28% and 0.50% fees): {formatNzd(view.range.mid)}, about {formatNzd(view.range.midToday)} in today&apos;s dollars at 2% inflation. Range {formatNzd(view.range.low)} (2.5% a year) to {formatNzd(view.range.high)} (5.5% a year).</li>
            <li data-g22-income>First year of retirement: NZ Super {formatNzd(view.income.nzSuper)} after tax (code M, rates from {NZ_SUPER_2026.ratesFrom}) plus a 4% KiwiSaver draw of {formatNzd(view.income.draw)} (not taxed) = {formatNzd(view.income.total)}.</li>
          </ul>
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="What-ifs (scrolls sideways)">
            <table className="w-full text-left text-xs" data-g22-whatifs>
              <caption className="sr-only">What-ifs against your plan</caption>
              <thead className="text-muted-foreground">
                <tr>
                  <th scope="col" className="py-1 pr-2">What if…</th>
                  <th scope="col" className="py-1 pr-2 text-right">Low (2.5%)</th>
                  <th scope="col" className="py-1 pr-2 text-right">Middle (4.0%)</th>
                  <th scope="col" className="py-1 pr-2 text-right">High (5.5%)</th>
                  <th scope="col" className="py-1 text-right">Change (middle)</th>
                </tr>
              </thead>
              <tbody>
                {view.whatIfs.map((w) => (
                  <tr key={w.id} className="border-t" data-g22-whatif={w.id}>
                    <th scope="row" className="py-1 pr-2 font-normal">{w.label}</th>
                    <td className="py-1 pr-2 text-right tnum">{formatNzd(w.low)}</td>
                    <td className="py-1 pr-2 text-right tnum">{formatNzd(w.mid)}</td>
                    <td className="py-1 pr-2 text-right tnum">{formatNzd(w.high)}</td>
                    <td className="py-1 text-right tnum">{w.vsBase >= BigInt(0) ? "+" : ""}{formatNzd(w.vsBase)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
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
