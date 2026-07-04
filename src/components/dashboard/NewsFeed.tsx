"use client";

import { type NewsItem } from "@/lib/market-intel";
import { useMarketIntel } from "@/components/dashboard/MarketIntelContext";
import { cn } from "@/lib/utils";
import { Newspaper } from "lucide-react";

const IMPACT_STYLES: Record<NewsItem["impact"], string> = {
  Bullish: "bg-emerald-500/15 text-emerald-300",
  Bearish: "bg-rose-500/15 text-rose-300",
  Neutral: "bg-amber-500/12 text-amber-300",
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
          <h2 className="font-display text-lg font-bold">Market news</h2>
          <p className="text-xs text-muted-foreground">Curated &amp; impact-scored for NZ/AU investors</p>
        </div>
      </div>

      <div className="mt-4 divide-y divide-border/40">
        {news.map((n, i) => (
          <div key={i} className="flex items-start gap-4 py-3">
            <div className="flex w-12 shrink-0 flex-col items-center">
              <span className="font-display text-sm font-bold text-primary">{n.relevance}</span>
              <span className="text-[0.55rem] uppercase tracking-wider text-muted-foreground">relevance</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-snug">{n.headline}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[0.66rem] text-muted-foreground">
                <span className="font-semibold text-foreground/70">{n.source}</span>
                <span>·</span>
                <span>{n.market}</span>
                <span>·</span>
                <span>{n.time}</span>
              </div>
            </div>
            <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[0.66rem] font-semibold", IMPACT_STYLES[n.impact])}>
              {n.impact}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
