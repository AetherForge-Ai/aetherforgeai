/**
 * b65 G-22 (GOAL-LOCK #57): NZ goal planner depth — what-ifs and ranges on top of kiwisaver.ts.
 * Exact cents (bigint), half-up. Every figure here is "Illustrative, not financial advice."
 * Sources: /workspace/aetherforge-plan/G22-KIWISAVER-SOURCES.md (K1–K13, NZ Super table, tax codes).
 * With the default inputs projectPlan() reproduces S2 exactly ($518,456.89; range $375,965.22–$727,177.72).
 */
import {
  type Cents,
  type Rate,
  NZ_SUPER_2026,
  applyRate,
  cents,
  esctRate,
  governmentContribution,
  inTodaysDollars,
  netReturn,
  rate,
} from "@/lib/kiwisaver";

export { G22_LABEL } from "@/lib/kiwisaver";

/** K3: employee rate choices from 1 Apr 2026 (per mille). 4% becomes the default from 1 Apr 2028 (K2). */
export const EMPLOYEE_RATE_CHOICES = [35, 40, 60, 80, 100] as const;
export type EmployeeRateChoice = (typeof EMPLOYEE_RATE_CHOICES)[number];

/** Default (and employer compulsory) rate for model year y, where y = 0 is 2026–27. */
export const defaultRateForYear = (y: number): Rate => (y < 2 ? rate(35, 1000) : rate(4, 100));
const priorEmployerRate = (y: number): Rate => (y === 0 ? rate(3, 100) : defaultRateForYear(y - 1));

/** Employee rate: the chosen rate, but never below the default for that year (3.5% → 4% from 2028). */
export function employeeRateForYear(choicePerMille: number, y: number): Rate {
  const d = defaultRateForYear(y);
  const chosen = rate(choicePerMille, 1000);
  return chosen.n * d.d >= d.n * chosen.d ? chosen : d;
}

export interface PlanInput {
  age: number;
  retireAge?: number;
  openingBalance: Cents;
  salary: Cents;
  employeeRatePerMille?: number;
  /** Voluntary member contributions a year (count toward the government contribution). */
  voluntaryYearly?: Cents;
  /** Salary growth a year (0 = flat, as S2). */
  salaryGrowth?: Rate;
  netReturn: Rate;
}

export interface PlanYear {
  year: number;
  age: number;
  salary: Cents;
  employee: Cents;
  employerNet: Cents;
  government: Cents;
  growth: Cents;
  closing: Cents;
}

/** Annual mode (S2 method): B(t+1) = B(t) + round(B(t)·r) + own + employer net of ESCT + govt. */
export function projectPlan(input: PlanInput): { years: PlanYear[]; balance: Cents } {
  const retire = input.retireAge ?? 65;
  const n = Math.max(0, Math.floor(retire) - Math.floor(input.age));
  const choice = input.employeeRatePerMille ?? 35;
  const voluntary = input.voluntaryYearly ?? BigInt(0);
  let bal = input.openingBalance;
  let salary = input.salary;
  const out: PlanYear[] = [];
  for (let y = 0; y < n; y++) {
    if (y > 0 && input.salaryGrowth) salary = salary + applyRate(salary, input.salaryGrowth);
    const age = Math.floor(input.age) + y;
    const employerRate = defaultRateForYear(y);
    const employee = applyRate(salary, employeeRateForYear(choice, y));
    // K5: compulsory employer contribution for ages 16 to under 65.
    const employerGross = age >= 16 && age < 65 ? applyRate(salary, employerRate) : BigInt(0);
    const er = esctRate(salary + applyRate(salary, priorEmployerRate(y)));
    const employerNet = applyRate(employerGross, { n: er.d - er.n, d: er.d });
    const own = employee + voluntary;
    // K8: ages 16 to 65; none over $180,000.
    const government = age >= 16 && age < 65 ? governmentContribution(own, salary) : BigInt(0);
    const growth = applyRate(bal, input.netReturn);
    bal = bal + growth + own + employerNet + government;
    out.push({ year: y, age, salary, employee: own, employerNet, government, growth, closing: bal });
  }
  return { years: out, balance: bal };
}

/** S2 return assumptions: 6.25% gross, PIR 28%, fees 0.50% → exactly 4.00%. Range 2.5% / 5.5% net. */
export const RANGE_RETURNS = {
  low: rate(25, 1000),
  mid: netReturn(rate(625, 10000), rate(28, 100), rate(5, 1000)),
  high: rate(55, 1000),
} as const;

export interface RangeResult {
  years: number;
  low: Cents;
  mid: Cents;
  high: Cents;
  midToday: Cents;
}

/** "Ranges": the same plan at 2.5%, 4.0% and 5.5% net a year; mid also in today's dollars at 2% CPI. */
export function planRange(input: Omit<PlanInput, "netReturn">, cpi: Rate = rate(2, 100)): RangeResult {
  const at = (r: Rate) => projectPlan({ ...input, netReturn: r });
  const mid = at(RANGE_RETURNS.mid);
  return { years: mid.years.length, low: at(RANGE_RETURNS.low).balance, mid: mid.balance, high: at(RANGE_RETURNS.high).balance, midToday: inTodaysDollars(mid.balance, cpi, mid.years.length) };
}

