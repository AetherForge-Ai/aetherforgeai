/**
 * NZ-TAX-PREVIEW-1: "What if I sell?" on one holding.
 * Read-only. The figures come from the existing FIF paper and IR3 helper:
 * buildFifPaper, fifTotals, fifThresholdSentence, taxableIncome, buildIr3Helper.
 * A figure those functions do not return is "not estimated". Nothing is written.
 */
import { formatNzd } from "@/lib/currency";
import {
  buildFifPaper,
  fifClass,
  fifThresholdSentence,
  fifThresholdText,
  fifTotals,
  FIF_COST_THRESHOLD_NZD,
  type FifMarketInput,
  type FifPaper,
  type FifThreshold,
} from "@/lib/fif-working-paper";
import { buildIr3Helper, type Ir3Helper } from "@/lib/ir3/ir3-helper";
import { aucklandCivilToday, isNzTaxYearEnding, nzTaxYearEnding, nzTaxYearLabel } from "@/lib/nz-tax-year";
import { fifoRemainingShareQty } from "@/lib/tax-realised";
import { taxableIncome, type TaxLedgerRow } from "@/lib/taxable-income";

export const NZ_TAX_PREVIEW_DISCLAIMER =
  "Estimate only, not tax advice. These figures have not been reviewed by an accountant.";

export const NOT_ESTIMATED = "not estimated";

export interface NzSaleInput {
  ticker: string;
  quantity: number;
  /** Sale price per unit in the holding's own currency. */
  price: number;
  /** Civil date. Defaults to today. */
  date?: string | null;
}

export interface NzTaxPreviewOk {
  ok: true;
  ticker: string;
  quantity: number;
  price: number;
  currency: string;
  date: string;
  taxYear: string;
  endingYear: number;
  thresholdNzd: number;
  /** Cost of attributing interests still open at 31 March, from fifTotals. */
  yearEndCostBeforeNzd: number | null;
  yearEndCostAfterNzd: number | null;
  /**
   * True when this year's closing cost was over the threshold and the sale leaves it at or under.
   * Exactly the threshold counts as under (exempt). That remaining cost is next year's test.
   */
  dropsUnderDeMinimis: boolean | null;
  peakCostBeforeNzd: number | null;
  peakCostAfterNzd: number | null;
  peakThresholdBefore: FifThreshold;
  peakThresholdAfter: FifThreshold;
  /** Opening market value the working paper stores for this holding. Unchanged by a sale in the year. */
  openingBeforeNzd: number | null;
  openingAfterNzd: number | null;
  /** Portfolio FDR and CV from fifTotals. Null when the paper cannot total them. */
  fdrBeforeNzd: number | null;
  fdrAfterNzd: number | null;
  cvBeforeNzd: number | null;
  cvAfterNzd: number | null;
  ir3IncomeBeforeNzd: number | null;
  ir3IncomeAfterNzd: number | null;
  ir3TaxBeforeNzd: number | null;
  ir3TaxAfterNzd: number | null;
  lines: string[];
}

export type NzTaxPreview = NzTaxPreviewOk | { ok: false; error: string };

export function previewSaleDate(today: string, endingYear?: number | null): string {
  if (endingYear == null || nzTaxYearEnding(today) === endingYear) return today;
  if (!Number.isInteger(endingYear)) return today;
  return `${endingYear}-03-31`;
}

function isRealCivilDay(day: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, date));
  return utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === date;
}

