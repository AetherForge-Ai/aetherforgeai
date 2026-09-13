"use client";

import { MarketIntelProvider } from "@/components/dashboard/MarketIntelContext";
import { NewsFeed } from "@/components/dashboard/NewsFeed";
import { DashboardSectionTitle } from "@/components/dashboard/DashboardSectionTitle";
import { Newspaper } from "lucide-react";

/**
 * Full-page Market News — same NewsFeed card grid as on the Dashboard
 * (4-wide with images + descriptions), same news focus via MarketIntelProvider.
 */
export function MarketNewsPageContent({ preview = false }: { preview?: boolean }) {
  return (
    <MarketIntelProvider bot="stock">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary">
            <Newspaper className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-2xl font-bold">Market News</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              The same market headlines shown on your Dashboard — impact, relevance, images and source links.
            </p>
          </div>
        </div>

        <div className="mt-8">
          <DashboardSectionTitle title="Market News" />
          <NewsFeed />
        </div>

        {preview ? (
          <p className="mt-4 text-center text-xs text-muted-foreground">
            You&apos;re viewing a live preview. Create a free account for the full portfolio experience.
          </p>
        ) : null}
      </div>
    </MarketIntelProvider>
  );
}
