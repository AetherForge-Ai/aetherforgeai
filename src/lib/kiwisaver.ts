/**
 * G-22 (GOAL-LOCK #57): KiwiSaver and NZ Super logic for the goal planner.
 * Exact arithmetic: money is integer cents (bigint), rates are exact fractions, and every rounding is
 * half-up to the cent. ESCT applies per pay to the whole-dollar part of the employer contribution only.
 * Sources and dates: G22_SOURCES below (Research, 19 Oct 2026). Illustrative, not financial advice.
 */

export const G22_LABEL = "Illustrative, not financial advice.";

export interface G22Source {
  id: string;
  what: string;
  url: string;
  dated: string;
}

/** Each figure's official page and the date it shows (or "no page date"); accessed 19 Oct 2026. */
export const G22_SOURCES: readonly G22Source[] = [
  { id: "K1-K3", what: "Default rate 3.5% from 1 Apr 2026; 4% from 1 Apr 2028", url: "https://www.ird.govt.nz/kiwisaver-changes", dated: "no page date; accessed 19 Oct 2026" },
  { id: "K5", what: "Compulsory employer contribution at least 3.5%", url: "https://www.ird.govt.nz/kiwisaver/kiwisaver-employers/contributions-and-deductions/employer-contributions-to-kiwisaver-and-complying-funds", dated: "no page date; accessed 19 Oct 2026" },
  { id: "K6-K7", what: "ESCT brackets; ESCT on the whole-dollar part per pay", url: "https://www.ird.govt.nz/-/media/project/ir/home/documents/digital-service-providers/software-providers/payroll-calculations-business-rules-specifications/payroll-calculations-and-business-rules-specification.pdf", dated: "Payroll spec 2027, 24 Mar 2026" },
  { id: "K8", what: "Government contribution 25c per $1, max $260.72; none when annual income is over $180,000 (from 1 Jul 2025)", url: "https://www.ird.govt.nz/kiwisaver/kiwisaver-individuals/growing-my-kiwisaver-account/getting-the-kiwisaver-government-contribution", dated: "no page date; accessed 19 Oct 2026" },
  { id: "NZS", what: "NZ Super rates at 1 April 2026 (couple, each: $984.28 gross, $854.08 net at M, fortnightly)", url: "https://www.workandincome.govt.nz/products/benefit-rates/benefit-rates-april-2026.html", dated: "updated 13 Jul 2026" },
];

export type Cents = bigint;
/** An exact rate n/d. */
export interface Rate {
  n: bigint;
  d: bigint;
}

export const rate = (n: number | bigint, d: number | bigint): Rate => ({ n: BigInt(n), d: BigInt(d) });

/** Half-up division of non-negative integers. */
function divHalfUp(num: bigint, den: bigint): bigint {
  if (den <= BigInt(0)) throw new Error("denominator must be positive");
  if (num < BigInt(0)) return -divHalfUp(-num, den);
  return (num * BigInt(2) + den) / (den * BigInt(2));
}

/** cents × rate, rounded half-up to the cent. */
export function applyRate(c: Cents, r: Rate): Cents {
  return divHalfUp(c * r.n, r.d);
}

/** "85000" | "7083.33" | 85000 → cents. Strings keep the input exact. */
export function cents(v: string | number): Cents {
  const s = typeof v === "number" ? v.toFixed(2) : v.trim();
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) throw new Error(`not a money amount: ${v}`);
  return BigInt(m[1]) * BigInt(100) + BigInt((m[2] || "").padEnd(2, "0") || "0");
}

