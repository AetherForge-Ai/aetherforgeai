/**
 * Public NZ investor illustrations. Client-side arithmetic only.
 * Every figure below is copied from an Inland Revenue page. Checked 23 November 2026.
 *
 * FIF de minimis, "less than NZ$50,000", and the ASX-listed Australian company exemption
 * (official ASX list, Australian resident and not treaty-resident elsewhere, franking account,
 * stock not stapled; Australian franking credits cannot be claimed as NZ tax credits):
 * https://www.ird.govt.nz/income-tax/income-tax-for-businesses-and-organisations/types-of-business-income/foreign-investment-funds-fifs/foreign-investment-fund-rules-exemptions
 *
 * Share investments: FIF guidance when foreign shares cost more than NZ$50,000 in total;
 * general rules when they cost less than NZ$50,000, and for certain Australian listed companies:
 * https://www.ird.govt.nz/income-tax/income-tax-for-individuals/types-of-individual-income/share-investments
 *
 * IR461 (April 2026): the exemption applies when the total cost does not exceed $50,000 at any
 * time in the year. If the cost exceeds $50,000 on any day, all attributing interests are subject
 * to the FIF rules and the first $50,000 is not exempt. Joint holdings are split between the owners.
 * Cost is generally the amount paid.
 * https://www.ird.govt.nz/-/media/project/ir/home/documents/forms-and-guides/ir400---ir499/ir461/ir461.pdf
 *
 * Most companies: 28% income tax:
 * https://www.ird.govt.nz/income-tax/income-tax-for-businesses-and-organisations/tax-rates-for-businesses
 *
 * Maximum imputation ratio 28:72 (28 cents of credit per $1 of gross dividend, or 38.89 cents
 * of credit per $1 of net profit):
 * https://www.ird.govt.nz/income-tax/income-tax-for-businesses-and-organisations/income-tax-for-companies/imputation-for-companies/how-imputation-credits-work/maximum-imputation-ratio
 *
 * IR274 (April 2024): company profit $1,000, tax at 28% $280, after-tax profit $720, imputation
 * credit $280, taxable amount $1,000, tax at 33% $330, less the credit $280, tax payable $50.
 * Shareholders include the dividend and the credit in taxable income and claim the credit
 * against income tax.
 * https://www.ird.govt.nz/-/media/project/ir/home/documents/forms-and-guides/ir200---ir299/ir274/ir274-2024.pdf
 *
 * Individual income tax rates from 1 April 2025: 10.5%, 17.5%, 30%, 33%, 39% on the published bands:
 * https://www.ird.govt.nz/income-tax/income-tax-for-individuals/tax-codes-and-tax-rates-for-individuals/tax-rates-for-individuals
 *
 * IR3G (2026): excess imputation credits are not refundable. They are brought forward and claimed
 * against tax payable.
 * https://www.ird.govt.nz/-/media/project/ir/home/documents/forms-and-guides/ir1---ir99/ir3g/ir3g-2026.pdf
 */

export const TOOLS_DISCLAIMER =
  "General information, not tax or financial advice. Check with IRD or your accountant.";

export const IRD_FIGURES_CHECKED_ON = "23 November 2026";

export type IrdSource = { title: string; url: string };

export const FIF_IRD_SOURCES: readonly IrdSource[] = [
  {
    title: "Inland Revenue: Foreign investment fund rules exemptions",
    url: "https://www.ird.govt.nz/income-tax/income-tax-for-businesses-and-organisations/types-of-business-income/foreign-investment-funds-fifs/foreign-investment-fund-rules-exemptions",
  },
  {
    title: "Inland Revenue: Share investments",
    url: "https://www.ird.govt.nz/income-tax/income-tax-for-individuals/types-of-individual-income/share-investments",
  },
  {
    title: "Inland Revenue: Guide to foreign investment funds (IR461)",
    url: "https://www.ird.govt.nz/-/media/project/ir/home/documents/forms-and-guides/ir400---ir499/ir461/ir461.pdf",
  },
];

