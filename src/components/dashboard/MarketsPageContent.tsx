"use client";

import { useEffect, useState } from "react";
import { MarketsExplorer } from "@/components/dashboard/MarketsExplorer";
import { bindActiveAccount } from "@/lib/account-identity";
import type { MarketsTab } from "@/lib/market-detail-routes";
import { LineChart, Globe } from "lucide-react";
import { pageTitle } from "@/lib/page-title";

function marketsHeading(tab: MarketsTab): { title: string; lede: string } {
  if (tab === "CRYPTO") {
    return {
      title: "Crypto markets",
      lede: "Coins by market cap from CoinGecko, in USD. The line under the search is the number this list returned. The Blockchain column is the native chain or platform.",
    };
  }
  if (tab === "DEX") {
    return {
      title: "DEX markets",
      lede: "DEX tokens by 24-hour volume from GeckoTerminal. The line under the search is the number this list returned. Each row shows the chain and the DEX.",
    };
  }
  return {
    title: "Markets",
    lede: "NZX, ASX and US prices, plus crypto. Quoted rows show a time. If the feed fails, the table says so instead of spinning.",
  };
}

/**
 * Full-page markets view. Share Buy stays off. Members add crypto to the paper
 * book; guests follow the same button to sign-up.
 */
export function MarketsPageContent({
  preview = false,
  userId = null,
  initialTab = null,
}: {
  preview?: boolean;
  userId?: string | null;
  /** /markets?tab= so Back from a detail page reopens the same board. */
  initialTab?: MarketsTab | null;
}) {
  // Bind before BuyDialog's effect. This page sits outside AccountOwnerGuard,
  // so an unbound shell made the cash request start with userId null and the
  // apply-gate discarded the logged-in balance.
  bindActiveAccount(!preview && userId ? userId : null);
  const [tab, setTab] = useState<MarketsTab>(initialTab ?? "NZX");

  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    const heading = marketsHeading(tab);
    document.title = pageTitle(heading.title);
  }, [tab]);

  const heading = marketsHeading(tab);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Page header */}
      <div className="flex flex-wrap items-center gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary">
          <LineChart className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-bold">{heading.title}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{heading.lede}</p>
        </div>
      </div>

      {/* Live browser */}
      <div className="mt-6 rounded-3xl border border-border/70 bg-card/50 p-4 sm:p-6">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <Globe className="size-4 text-primary" /> Market snapshot
        </div>
        <MarketsExplorer
          active
          className="h-[70vh]"
          allowBuy={false}
          signedIn={!preview}
          initialTab={initialTab}
          syncTab
          onTabChange={setTab}
        />
      </div>

      {preview && (
        <p className="mt-4 text-center text-xs text-muted-foreground">
          You&apos;re viewing prices. Create a free account to record holdings.
        </p>
      )}
    </div>
  );
}
