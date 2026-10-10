"use client";

import Link from "next/link";
import { ArrowLeft, LineChart } from "lucide-react";
import { StockDetailView } from "@/components/dashboard/StockDetailView";
import { stockBackHref } from "@/lib/market-detail-routes";
import type { Exchange } from "@/lib/market-intel";
import type { StockBoard } from "@/lib/stock-markets";

/**
 * Full-page stock detail. The ticker in the URL is the same symbol /api/stock-detail already takes.
 */
export function StockAssetPage({
  ticker,
  symbol,
  exchange = null,
  allowBuy = false,
  unavailable = false,
}: {
  ticker: string;
  symbol: string;
  exchange?: StockBoard | null;
  allowBuy?: boolean;
  unavailable?: boolean;
}) {
  const back = stockBackHref(ticker, exchange);
  const detailExchange: Exchange | undefined = exchange && exchange !== "NYSE" ? exchange : undefined;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href={back.href}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary underline-offset-4 hover:underline"
      >
        <ArrowLeft className="size-4" /> {back.label}
      </Link>

      <div className="mt-4 flex items-center gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary">
          <LineChart className="size-6" />
        </span>
        <p className="text-sm font-semibold text-muted-foreground">Stock Markets</p>
      </div>

      <div className="mt-6 overflow-hidden rounded-3xl border border-border/70 bg-card/50">
        <StockDetailView
          target={
            symbol
              ? {
                  ticker: ticker || symbol,
                  symbol,
                  exchange: detailExchange,
                }
              : null
          }
          canBuy={allowBuy}
          unavailable={unavailable}
          variant="page"
        />
      </div>
    </div>
  );
}