export const DIVIDEND_IRD_SOURCES: readonly IrdSource[] = [
  {
    title: "Inland Revenue: Tax rates for businesses",
    url: "https://www.ird.govt.nz/income-tax/income-tax-for-businesses-and-organisations/tax-rates-for-businesses",
  },
  {
    title: "Inland Revenue: Maximum imputation ratio",
    url: "https://www.ird.govt.nz/income-tax/income-tax-for-businesses-and-organisations/income-tax-for-companies/imputation-for-companies/how-imputation-credits-work/maximum-imputation-ratio",
  },
  {
    title: "Inland Revenue: Imputation (IR274, April 2024)",
    url: "https://www.ird.govt.nz/-/media/project/ir/home/documents/forms-and-guides/ir200---ir299/ir274/ir274-2024.pdf",
  },
  {
    title: "Inland Revenue: Tax rates for individuals",
    url: "https://www.ird.govt.nz/income-tax/income-tax-for-individuals/tax-codes-and-tax-rates-for-individuals/tax-rates-for-individuals",
  },
  {
    title: "Inland Revenue: Individual income tax return guide (IR3G, 2026)",
    url: "https://www.ird.govt.nz/-/media/project/ir/home/documents/forms-and-guides/ir1---ir99/ir3g/ir3g-2026.pdf",
  },
];

/** NZ$50,000, in cents. The individual de minimis published by Inland Revenue. */
export const FIF_DE_MINIMIS_CENTS = 5_000_000;

/**
 * Conditions on the exemptions page for the ASX-listed Australian company exemption.
 * All of them are required. Australian franking credits are not New Zealand tax credits.
 */
export const ASX_EXEMPTION_CONDITIONS = [
  "The company is included on the official ASX list.",
  "It is an Australian resident, and it is not treated as resident in another country under an agreement between Australia and that other country.",
  "It maintains a franking account.",
  "The stock is not stapled.",
] as const;

export type FifCostPosition = "under" | "at" | "over";

export type NzdParse = { ok: true; cents: number } | { ok: false; reason: "empty" | "invalid" };

/**
 * Individual marginal rates from 1 April 2025. The 28% company rate is not one of these bands.
 * numerator/denominator is the rate as a fraction (10.5% is 105/1000).
 */
export const INDIVIDUAL_MARGINAL_RATES = [
  { id: "10.5", label: "10.5%", band: "$0 to $15,600", numerator: 105, denominator: 1000 },
  { id: "17.5", label: "17.5%", band: "$15,601 to $53,500", numerator: 175, denominator: 1000 },
  { id: "30", label: "30%", band: "$53,501 to $78,100", numerator: 30, denominator: 100 },
  { id: "33", label: "33%", band: "$78,101 to $180,000", numerator: 33, denominator: 100 },
  { id: "39", label: "39%", band: "$180,001 and over", numerator: 39, denominator: 100 },
] as const;

export type MarginalRateId = (typeof INDIVIDUAL_MARGINAL_RATES)[number]["id"];

/** Company tax rate used for the maximum imputation ratio 28:72. */
export const COMPANY_TAX_PERCENT = 28;
export const IMPUTATION_CREDIT_PARTS = 28;
export const IMPUTATION_CASH_PARTS = 72;

export type ImputationOutcome = "top-up" | "matched" | "unused-credit";

export interface FullyImputedDividend {
  cashCents: number;
  imputationCents: number;
  grossCents: number;
  rateId: MarginalRateId;
  rateLabel: string;
  taxCents: number;
  /** Tax on the gross dividend minus the imputation credit. Positive means a top-up. */
  differenceCents: number;
  outcome: ImputationOutcome;
}

