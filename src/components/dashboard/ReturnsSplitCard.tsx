"use client";

import { currencyForTicker, formatNzd, type CurrencyCode, type FxRatesToNZD } from "@/lib/currency";
import { splitReturns } from "@/lib/returns-split";

type HoldingLike = {
  shares: number;
  purchase_price: number;
  current_price: number;
  currency?: CurrencyCode;
  ticker?: string;
  asset_type?: "stock" | "crypto" | "metal" | null;
};

/**
 * Capital gain, dividend income, and the exchange-rate effect, each with a
 * plain-English note of how the figure is worked out.
 */
export function ReturnsSplitCard({
  holdings,
  incomeNzd,
  rates,
  loading = false,
}: {
  holdings: HoldingLike[];
  incomeNzd: number;
  rates: FxRatesToNZD;
  loading?: boolean;
}) {
  const split = splitReturns(
    holdings.map((holding) => {
      const currency =
        holding.currency ||
        currencyForTicker(
          holding.ticker || "",
          holding.asset_type === "crypto" ? "crypto" : holding.asset_type === "metal" ? "metal" : "stock"
        );
      return {
        quantity: holding.shares,
        costPrice: holding.purchase_price,
        markPrice: holding.current_price,
        currency,
        fxNow: currency === "NZD" ? 1 : rates[currency] || 1,
      };
    }),
    incomeNzd
  );

  const figures = [
    { label: "Capital gain", value: split.capitalGainNzd, note: split.capitalNote },
    { label: "Income", value: split.incomeNzd, note: split.incomeNote },
    { label: "Currency effect", value: split.currencyEffectNzd, note: split.currencyNote },
  ];

  return (
    <section
      className="mt-6 rounded-2xl border border-border/70 bg-card/60 p-4"
      data-testid="returns-split"
      aria-busy={loading || undefined}
    >
      <h2 className="font-display text-base font-bold">How the return is split</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Three parts of the paper result. They are worked out from the ledger, not a forecast.
      </p>
      {loading ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((key) => (
            <div key={key} className="h-24 animate-pulse rounded-xl bg-muted/40" />
          ))}
        </div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {figures.map((figure) => (
            <div key={figure.label} className="rounded-xl border border-border/60 bg-background/40 p-3">
              <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-muted-foreground">{figure.label}</p>
              <p className={`tnum mt-1 font-display text-lg font-bold ${figure.value < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                {formatNzd(figure.value)}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{figure.note}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
