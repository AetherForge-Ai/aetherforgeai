"use client";

import { useState } from "react";
import { type NewsItem } from "@/lib/market-intel";
import { useMarketIntel } from "@/components/dashboard/MarketIntelContext";
import { cn } from "@/lib/utils";
import { ExternalLink, Newspaper } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const IMPACT_STYLES: Record<NewsItem["impact"], string> = {
  Bullish: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  Bearish: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  Neutral: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
};

export function NewsFeed() {
  const { news } = useMarketIntel();
  const [active, setActive] = useState<NewsItem | null>(null);

  return (
    <section className="rounded-3xl border border-border/70 bg-card/50 p-6">
      <div className="flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-lg bg-primary/12 text-primary">
          <Newspaper className="size-4" />
        </span>
        <div>
          <h2 className="font-display text-lg font-bold text-white">Market news</h2>
          <p className="text-xs text-muted-foreground">
            Curated &amp; impact-scored for NZ/AU investors — tap a card for the full story
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {news.map((n, i) => (
          <button
            key={`${n.headline}-${i}`}
            type="button"
            onClick={() => setActive(n)}
            className="flex h-full flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/80 p-4 text-left shadow-sm transition hover:border-primary/50 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            {n.imageUrl ? (
              <div className="mb-3 overflow-hidden rounded-xl border border-border/50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={n.imageUrl}
                  alt=""
                  className="h-28 w-full object-cover"
                  loading="lazy"
                />
              </div>
            ) : null}

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

            <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
              {n.summary}
            </p>

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
              <span className="text-[0.66rem] font-semibold text-primary">Read article →</span>
            </div>
          </button>
        ))}
      </div>

      <Dialog open={!!active} onOpenChange={(open) => !open && setActive(null)}>
        <DialogContent className="max-w-2xl border-border/70 bg-card text-foreground sm:max-w-2xl">
          {active ? (
            <>
              <DialogHeader>
                <div className="flex flex-wrap items-center gap-2 pr-6">
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[0.66rem] font-semibold",
                      IMPACT_STYLES[active.impact],
                    )}
                  >
                    {active.impact}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {active.source} · {active.market} · {active.time}
                  </span>
                </div>
                <DialogTitle className="font-display text-left text-xl font-bold leading-snug text-white">
                  {active.headline}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  Full market news article
                </DialogDescription>
              </DialogHeader>

              {active.imageUrl ? (
                <div className="overflow-hidden rounded-xl border border-border/60">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={active.imageUrl}
                    alt=""
                    className="max-h-72 w-full object-cover"
                  />
                </div>
              ) : null}

              <p className="text-sm leading-relaxed text-muted-foreground">{active.summary}</p>

              <a
                href={active.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
              >
                Open original source
                <ExternalLink className="size-3.5" />
              </a>
              <p className="break-all text-xs text-muted-foreground">{active.url}</p>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
