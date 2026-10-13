"use client";

import Link from "next/link";

import { ActionableIntelligence } from "@/components/dashboard/ActionableIntelligence";
import { AnalysisPanel } from "@/components/dashboard/AnalysisPanel";
import { CollapsibleSection } from "@/components/dashboard/CollapsibleSection";
import { IndexMarketCard } from "@/components/dashboard/IndexMarketCard";
import { AllMarkets } from "@/components/dashboard/AllMarkets";
import { OpenMarketSnapshot } from "@/components/dashboard/OpenMarketSnapshot";
import { PaidPlanPrompt } from "@/components/dashboard/PaidPlanPrompt";
import { CryptoMarketSection } from "@/components/dashboard/crypto/CryptoMarketSection";
import { CRYPTO_PROJECTIONS_PAUSED, CRYPTO_PROJECTIONS_PAUSE_MESSAGE } from "@/lib/projection-pause";
import type { Stock } from "@/lib/portfolio";
import { Compass, LineChart, Radar } from "lucide-react";

const INDEXES = [
  ["NZX 50", "NZX", "/dashboard/markets/nzsx"],
  ["ASX", "ASX", "/dashboard/markets/asx"],
  ["NASDAQ", "NASDAQ", "/dashboard/markets/nasdaq"],
  ["Dow Jones", "DOW", "/dashboard/markets/dow"],
] as const;

/** Signals, markets, research, the crypto terminal, and the index tiles. Each once. */
export function DashboardInsights({
  stocks,
  holdingsCount,
  freePlan,
  onBought,
}: {
  stocks: Stock[];
  holdingsCount: number;
  freePlan: boolean;
  onBought: () => void;
}) {
  return (
    <div className="space-y-4" data-section="insights">
      <div>
        <h2 className="text-base font-semibold">Insights</h2>
        <p className="mt-1 text-xs text-muted-foreground">Signals, markets, and research.</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {INDEXES.map(([title, exchange, href]) => (
          <Link key={exchange} href={href} className="block transition-opacity hover:opacity-95">
            <IndexMarketCard title={title} exchange={exchange} />
          </Link>
        ))}
      </div>
      <CollapsibleSection title="Informational signals" icon={Radar}>
        {freePlan ? (
          <PaidPlanPrompt detail="Informational signals beyond basic P/L are on a paid plan." />
        ) : (
          <ActionableIntelligence stocks={stocks} assetClass="stock" onBought={onBought} />
        )}
      </CollapsibleSection>
      <CollapsibleSection title="Market insights" icon={Compass} subtitle="Cross-exchange browser, snapshot, and movers">
        <div className="grid gap-4 lg:grid-cols-2">
          <AllMarkets onBought={onBought} scope="equity" />
          <OpenMarketSnapshot onBought={onBought} />
        </div>
      </CollapsibleSection>
      <CollapsibleSection title="AI research report" icon={LineChart}>
        <AnalysisPanel holdingsCount={holdingsCount} scope="equity" />
      </CollapsibleSection>
      <CollapsibleSection title="Institutional Crypto Terminal" icon={LineChart}>
        <CryptoMarketSection showProjected={!freePlan && !CRYPTO_PROJECTIONS_PAUSED} />
        {freePlan && CRYPTO_PROJECTIONS_PAUSED ? (
          <p className="mt-3 text-sm text-muted-foreground">{CRYPTO_PROJECTIONS_PAUSE_MESSAGE}</p>
        ) : null}
      </CollapsibleSection>
    </div>
  );
}
