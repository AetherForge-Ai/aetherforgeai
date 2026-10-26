import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { formatNzd, formatSignedMoney } from "@/lib/currency";
import { taxSalePreviewEnabled } from "@/lib/feature-flags";
import { getCurrentUser } from "@/lib/session";
import { loadTaxRows } from "@/lib/tax-book-server";
import { TAX_INDICATIVE_LABEL } from "@/lib/tax-disclaimer";
import { previewableHoldings, previewSale, SALE_PREVIEW_NOTES, type SalePreview } from "@/lib/tax-sale-preview";
import type { TaxLedgerRow } from "@/lib/taxable-income";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sale preview", robots: { index: false, follow: false } };

type Params = { ticker?: string; qty?: string; price?: string; fx?: string; fee?: string; date?: string; income?: string };

const field = "mt-1 w-full rounded-lg border border-border/70 bg-background px-2.5 py-1.5 text-sm";

export default async function SalePreviewPage({ searchParams }: { searchParams: Promise<Params> }) {
  // G-18: hidden (404) unless TAX_SALE_PREVIEW=1. OFF in prod until the K-05 review.
  if (!taxSalePreviewEnabled()) notFound();
  const user = await getCurrentUser();
  if (!user) notFound();
  const q = await searchParams;
  let rows: TaxLedgerRow[] = [];
  let readError = false;
  try {
    rows = await loadTaxRows(user._id);
  } catch {
    readError = true;
  }
  const holdings = previewableHoldings(rows);
  const result: SalePreview | null =
    q.ticker && !readError
      ? previewSale(rows, {
          ticker: q.ticker,
          quantity: Number(q.qty),
          price: Number(q.price),
          fxRate: q.fx ? Number(q.fx) : null,
          feeNzd: q.fee ? Number(q.fee) : 0,
          date: q.date || null,
          otherIncomeNzd: q.income ? Number(q.income) : 0,
        })
      : null;

  return (
    <AppShell user={{ name: user.name, email: user.email, image: user.image, subscription_status: user.subscription_status, subscription_plan: user.subscription_plan }}>
      <article className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">New Zealand</p>
        <h1 className="mt-2 font-display text-3xl font-bold">Sale preview</h1>
        <p className="mt-4 text-sm font-semibold" data-af-sale-preview-label>{TAX_INDICATIVE_LABEL}</p>
        <p className="mt-2 text-sm text-muted-foreground">See what selling a holding would realise, and the indicative tax effect. Nothing is recorded.</p>
        {readError ? <p className="mt-4 text-sm" role="alert">Your ledger could not be read. Try again shortly.</p> : null}
        <form method="get" className="mt-6 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Holding
            <select name="ticker" defaultValue={q.ticker || ""} className={field} required>
              <option value="">Choose a holding</option>
              {holdings.map((h) => (
                <option key={h.ticker} value={h.ticker}>{h.ticker} ({h.quantity} held, {h.currency})</option>
              ))}
            </select>
          </label>
          <label className="text-sm">Quantity to sell<input name="qty" type="number" step="any" min="0" defaultValue={q.qty} className={field} required /></label>
          <label className="text-sm">Sale price per unit (holding currency)<input name="price" type="number" step="any" min="0" defaultValue={q.price} className={field} required /></label>
          <label className="text-sm">NZD per unit of currency (blank for NZD)<input name="fx" type="number" step="any" min="0" defaultValue={q.fx} className={field} /></label>
          <label className="text-sm">Sale fee (NZ$)<input name="fee" type="number" step="0.01" min="0" defaultValue={q.fee} className={field} /></label>
          <label className="text-sm">Sale date<input name="date" type="date" defaultValue={q.date} className={field} /></label>
          <label className="text-sm sm:col-span-2">Other taxable income this tax year (NZ$)<input name="income" type="number" step="0.01" min="0" defaultValue={q.income} className={field} /></label>
          <button type="submit" className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground sm:col-span-2">Preview sale</button>
        </form>
        {result && result.ok === false ? <p className="mt-6 text-sm" role="alert">{result.error}</p> : null}
        {result && result.ok ? (
          <dl className="mt-6 grid grid-cols-2 gap-2 text-sm" data-af-sale-preview-result>
            <dt>Tax year</dt><dd>{result.taxYear}</dd>
            <dt>Proceeds after fee</dt><dd>{formatNzd(result.proceedsNzd)}</dd>
            <dt>Price gain</dt><dd>{formatSignedMoney(result.pricePnlNzd)}</dd>
            <dt>FX gain</dt><dd>{formatSignedMoney(result.fxPnlNzd)}</dd>
            <dt>Realised</dt><dd>{formatSignedMoney(result.realisedNzd)}</dd>
            <dt>Indicative tax effect, if taxable</dt><dd>{formatSignedMoney(result.taxEffectNzd)}</dd>
          </dl>
        ) : null}
        <ul className="mt-8 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          {SALE_PREVIEW_NOTES.map((n) => <li key={n}>{n}</li>)}
        </ul>
      </article>
    </AppShell>
  );
}
