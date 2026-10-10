"use client";

import { useEffect, useState } from "react";
import { NewsFeed } from "@/components/dashboard/NewsFeed";
import { type NewsItem } from "@/lib/market-intel";
import { Newspaper } from "lucide-react";

/**
 * Full-page Market News. Headlines come from GET /api/news so this page does
 * not download the full quote universe.
 */
export function MarketNewsPageContent({ preview = false }: { preview?: boolean }) {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [pending, setPending] = useState(true);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/news")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((body: { news?: NewsItem[] }) => {
        if (!active) return;
        const rows = Array.isArray(body?.news) ? body.news : [];
        setNews(rows);
        setNote(rows.length ? null : "Headlines are not shown right now.");
      })
      .catch(() => {
        if (!active) return;
        setNote("Headlines are not shown right now.");
      })
      .finally(() => {
        if (active) setPending(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary">
          <Newspaper className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-bold">Market News</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Each card is dated by its publish or collection date. A future event is marked Scheduled. The source name is the site the link opens. A headline without a date, or whose link is only a homepage, is not shown. The words are the publisher&apos;s. Bullish, Bearish, Neutral and relevance are an AetherForge tag. They are not a recommendation.
          </p>
        </div>
      </div>

      <div className="mt-8">
        <NewsFeed items={news} pending={pending} note={note} />
      </div>

      {preview ? (
        <p className="mt-4 text-center text-xs text-muted-foreground">
          You&apos;re viewing a preview. Create a free account for the full portfolio experience.
        </p>
      ) : null}
    </div>
  );
}
