import { NZ_TAX_PREVIEW_DISCLAIMER, type NzTaxPreview } from "@/lib/nz-tax-preview";
import { NZ_TAX_PREVIEW_PATH } from "@/components/tax/WhatIfSellLink";

const field = "mt-1 w-full rounded-lg border border-border/70 bg-background px-2.5 py-1.5 text-sm";

export interface NzPreviewHolding {
  ticker: string;
  quantity: number;
  currency: string;
  currentPrice: number | null;
}

export function NzTaxPreviewView({
  holdings,
  ticker,
  quantity,
  price,
  year,
  date,
  priceNote,
  readError,
  result,
}: {
  holdings: readonly NzPreviewHolding[];
  ticker: string;
  quantity: string;
  price: string;
  year: string;
  date: string;
  priceNote: string | null;
  readError: boolean;
  result: NzTaxPreview | null;
}) {
  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6" data-af-nz-tax-preview>
      <p className="text-xs font-semibold uppercase tracking-wide text-primary">New Zealand</p>
      <h1 className="mt-2 font-display text-3xl font-bold">What if I sell?</h1>
      <p
        role="note"
        data-af-nz-tax-preview-disclaimer
        className="mt-4 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-base font-semibold text-foreground"
      >
        {NZ_TAX_PREVIEW_DISCLAIMER}
      </p>
      <p className="mt-3 text-sm text-muted-foreground">
        See how selling part of a holding would change the FIF cost test, and the FDR, comparative value and IR3 helper
        figures the working paper already calculates. Nothing is recorded.
      </p>
      {readError ? (
        <p className="mt-4 text-sm" role="alert">
          Your ledger could not be read. Try again shortly.
        </p>
      ) : null}
      <form method="get" action={NZ_TAX_PREVIEW_PATH} className="mt-6 grid gap-3 sm:grid-cols-2">
        {year ? <input type="hidden" name="year" value={year} /> : null}
        {date ? <input type="hidden" name="date" value={date} /> : null}
        <label className="text-sm sm:col-span-2">
          Holding
          <select name="ticker" defaultValue={ticker} className={field} required>
            <option value="">Choose a holding</option>
            {holdings.map((holding) => (
              <option key={holding.ticker} value={holding.ticker}>
                {holding.ticker} ({holding.quantity} held, {holding.currency}
                {holding.currentPrice != null ? `, current ${holding.currentPrice}` : ""})
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Quantity to sell
          <input name="qty" type="number" step="any" min="0" defaultValue={quantity} className={field} required />
        </label>
        <label className="text-sm">
          Sale price per unit
          <input name="price" type="number" step="any" min="0" defaultValue={price} className={field} required />
        </label>
        {priceNote ? <p className="text-xs text-muted-foreground sm:col-span-2">{priceNote}</p> : null}
        <button type="submit" className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground sm:col-span-2">
          Preview sale
        </button>
      </form>
      {result && result.ok === false ? (
        <p className="mt-6 text-sm" role="alert">
          {result.error}
        </p>
      ) : null}
      {result && result.ok ? (
        <div className="mt-6 space-y-2 text-sm" data-af-nz-tax-preview-result>
          {result.lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      ) : null}
    </article>
  );
}