/** One tax year, taken from the sale date. A ?year that names a different year is refused. */
export function resolvePreviewDate(input: {
  date?: string | null;
  year?: string | number | null;
  today?: string;
}): { ok: true; date: string; endingYear: number } | { ok: false; error: string } {
  const today = input.today ?? aucklandCivilToday();
  const dateRaw = String(input.date || "").trim();
  const yearRaw = input.year == null || input.year === "" ? null : Number(input.year);
  let requestedYear: number | null = null;
  if (yearRaw != null) {
    if (!isNzTaxYearEnding(yearRaw)) return { ok: false, error: "Enter a valid tax year." };
    requestedYear = yearRaw;
  }
  const date = isRealCivilDay(dateRaw) ? dateRaw : previewSaleDate(today, requestedYear);
  if (!isRealCivilDay(date)) return { ok: false, error: "Enter a valid sale date." };
  const endingYear = nzTaxYearEnding(date);
  if (endingYear == null || !isNzTaxYearEnding(endingYear)) return { ok: false, error: "Enter a valid sale date." };
  if (requestedYear != null && requestedYear !== endingYear) {
    return { ok: false, error: `The sale date ${date} is in the tax year ending ${endingYear}, not ${requestedYear}.` };
  }
  return { ok: true, date, endingYear };
}

function firstLedgerEndingYear(rows: readonly TaxLedgerRow[]): number | null {
  let earliest: number | null = null;
  for (const row of rows) {
    const ending = nzTaxYearEnding(row.executed_at || row.trade_date || row.createdAt);
    if (ending == null) continue;
    if (earliest == null || ending < earliest) earliest = ending;
  }
  return earliest;
}