/** New Zealand dollars from integer cents, for example 5000000 → "NZ$50,000.00". */
export function formatCentsNzd(cents: number): string {
  if (!Number.isInteger(cents)) return "NZ$—";
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const dollars = Math.trunc(abs / 100);
  const rem = abs % 100;
  const grouped = String(dollars).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}NZ$${grouped}.${String(rem).padStart(2, "0")}`;
}

/** Parse a typed NZ$ amount. Empty is not an error. More than two decimal places is invalid. */
export function parseNzdInput(raw: string): NzdParse {
  const text = raw.trim().replace(/NZ\$/gi, "").replace(/[$,\s]/g, "");
  if (text === "") return { ok: false, reason: "empty" };
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return { ok: false, reason: "invalid" };
  const [whole, frac = ""] = text.split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) return { ok: false, reason: "invalid" };
  return { ok: true, cents };
}

/**
 * Half-up division for a non-negative amount.
 * Inland Revenue states the 28:72 ratio and the 38.89 cent description. It does not publish
 * a rounding rule for this illustration, so results are rounded to the nearest cent.
 */
function mulDivRoundHalfUp(amount: bigint, numerator: bigint, denominator: bigint): bigint {
  const product = amount * numerator;
  return (product + denominator / BigInt(2)) / denominator;
}

function safeCents(value: bigint): number | null {
  if (value < BigInt(0) || value > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(value);
}

export function fifCostPosition(cents: number): FifCostPosition | null {
  if (!Number.isInteger(cents) || cents < 0) return null;
  if (cents < FIF_DE_MINIMIS_CENTS) return "under";
  if (cents === FIF_DE_MINIMIS_CENTS) return "at";
  return "over";
}

export function describeFifCost(cents: number): { position: FifCostPosition; heading: string; body: string } | null {
  const position = fifCostPosition(cents);
  if (!position) return null;
  const amount = formatCentsNzd(cents);
  if (position === "under") {
    return {
      position,
      heading: `${amount} is likely under the NZ$50,000 threshold`,
      body: "Inland Revenue says an individual with attributing interests in foreign investment funds that cost less than NZ$50,000 in total does not need to calculate income under the FIF rules. Dividends are still taxable. A gain on sale can also be taxable if the shares are held on revenue account.",
    };
  }
  if (position === "at") {
    return {
      position,
      heading: `${amount} is the threshold, and it is not over it`,
      body: "Inland Revenue's guide IR461 says the de minimis applies when the total cost does not exceed NZ$50,000 at any time in the year. The exemptions web page describes the same exemption as a cost of less than NZ$50,000. Exactly NZ$50,000 does not exceed the IR461 threshold, so this page treats it as not over. Check IR461, or your accountant, before you rely on the exact dollar.",
    };
  }
  return {
    position,
    heading: `${amount} is likely over the NZ$50,000 threshold`,
    body: "This cost is more than NZ$50,000. If the total cost of your attributing interests exceeds NZ$50,000 on any day in the income year, IR461 says all of those interests are subject to the FIF rules. The first NZ$50,000 is not exempt.",
  };
}

export function marginalRate(id: string) {
  return INDIVIDUAL_MARGINAL_RATES.find((rate) => rate.id === id) ?? null;
}

/** Maximum imputation credit on a cash dividend: cash × 28/72, to the nearest cent. */
export function maximumImputationCreditCents(cashCents: number): number | null {
  if (!Number.isInteger(cashCents) || cashCents < 0) return null;
  return safeCents(mulDivRoundHalfUp(BigInt(cashCents), BigInt(IMPUTATION_CREDIT_PARTS), BigInt(IMPUTATION_CASH_PARTS)));
}

export function illustrateFullyImputedDividend(cashCents: number, rateId: string): FullyImputedDividend | null {
  const rate = marginalRate(rateId);
  const imputationCents = maximumImputationCreditCents(cashCents);
  if (!rate || imputationCents === null) return null;
  const gross = BigInt(cashCents) + BigInt(imputationCents);
  const grossCents = safeCents(gross);
  if (grossCents === null) return null;
  const taxCents = safeCents(mulDivRoundHalfUp(gross, BigInt(rate.numerator), BigInt(rate.denominator)));
  if (taxCents === null) return null;
  const differenceCents = taxCents - imputationCents;
  const outcome: ImputationOutcome = differenceCents > 0 ? "top-up" : differenceCents < 0 ? "unused-credit" : "matched";
  return {
    cashCents,
    imputationCents,
    grossCents,
    rateId: rate.id,
    rateLabel: rate.label,
    taxCents,
    differenceCents,
    outcome,
  };
}

export function describeImputation(result: FullyImputedDividend): { heading: string; body: string } {
  const tax = formatCentsNzd(result.taxCents);
  const credit = formatCentsNzd(result.imputationCents);
  if (result.cashCents === 0) {
    return {
      heading: "No dividend to illustrate",
      body: "A cash dividend of NZ$0.00 has no imputation credit and no gross dividend.",
    };
  }
  if (result.outcome === "top-up") {
    const topUp = formatCentsNzd(result.differenceCents);
    return {
      heading: `Top-up of ${topUp}`,
      body: `Tax on the gross dividend at ${result.rateLabel} is ${tax}. The imputation credit is ${credit}. The difference, ${topUp}, is extra tax on this dividend at the rate you chose.`,
    };
  }
  if (result.outcome === "unused-credit") {
    const unused = formatCentsNzd(Math.abs(result.differenceCents));
    return {
      heading: `Unused credit of ${unused} on this dividend`,
      body: `Tax on the gross dividend at ${result.rateLabel} is ${tax}. The imputation credit is ${credit}, which is ${unused} more than that tax. That difference can reduce tax on your other income. Inland Revenue's IR3G guide says excess imputation credits are not refundable. Credits that are still unused after your total tax payable are carried forward.`,
    };
  }
  return {
    heading: "No top-up on this dividend",
    body: `Tax on the gross dividend at ${result.rateLabel} is ${tax}, which equals the imputation credit of ${credit}.`,
  };
}
