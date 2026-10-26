/**
 * G-18 (b79): NZ tax sale preview. "If I sold this holding, what would the realised figure be, and what
 * is the indicative tax effect?" The realised figure comes from the same FIFO engine as /tax/realised
 * (fifoStoredForSell), so a preview and the booked sale match to the cent. No GST applies to the sale
 * of shares or crypto, so none is added. Indicative, not tax advice. Behind TAX_SALE_PREVIEW (off in prod).
 */
import { roundMoney } from "@/lib/currency";
import { aucklandCivilToday, nzTaxYearEnding, nzTaxYearLabel } from "@/lib/nz-tax-year";
import { fifoRemainingShareQty, fifoStoredForSell } from "@/lib/tax-realised";
import type { TaxLedgerRow } from "@/lib/taxable-income";

/** NZ individual income tax bands, from 1 April 2025 (rates set from 31 July 2024). */
export const NZ_INDIVIDUAL_BANDS: ReadonlyArray<{ upTo: number; rate: number }> = [
  { upTo: 15_600, rate: 0.105 },
  { upTo: 53_500, rate: 0.175 },
  { upTo: 78_100, rate: 0.3 },
  { upTo: 180_000, rate: 0.33 },
  { upTo: Infinity, rate: 0.39 },
];

export const SALE_PREVIEW_NOTES = [
  "Indicative, not tax advice.",
  "New Zealand has no general capital gains tax. A gain is taxed only when it is taxable income, for example shares or crypto bought for the purpose of selling, or as a trader. Crypto is usually taxable on sale.",
  "The realised figure uses the same oldest-first (FIFO) lots, fees and exchange rates as the realised page.",
  "Tax is worked out on NZ individual rates (10.5%, 17.5%, 30%, 33%, 39%) as the extra tax on your other taxable income for the year. A loss is shown as the tax it would offset, which only applies if the loss is deductible.",
  "Shares in Australian-listed or other foreign companies may fall under the FIF rules instead. They are not modelled here.",
] as const;

/** Income tax on a whole-year taxable income at NZ individual rates, to the cent. */
export function nzIncomeTax(incomeNzd: number): number {
  let left = Math.max(0, incomeNzd);
  let floor = 0;
  let tax = 0;
  for (const band of NZ_INDIVIDUAL_BANDS) {
    if (left <= 0) break;
    const width = band.upTo - floor;
    const slice = Math.min(left, width);
    tax += slice * band.rate;
    left -= slice;
    floor = band.upTo;
  }
  return roundMoney(tax);
}

export interface SaleInput {
  ticker: string;
  quantity: number;
  /** Sale price per unit in the holding's own currency. */
  price: number;
  /** NZD per unit of the holding's currency (1 for NZD). */
  fxRate?: number | null;
  feeNzd?: number | null;
  date?: string | null;
  otherIncomeNzd?: number | null;
}

export type SalePreview =
  | {
      ok: true;
      ticker: string;
      quantity: number;
      date: string;
      taxYear: string;
      currency: string;
      proceedsNzd: number;
      pricePnlNzd: number;
      fxPnlNzd: number;
      realisedNzd: number;
      otherIncomeNzd: number;
      taxEffectNzd: number;
      marginalRate: number;
      gstNzd: 0;
    }
  | { ok: false; error: string };

function holdingMeta(rows: readonly TaxLedgerRow[], ticker: string): { assetType: string; currency: string; fx: number | null } {
  let last: TaxLedgerRow | null = null;
  for (const row of rows) {
    if ((row.type === "buy" || row.type === "opening_balance") && String(row.ticker || "").trim().toUpperCase() === ticker) last = row;
  }
  const fx = Number(last?.fx_rate);
  return { assetType: String(last?.asset_type || "stock"), currency: String(last?.currency || "NZD").toUpperCase(), fx: fx > 0 ? fx : null };
}

/** Holdings that can be previewed: ticker and open FIFO quantity. */
export function previewableHoldings(rows: readonly TaxLedgerRow[]): Array<{ ticker: string; quantity: number; currency: string }> {
  return [...fifoRemainingShareQty(rows)]
    .map(([ticker, quantity]) => ({ ticker, quantity, currency: holdingMeta(rows, ticker).currency }))
    .sort((a, b) => a.ticker.localeCompare(b.ticker));
}

export function previewSale(rows: readonly TaxLedgerRow[], input: SaleInput, today = aucklandCivilToday()): SalePreview {
  const ticker = String(input.ticker || "").trim().toUpperCase();
  const quantity = Number(input.quantity);
  const price = Number(input.price);
  if (!ticker) return { ok: false, error: "Choose a holding." };
  if (!(quantity > 0)) return { ok: false, error: "Enter a quantity above 0." };
  if (!(price > 0)) return { ok: false, error: "Enter a sale price above 0." };
  const open = fifoRemainingShareQty(rows).get(ticker) ?? 0;
  if (quantity - open > 1e-9) return { ok: false, error: `You hold ${open} ${ticker}. A preview cannot sell more than that.` };
  const meta = holdingMeta(rows, ticker);
  const fx = meta.currency === "NZD" ? 1 : Number(input.fxRate ?? meta.fx);
  if (!(fx > 0)) return { ok: false, error: `Enter the NZD rate for ${meta.currency}.` };
  const fee = Number(input.feeNzd ?? 0);
  if (!(fee >= 0)) return { ok: false, error: "The fee cannot be negative." };
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(input.date || "")) ? String(input.date) : today;
  const ending = nzTaxYearEnding(date);
  if (ending == null) return { ok: false, error: "Enter a valid sale date." };
  const sell: TaxLedgerRow = {
    type: "sell",
    ticker,
    asset_type: meta.assetType,
    executed_at: date,
    quantity,
    price,
    currency: meta.currency,
    fx_rate: fx,
    fees_nzd: roundMoney(fee),
  } as TaxLedgerRow;
  const fifo = fifoStoredForSell(rows, sell);
  if (!fifo) return { ok: false, error: "A rate or a lot is missing in your ledger, so this sale cannot be worked out." };
  const other = Math.max(0, Number(input.otherIncomeNzd) || 0);
  const taxEffect = roundMoney(nzIncomeTax(other + fifo.realisedNzd) - nzIncomeTax(other));
  const marginal = NZ_INDIVIDUAL_BANDS.find((band) => other < band.upTo)?.rate ?? 0.39;
  return {
    ok: true,
    ticker,
    quantity,
    date,
    taxYear: nzTaxYearLabel(ending),
    currency: meta.currency,
    proceedsNzd: roundMoney(quantity * price * fx - fee),
    pricePnlNzd: fifo.pricePnlNzd,
    fxPnlNzd: fifo.fxPnlNzd,
    realisedNzd: fifo.realisedNzd,
    otherIncomeNzd: roundMoney(other),
    taxEffectNzd: taxEffect,
    marginalRate: marginal,
    gstNzd: 0,
  };
}