export function formatNzd(c: Cents): string {
  const neg = c < BigInt(0);
  const a = neg ? -c : c;
  const whole = (a / BigInt(100)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}$${whole}.${(a % BigInt(100)).toString().padStart(2, "0")}`;
}

/** K6: ESCT rate from the threshold (last year's salary plus gross employer contributions), whole dollars. */
export function esctRate(thresholdCents: Cents): Rate {
  const bands: Array<[bigint, Rate]> = [
    [BigInt(1_872_000), rate(105, 1000)],
    [BigInt(6_420_000), rate(175, 1000)],
    [BigInt(9_372_000), rate(30, 100)],
    [BigInt(21_600_000), rate(33, 100)],
  ];
  for (const [lim, r] of bands) if (thresholdCents <= lim) return r;
  return rate(39, 100);
}

export const GOVT_CONTRIBUTION_MAX: Cents = BigInt(26_072);
const QUARTER = rate(1, 4);

/** From 1 July 2025 there is no government contribution when annual income is over $180,000 (IRD). */
export const GOVT_CONTRIBUTION_INCOME_LIMIT: Cents = BigInt(18_000_000);

/**
 * K8: 25c per $1 of the member's own contributions, capped at $260.72. None when annual income is over
 * $180,000 (from 1 July 2025; exactly $180,000 still qualifies). Income unknown = not tested.
 */
export function governmentContribution(ownContributions: Cents, annualIncome?: Cents): Cents {
  if (annualIncome !== undefined && annualIncome > GOVT_CONTRIBUTION_INCOME_LIMIT) return BigInt(0);
  const g = applyRate(ownContributions, QUARTER);
  return g < GOVT_CONTRIBUTION_MAX ? g : GOVT_CONTRIBUTION_MAX;
}

export interface PayYearInput {
  salary: Cents;
  paysPerYear: number;
  employeeRate: Rate;
  employerRate: Rate;
  /** Last tax year's salary plus gross employer contributions (K6). */
  esctThreshold: Cents;
}

export interface PayYearResult {
  perPay: Cents;
  employeePerPay: Cents;
  employerGrossPerPay: Cents;
  esctPerPay: Cents;
  employerNetPerPay: Cents;
  employee: Cents;
  employerGross: Cents;
  esct: Cents;
  employerNet: Cents;
  government: Cents;
  total: Cents;
}

/** S1 method: per-pay contributions; ESCT on the whole-dollar part of each pay's employer contribution (K7). */
export function contributionsForYear(input: PayYearInput): PayYearResult {
  const n = BigInt(input.paysPerYear);
  const perPay = divHalfUp(input.salary, n);
  const employeePerPay = applyRate(perPay, input.employeeRate);
  const employerGrossPerPay = applyRate(perPay, input.employerRate);
  const wholeDollars = (employerGrossPerPay / BigInt(100)) * BigInt(100);
  const esctPerPay = applyRate(wholeDollars, esctRate(input.esctThreshold));
  const employerNetPerPay = employerGrossPerPay - esctPerPay;
  const employee = employeePerPay * n;
  const employerNet = employerNetPerPay * n;
  const government = governmentContribution(employee, input.salary);
  return {
    perPay,
    employeePerPay,
    employerGrossPerPay,
    esctPerPay,
    employerNetPerPay,
    employee,
    employerGross: employerGrossPerPay * n,
    esct: esctPerPay * n,
    employerNet,
    government,
    total: employee + employerNet + government,
  };
}

export interface ProjectionInput {
  openingBalance: Cents;
  salary: Cents;
  years: number;
  /** Contribution rate for model year y (0-based), employee and employer. */
  rateForYear: (y: number) => Rate;
  /** Last year's employer rate, used for the ESCT threshold in model year y. */
  priorEmployerRateForYear: (y: number) => Rate;
  netReturn: Rate;
}

/**
 * S2 method (annual mode): B(t+1) = B(t) + round(B(t) × r) + E + round(E × (1 − ESCT)) + govt,
 * with E = round(salary × rate). Contributions arrive at year end; the return applies to the opening balance.
 */
export function projectBalance(input: ProjectionInput): Cents {
  let bal = input.openingBalance;
  for (let y = 0; y < input.years; y++) {
    const e = applyRate(input.salary, input.rateForYear(y));
    const prior = input.priorEmployerRateForYear(y);
    const threshold = input.salary + applyRate(input.salary, prior);
    const er = esctRate(threshold);
    const employerNet = applyRate(e, { n: er.d - er.n, d: er.d });
    const growth = applyRate(bal, input.netReturn);
    bal = bal + growth + e + employerNet + governmentContribution(e, input.salary);
  }
  return bal;
}

/** S2 net return: gross 6.25% less PIE tax at 28%, less fees 0.50% = exactly 4.00%. */
export function netReturn(gross: Rate, pir: Rate, fee: Rate): Rate {
  // gross × (1 − pir) − fee, as one exact fraction.
  const d = gross.d * pir.d * fee.d;
  const n = gross.n * (pir.d - pir.n) * fee.d - fee.n * gross.d * pir.d;
  return { n, d };
}

/** Nominal → today's dollars at CPI c over `years`, half-up to the cent. */
export function inTodaysDollars(nominal: Cents, cpi: Rate, years: number): Cents {
  const base = cpi.d + cpi.n;
  return divHalfUp(nominal * cpi.d ** BigInt(years), base ** BigInt(years));
}

/** S2 settings: 3.5% for 2026–27 and 2027–28, then 4% from 1 Apr 2028 (K1, K2). */
export const S2_RATE_FOR_YEAR = (y: number): Rate => (y < 2 ? rate(35, 1000) : rate(4, 100));
export const S2_PRIOR_RATE_FOR_YEAR = (y: number): Rate => (y === 0 ? rate(3, 100) : y < 3 ? rate(35, 1000) : rate(4, 100));

/** NZ Super at 1 April 2026: couple, both qualify, each, per fortnight (Work and Income). */
export const NZ_SUPER_2026 = {
  coupleEachGrossFortnight: cents("984.28"),
  coupleEachNetMFortnight: cents("854.08"),
  singleAloneGrossFortnight: cents("1294.74"),
  singleAloneNetMFortnight: cents("1110.30"),
  paymentsPerYear: 26,
  ratesFrom: "1 April 2026",
  sourceUpdated: "13 Jul 2026",
} as const;

/** S3: a couple who both qualify, NZ Super only (tax code M), per year, from the published net rate. */
export function coupleNzSuperNetYear(eachNetFortnight: Cents = NZ_SUPER_2026.coupleEachNetMFortnight): Cents {
  return eachNetFortnight * BigInt(2) * BigInt(NZ_SUPER_2026.paymentsPerYear);
}
