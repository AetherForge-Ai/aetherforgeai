"use client";

import { currencyForTicker, formatNzd, type CurrencyCode, type FxRatesToNZD } from "@/lib/currency";
import { splitReturns, type ReturnSplit, type ReturnSplitExtras } from "@/lib/returns-split";

type HoldingLike = {
  shares: number;
  purchase_price: number;
  current_price: number;
  currency?: CurrencyCode;
  ticker?: string;
  asset_type?: "stock" | "crypto" | "metal" | null;
  purchase_date?: string | null;
};

export function computeHoldingSplit({
  holdings,
  incomeNzd,
  rates,
  reportedPnlNzd,
  costFx,
  qtyFx,
  realisedFxNzd,
  foreignCash,
}: {
  holdings: HoldingLike[];
  incomeNzd: number;
  rates: FxRatesToNZD;
  reportedPnlNzd?: number | null;
  costFx?: Record<string, number>;
  qtyFx?: Record<string, number>;
  realisedFxNzd?: number | null;
  foreignCash?: ReturnSplitExtras["foreignCash"];
}): ReturnSplit {
  return splitReturns(
    holdings.map((holding) => {
      const currency =
        holding.currency ||
        currencyForTicker(
          holding.ticker || "",
          holding.asset_type === "crypto" ? "crypto" : holding.asset_type === "metal" ? "metal" : "stock"
        );
      const ticker = (holding.ticker || "").trim().toUpperCase();
      const stored = ticker && costFx ? costFx[ticker] : undefined;
      const qtyRate = ticker && qtyFx ? qtyFx[ticker] : undefined;
      const costRate = stored != null && stored > 0 ? stored : undefined;
      const qtyWeighted = qtyRate != null && qtyRate > 0 ? qtyRate : costRate;
      return {
        quantity: holding.shares,
        costPrice: holding.purchase_price,
        markPrice: holding.current_price,
        currency,
        fxAtCost: qtyWeighted,
        costBasisFx: costRate,
        fxNow: currency === "NZD" ? 1 : rates[currency] || 1,
        purchaseDate: holding.purchase_date,
      };
    }),
    incomeNzd,
    reportedPnlNzd,
    { realisedFxNzd, foreignCash }
  );
}

/**
 * Capital gain, dividend income, and the exchange-rate effect, each with a
 * plain-English note of how the figure is worked out.
 * Pass `split` when the page already computed the book once.
 */
export function ReturnsSplitCard({
  holdings,
  incomeNzd,
  rates,
  reportedPnlNzd,
  costFx,
  qtyFx,
  realisedFxNzd,
  split,
  loading = false,
  scopeLabel = "Whole book",
  reconciledLabel,
  blankReason,
}: {
  holdings: HoldingLike[];
  incomeNzd: number;
  rates: FxRatesToNZD;
  /** P/L at the latest price, in NZ dollars. The lines add up to this figure. */
  reportedPnlNzd?: number | null;
  /** Cost-weighted NZD rate stored on the remaining buy lots, by ticker. */
  costFx?: Record<string, number>;
  /** Quantity-weighted NZD rate on the same lots. */
  qtyFx?: Record<string, number>;
  realisedFxNzd?: number | null;
  /** One snapshot shared by every page. Rounded only inside that call. */
  split?: ReturnSplit | null;
  loading?: boolean;
  /** Same split on every page. A hub P/L figure is a subset and is labelled separately. */
  scopeLabel?: string;
  /** From the portfolio snapshot. Blank on the guest preview. */
  reconciledLabel?: string | null;
  /** Shown instead of numbers when the snapshot cannot price the book. */
  blankReason?: string | null;
}) {
  const resolved =
    split ??
    computeHoldingSplit({
      holdings,
      incomeNzd,
      rates,
      reportedPnlNzd,
      costFx,
      qtyFx,
      realisedFxNzd,
    });

  const figures = [
    { label: "Capital gain", value: resolved.capitalGainNzd, note: resolved.capitalNote },
    { label: "Income", value: resolved.incomeNzd, note: resolved.incomeNote },
    { label: "Currency effect", value: resolved.currencyEffectNzd, note: resolved.currencyNote },
    ...(typeof resolved.feesNzd === "number" && resolved.feesNzd !== 0
      ? [{ label: "Fees", value: resolved.feesNzd, note: resolved.feesNote || "Fees are shown as a reduction." }]
      : []),
    { label: "Other", value: resolved.otherNzd, note: resolved.otherNote },
    { label: "Total", value: resolved.totalNzd, note: resolved.totalNote },
  ];

  return (
    <section
      className="mt-6 rounded-2xl border border-border/70 bg-card/60 p-4"
      data-testid="returns-split"
      aria-busy={loading || undefined}
    >
      <h2 className="font-display text-base font-bold">How the return is split</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        {scopeLabel}. The same capital, income, currency, other, and total on the dashboard, stocks, and crypto.
        A hub P/L card is that asset class only, at today&apos;s exchange rate, and it leaves out the currency effect on this card.
        Other is the rounding residual, including NZ$0.00 when the lines already add up. These lines are worked out from the ledger, not a forecast.
      </p>
      {loading ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((key) => (
            <div key={key} className="h-24 animate-pulse rounded-xl bg-muted/40" />
          ))}
        </div>
      ) : blankReason ? (
        <div className="mt-4">
          <p className="font-display text-lg font-bold text-muted-foreground" title={blankReason}>
            —
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{blankReason}</p>
        </div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {figures.map((figure) => (
            <div key={figure.label} className="rounded-xl border border-border/60 bg-background/40 p-3">
              <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-muted-foreground">{figure.label}</p>
              <p className={`tnum mt-1 font-display text-lg font-bold ${figure.value < 0 ? "text-rose-600" : "text-gain"}`}>
                {formatNzd(figure.value)}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{figure.note}</p>
            </div>
          ))}
        </div>
      )}
      {reconciledLabel ? (
        <p className="mt-3 text-xs text-muted-foreground" data-testid="portfolio-reconciled">
          {reconciledLabel}
        </p>
      ) : null}
    </section>
  );
}