export interface WhatIf {
  id: string;
  label: string;
  change: Partial<Omit<PlanInput, "netReturn">>;
}

/** Standard what-ifs shown beside the base plan. */
export const STANDARD_WHAT_IFS: readonly WhatIf[] = [
  { id: "rate6", label: "Contribute 6% instead", change: { employeeRatePerMille: 60 } },
  { id: "extra1000", label: "Add NZ$1,000 a year", change: { voluntaryYearly: cents("1000") } },
  { id: "retire67", label: "Keep going to 67", change: { retireAge: 67 } },
  { id: "growth2", label: "Pay rises 2% a year", change: { salaryGrowth: rate(2, 100) } },
];

export function runWhatIfs(base: Omit<PlanInput, "netReturn">, whatIfs: readonly WhatIf[] = STANDARD_WHAT_IFS) {
  const baseMid = projectPlan({ ...base, netReturn: RANGE_RETURNS.mid }).balance;
  return whatIfs.map((w) => {
    const r = planRange({ ...base, ...w.change });
    return { id: w.id, label: w.label, ...r, vsBase: r.mid - baseMid };
  });
}

/* ---------------- NZ tax (IRD rates from 1 Apr 2025) ---------------- */

const BRACKETS: Array<[Cents | null, Rate]> = [
  [cents("15600"), rate(105, 1000)],
  [cents("53500"), rate(175, 1000)],
  [cents("78100"), rate(30, 100)],
  [cents("180000"), rate(33, 100)],
  [null, rate(39, 100)],
];

/** Annual income tax on taxable income, by band, half-up to the cent (IRD "Tax rates for individuals"). */
export function nzIncomeTax(income: Cents): Cents {
  let tax = BigInt(0);
  let lower = BigInt(0);
  for (const [upper, r] of BRACKETS) {
    if (income <= lower) break;
    const top = upper == null || income < upper ? income : upper;
    tax += applyRate(top - lower, r);
    if (upper == null) break;
    lower = upper;
  }
  return tax;
}

/** Secondary tax code for a second income, by total annual income (SB/S/SH/ST/SA). */
export function secondaryTaxCode(totalIncome: Cents): { code: "SB" | "S" | "SH" | "ST" | "SA"; rate: Rate } {
  if (totalIncome <= cents("15600")) return { code: "SB", rate: rate(105, 1000) };
  if (totalIncome <= cents("53500")) return { code: "S", rate: rate(175, 1000) };
  if (totalIncome <= cents("78100")) return { code: "SH", rate: rate(30, 100) };
  if (totalIncome <= cents("180000")) return { code: "ST", rate: rate(33, 100) };
  return { code: "SA", rate: rate(39, 100) };
}

/** K9: prescribed investor rate from one income year's figures (the lower of the last two years applies). */
export function prescribedInvestorRate(taxable: Cents, taxablePlusPie: Cents): Rate {
  if (taxable <= cents("15600") && taxablePlusPie <= cents("53500")) return rate(105, 1000);
  if (taxable <= cents("53500") && taxablePlusPie <= cents("78100")) return rate(175, 1000);
  return rate(28, 100);
}

/** The lower PIR across the last two income years. */
export function pirFromTwoYears(years: ReadonlyArray<{ taxable: Cents; taxablePlusPie: Cents }>): Rate {
  let best = rate(28, 100);
  for (const y of years.slice(0, 2)) {
    const r = prescribedInvestorRate(y.taxable, y.taxablePlusPie);
    if (r.n * best.d < best.n * r.d) best = r;
  }
  return best;
}

/* ---------------- NZ Super (rates from 1 Apr 2026, tax code M) ---------------- */

export type Household = "single-alone" | "single-sharing" | "couple-both";

const NZS_NET_M_FORTNIGHT: Record<Household, Cents> = {
  "single-alone": NZ_SUPER_2026.singleAloneNetMFortnight,
  "single-sharing": cents("1024.90"),
  "couple-both": NZ_SUPER_2026.coupleEachNetMFortnight * BigInt(2),
};

/** Published net NZ Super at tax code M, a year (26 fortnights), for the household. */
export function nzSuperNetYearFor(h: Household): Cents {
  return NZS_NET_M_FORTNIGHT[h] * BigInt(NZ_SUPER_2026.paymentsPerYear);
}

/** S3b: first-year income = NZ Super net + a tax-free KiwiSaver draw (K10) of drawRate × balance. */
export function retirementIncomeYear1(h: Household, kiwisaverBalance: Cents, drawRate: Rate = rate(4, 100)) {
  const draw = applyRate(kiwisaverBalance, drawRate);
  const nzSuper = nzSuperNetYearFor(h);
  return { nzSuper, draw, total: nzSuper + draw };
}
