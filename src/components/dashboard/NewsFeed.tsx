"use client";

import { type NewsItem } from "@/lib/market-intel";
import { useMarketIntel } from "@/components/dashboard/MarketIntelContext";
import { cn } from "@/lib/utils";
import { Newspaper } from "lucide-react";

const IMPACT_STYLES: Record<NewsItem["impact"], string> = {
  Bullish: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  Bearish: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  Neutral: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
};

export function NewsFeed() {
  const { news } = useMarketIntel();

  return (
    <section className="rounded-3xl border border-border/70 bg-card/50 p-6">
      <div className="flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-lg bg-primary/12 text-primary">
          <Newspaper className="size-4" />
        </span>
        <div>
          <h2 className="font-display text-lg font-bold text-white">Market news</h2>
          <p className="text-xs text-muted-foreground">
            Curated &amp; impact-scored for NZ/AU investors
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {news.map((n, i) => (
          <article
            key={`${n.headline}-${i}`}
            className="flex h-full flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/80 p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 text-[0.66rem] font-semibold",
                  IMPACT_STYLES[n.impact],
                )}
              >
                {n.impact}
              </span>
              <span className="text-[0.66rem] tabular-nums text-muted-foreground">{n.time}</span>
            </div>

            <h3 className="mt-3 text-sm font-semibold leading-snug text-white">{n.headline}</h3>

            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              {n.source} · {n.market}
            </p>

            <div className="mt-auto flex items-end justify-between gap-2 pt-4">
              <div className="flex flex-col">
                <span className="font-display text-lg font-bold leading-none text-primary">
                  {n.relevance}
                </span>
                <span className="mt-1 text-[0.55rem] uppercase tracking-wider text-muted-foreground">
                  relevance
                </span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}