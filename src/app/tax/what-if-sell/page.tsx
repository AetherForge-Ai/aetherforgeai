import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { NzTaxPreviewView, type NzPreviewHolding } from "@/components/tax/NzTaxPreviewView";
import { nzTaxPreviewEnabled } from "@/lib/feature-flags";
import { marketsFromNotes } from "@/lib/fif-working-paper";
import { readFifThreshold } from "@/lib/fif-setting.server";
import {
  defaultSalePrice,
  defaultSaleQuantity,
  previewNzTaxSale,
  resolvePreviewDate,
  type NzTaxPreview,
} from "@/lib/nz-tax-preview";
import { getCurrentUser } from "@/lib/session";
import { loadStockNoteRows, loadTaxRows, loadYieldHoldings } from "@/lib/tax-book-server";
import { previewableHoldings } from "@/lib/tax-sale-preview";

export const dynamic = "force-dynamic";
export const metadata = { title: "What if I sell?", robots: { index: false, follow: false } };

type Query = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw == null ? "" : String(raw);
}

export default async function WhatIfSellPage({ searchParams }: { searchParams: Promise<Query> }) {
  // NZ-TAX-PREVIEW-1: hidden unless NZ_TAX_PREVIEW=1. No ledger read while the flag is off.
  if (!nzTaxPreviewEnabled()) notFound();
  const user = await getCurrentUser();
  if (!user) notFound();
  const q = await searchParams;
  const resolved = resolvePreviewDate({ date: one(q.date) || null, year: one(q.year) || null });
  const date = resolved.ok ? resolved.date : one(q.date);

  let holdings: NzPreviewHolding[] = [];
  let readError = false;
  let result: NzTaxPreview | null = null;
  let thresholdNzd = 50_000;
  try {
    const [rows, stocks, yields, savedThreshold] = await Promise.all([
      loadTaxRows(user._id),
      loadStockNoteRows(user._id),
      loadYieldHoldings(user._id),
      readFifThreshold(user._id),
    ]);
    thresholdNzd = savedThreshold;
    const current = new Map(yields.map((row) => [row.ticker.trim().toUpperCase(), row.currentPrice]));
    holdings = previewableHoldings(rows).map((holding) => ({
      ...holding,
      currentPrice: current.get(holding.ticker) ?? null,
    }));
    const ticker = one(q.ticker).trim().toUpperCase();
    const selected = holdings.find((holding) => holding.ticker === ticker) ?? null;
    const quantity = defaultSaleQuantity(selected?.quantity ?? null, one(q.qty) || null);
    const price = defaultSalePrice(selected?.currentPrice ?? null, one(q.price) || null);
    if (resolved.ok === false) {
      result = { ok: false, error: resolved.error };
    } else if (ticker && quantity != null && price != null) {
      result = previewNzTaxSale({
        rows,
        markets: marketsFromNotes(stocks, resolved.endingYear),
        sale: { ticker, quantity, price, date: resolved.date },
        thresholdNzd,
      });
    }
  } catch {
    readError = true;
  }

  const ticker = one(q.ticker).trim().toUpperCase();
  const selected = holdings.find((holding) => holding.ticker === ticker) ?? null;
  const quantity = one(q.qty) || (selected ? String(selected.quantity) : "");
  const explicitPrice = one(q.price);
  const price = explicitPrice || (selected?.currentPrice != null ? String(selected.currentPrice) : "");
  const priceNote =
    !explicitPrice && selected?.currentPrice != null
      ? "The sale price starts as the current price stored on this holding."
      : selected && selected.currentPrice == null
        ? "No current price is stored for this holding, so enter a sale price."
        : null;

  return (
    <AppShell
      user={{
        name: user.name,
        email: user.email,
        image: user.image,
        subscription_status: user.subscription_status,
        subscription_plan: user.subscription_plan,
      }}
    >
      <NzTaxPreviewView
        holdings={holdings}
        ticker={ticker}
        quantity={quantity}
        price={price}
        year={resolved.ok ? String(resolved.endingYear) : ""}
        date={date}
        priceNote={priceNote}
        readError={readError}
        result={result}
      />
    </AppShell>
  );
}
