"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type { MarketTicker as MarketTickerType } from "@/components/MarketTicker";

/**
 * Goal b19 M-1: the market tape (about 69 KB of JS) loads after first paint.
 * The placeholder holds the band's height so nothing below it moves, and shows
 * no prices: numbers appear only once the tape has loaded its own data.
 */
function TickerPlaceholder() {
  return (
    <div
      aria-hidden="true"
      data-ticker-placeholder
      className="w-full min-h-[302px] min-[390px]:min-h-[284px] border-b border-emerald-500/20 bg-zinc-950 md:min-h-[201px] lg:min-h-[179px]"
    />
  );
}

export const LazyMarketTicker = dynamic(() => import("@/components/MarketTicker").then((m) => m.MarketTicker), {
  ssr: false,
  loading: TickerPlaceholder,
}) as (props: ComponentProps<typeof MarketTickerType>) => React.ReactElement | null;