/** Blank request uses the stored current price. A non-positive entry is refused. */
export function defaultSalePrice(currentPrice: number | null | undefined, requested: string | null | undefined): number | null {
  if (requested != null && requested.trim() !== "") {
    const n = Number(requested);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  const current = Number(currentPrice);
  return Number.isFinite(current) && current > 0 ? current : null;
}

/** Blank request uses the open quantity. */
export function defaultSaleQuantity(openQuantity: number | null | undefined, requested: string | null | undefined): number | null {
  if (requested != null && requested.trim() !== "") {
    const n = Number(requested);
    return Number.isFinite(n) ? n : null;
  }
  const open = Number(openQuantity);
  return Number.isFinite(open) && open > 0 ? open : null;
}

function holdingMeta(rows: readonly TaxLedgerRow[], ticker: string): { assetType: string; currency: string; fx: number | null } {
  let last: TaxLedgerRow | null = null;
  for (const row of rows) {
    if ((row.type === "buy" || row.type === "opening_balance") && String(row.ticker || "").trim().toUpperCase() === ticker) last = row;
  }
  const fx = Number(last?.fx_rate);
  return {
    assetType: String(last?.asset_type || "stock"),
    currency: String(last?.currency || "NZD").toUpperCase(),
    fx: fx > 0 ? fx : null,
  };
}

function yearEndAttributingCost(paper: FifPaper): number | null {
  if (paper.threshold === "unknown" || paper.peakCostNzd == null) return null;
  if (paper.attributing.length === 0) return 0;
  return fifTotals(paper.attributing).costNzd;
}

function openingOf(paper: FifPaper, ticker: string): number | null {
  const position = paper.attributing.find((row) => row.ticker === ticker);
  return position?.openingNzd ?? null;
}

function ir3Value(helper: Ir3Helper, key: Ir3Helper["totals"][number]["key"]): number | null {
  const row = helper.totals.find((total) => total.key === key);
  return row ? row.valueNzd : null;
}

function compared(label: string, before: number | null, after: number | null): string {
  if (before == null || after == null) return `${label} is ${NOT_ESTIMATED}.`;
  if (before === after) return `${label} stays ${formatNzd(after)}.`;
  return `${label} would be ${formatNzd(after)}, compared with ${formatNzd(before)}.`;
}

function yearEndSentence(before: number | null, after: number | null, threshold: number, drops: boolean | null): string {
  const nextYear = "That figure is the cost still open at 31 March, so it only affects next year's de minimis.";
  if (before == null || after == null || drops == null) {
    return `Whether total offshore cost would drop under the de minimis for next year is ${NOT_ESTIMATED}.`;
  }
  const limit = fifThresholdText(threshold);
  if (drops) {
    const exempt = after === threshold ? " A cost exactly at the threshold counts as exempt." : "";
    return `Total attributing cost still open at 31 March would drop under ${limit}: from ${formatNzd(before)} to ${formatNzd(after)}.${exempt} ${nextYear}`;
  }
  if (after <= threshold) {
    const exempt = after === threshold ? " A cost exactly at the threshold counts as exempt." : "";
    return `Total attributing cost still open at 31 March would be ${formatNzd(after)}, under ${limit}.${exempt} Before the sale it was ${formatNzd(before)}. ${nextYear}`;
  }
  return `Total attributing cost still open at 31 March would be ${formatNzd(after)}, which is not under ${limit}. Before the sale it was ${formatNzd(before)}. ${nextYear}`;
}

export function previewNzTaxSale(input: {
  rows: readonly TaxLedgerRow[];
  markets: readonly FifMarketInput[];
  sale: NzSaleInput;
  /** Portfolio threshold. The working paper's own default applies when this is omitted. */
  thresholdNzd?: number;
  today?: string;
}): NzTaxPreview {
  const ticker = String(input.sale.ticker || "").trim().toUpperCase();
  const quantity = Number(input.sale.quantity);
  const price = Number(input.sale.price);
  if (!ticker) return { ok: false, error: "Choose a holding." };
  if (!(quantity > 0)) return { ok: false, error: "Enter a quantity above 0." };
  if (!(price > 0)) return { ok: false, error: "Enter a sale price above 0." };
  const open = fifoRemainingShareQty(input.rows).get(ticker) ?? 0;
  if (quantity - open > 1e-9) return { ok: false, error: `You hold ${open} ${ticker}. A preview cannot sell more than that.` };

  const meta = holdingMeta(input.rows, ticker);
  const today = input.today ?? aucklandCivilToday();
  const requested = String(input.sale.date || "").trim();
  const date = isRealCivilDay(requested) ? requested : today;
  if (!isRealCivilDay(date)) return { ok: false, error: "Enter a valid sale date." };
  if (date > today) return { ok: false, error: "The sale date cannot be in the future." };
  const endingYear = nzTaxYearEnding(date);
  if (endingYear == null || !isNzTaxYearEnding(endingYear)) return { ok: false, error: "Enter a valid sale date." };
  const firstYear = firstLedgerEndingYear(input.rows);
  if (firstYear != null && endingYear < firstYear) {
    return { ok: false, error: "The sale date is before the first year on this ledger." };
  }

  const fx = meta.currency === "NZD" ? 1 : meta.fx;
  const sell = {
    type: "sell",
    ticker,
    asset_type: meta.assetType,
    executed_at: date,
    quantity,
    price,
    currency: meta.currency,
    ...(fx != null ? { fx_rate: fx } : {}),
  } as TaxLedgerRow;
  const afterRows = [...input.rows, sell];
  const paperInput = { markets: input.markets, endingYear, thresholdNzd: input.thresholdNzd };
  const before = buildFifPaper({ rows: input.rows, ...paperInput });
  const after = buildFifPaper({ rows: afterRows, ...paperInput });
  const incomeBefore = taxableIncome(input.rows, endingYear);
  const incomeAfter = taxableIncome(afterRows, endingYear);
  const ir3Before = buildIr3Helper({ income: incomeBefore, fif: before });
  const ir3After = buildIr3Helper({ income: incomeAfter, fif: after });

  const threshold = before.thresholdNzd ?? after.thresholdNzd ?? FIF_COST_THRESHOLD_NZD;
  const yearEndBefore = yearEndAttributingCost(before);
  const yearEndAfter = yearEndAttributingCost(after);
  const dropsUnderDeMinimis =
    yearEndBefore == null || yearEndAfter == null ? null : yearEndBefore > threshold && yearEndAfter <= threshold;
  const openingBefore = fifClass(ticker, meta.assetType) === "attributable" ? openingOf(before, ticker) : null;
  const openingAfter = fifClass(ticker, meta.assetType) === "attributable" ? openingOf(after, ticker) : null;
  const fdrBefore = fifTotals(before.attributing).fdrNzd;
  const fdrAfter = fifTotals(after.attributing).fdrNzd;
  const cvBefore = fifTotals(before.attributing).cvNzd;
  const cvAfter = fifTotals(after.attributing).cvNzd;
  const ir3IncomeBefore = ir3Value(ir3Before, "overseas-income");
  const ir3IncomeAfter = ir3Value(ir3After, "overseas-income");
  const ir3TaxBefore = ir3Value(ir3Before, "overseas-tax");
  const ir3TaxAfter = ir3Value(ir3After, "overseas-tax");
  const incomeItem = ir3After.totals.find((row) => row.key === "overseas-income")?.item ?? "Total overseas income";
  const taxItem = ir3After.totals.find((row) => row.key === "overseas-tax")?.item ?? "Total overseas tax paid";

  const lines = [
    `Selling ${quantity} ${ticker} at ${price} ${meta.currency} on ${date} (${nzTaxYearLabel(endingYear)}). Nothing is recorded.`,
    yearEndSentence(yearEndBefore, yearEndAfter, threshold, dropsUnderDeMinimis),
  ];
  if (yearEndBefore != null && yearEndAfter != null && before.peakCostNzd != null && before.peakCostNzd === after.peakCostNzd && dropsUnderDeMinimis) {
    lines.push("This sale does not change the highest cost at any time in the income year. The de minimis test still uses that highest cost.");
  } else if (before.peakCostNzd != null && after.peakCostNzd != null && before.peakCostNzd !== after.peakCostNzd) {
    lines.push(`Before this sale the highest cost was ${formatNzd(before.peakCostNzd)}.`);
  }
  lines.push(fifThresholdSentence(after));
  if (fifClass(ticker, meta.assetType) !== "attributable") {
    lines.push(`The effect on the FDR opening value for this holding is ${NOT_ESTIMATED}.`);
  } else {
    lines.push(compared("The FDR opening value", openingBefore, openingAfter));
  }
  lines.push(compared("Fair dividend rate income", fdrBefore, fdrAfter));
  if (cvBefore == null || cvAfter == null) lines.push(`Comparative value is ${NOT_ESTIMATED}.`);
  else if (cvBefore === cvAfter) {
    lines.push(`Comparative value stays ${formatNzd(cvAfter)}. Closing market value stays the figure entered on the working paper.`);
  } else {
    lines.push(
      `Comparative value would be ${formatNzd(cvAfter)}, compared with ${formatNzd(cvBefore)}. Closing market value stays the figure entered on the working paper.`,
    );
  }
  lines.push(compared(incomeItem, ir3IncomeBefore, ir3IncomeAfter));
  lines.push(compared(taxItem, ir3TaxBefore, ir3TaxAfter));

  return {
    ok: true,
    ticker,
    quantity,
    price,
    currency: meta.currency,
    date,
    taxYear: nzTaxYearLabel(endingYear),
    endingYear,
    thresholdNzd: threshold,
    yearEndCostBeforeNzd: yearEndBefore,
    yearEndCostAfterNzd: yearEndAfter,
    dropsUnderDeMinimis,
    peakCostBeforeNzd: before.peakCostNzd,
    peakCostAfterNzd: after.peakCostNzd,
    peakThresholdBefore: before.threshold,
    peakThresholdAfter: after.threshold,
    openingBeforeNzd: openingBefore,
    openingAfterNzd: openingAfter,
    fdrBeforeNzd: fdrBefore,
    fdrAfterNzd: fdrAfter,
    cvBeforeNzd: cvBefore,
    cvAfterNzd: cvAfter,
    ir3IncomeBeforeNzd: ir3IncomeBefore,
    ir3IncomeAfterNzd: ir3IncomeAfter,
    ir3TaxBeforeNzd: ir3TaxBefore,
    ir3TaxAfterNzd: ir3TaxAfter,
    lines,
  };
}
