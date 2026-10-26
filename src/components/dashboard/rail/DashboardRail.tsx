"use client";

import type { PortfolioSnapshot } from "@/lib/portfolio-snapshot";
import { PriceAlerts } from "@/components/dashboard/PriceAlerts";
import { WatchlistPanel } from "@/components/dashboard/WatchlistPanel";
import { SnapshotAllocation } from "@/components/dashboard/SnapshotAllocation";
import { RailCard, RailTabs } from "@/components/dashboard/rail/RailCard";
import { FREE_REPORTS_PER_MONTH } from "@/lib/entitlements";
import { useAlertCount } from "@/components/dashboard/alerts/AlertCounter";
import { HoldingCapsMeter, useHoldingCapsFlag } from "@/components/dashboard/rail/HoldingCapsMeter";
import { railCardsFor, usageMeterLabel, usagePercent, UNLOCK_FEATURES } from "@/lib/dashboard-rail";

type Asset = "stock" | "crypto";
type Seed = { ticker: string; nonce: number; asset: Asset } | null;

/** Dashboard right column (TT D1–D10). Uses only data the dashboard already loads. */
export function DashboardRail({
  freePlan,
  loading,
  preview,
  bookSnapshot,
  stockOnly,
  cryptoMarked,
  alertClass,
  onAlertClass,
  alertSeed,
  watchClass,
  onWatchClass,
  watchReload,
  watchSeed,
  holdingsCount,
  tickerLimit,
  reportQuota,
}: {
  freePlan: boolean;
  loading: boolean;
  preview: boolean;
  bookSnapshot: PortfolioSnapshot | null;
  stockOnly: React.ComponentProps<typeof PriceAlerts>["stocks"];
  cryptoMarked: React.ComponentProps<typeof PriceAlerts>["stocks"];
  alertClass: Asset;
  onAlertClass: (a: Asset) => void;
  alertSeed: Seed;
  watchClass: Asset;
  onWatchClass: (a: Asset) => void;
  watchReload: number;
  watchSeed: Seed;
  holdingsCount: number;
  tickerLimit: number | null;
  reportQuota: { used: number; limit: number } | null;
}) {
  const alertCount = useAlertCount(!freePlan && !preview);
  // b68 G-07: caps meter only when HOLDING_CAPS_V2=1 on the server (OFF in prod).
  const capsV2 = useHoldingCapsFlag();
  return (
    <>
    {railCardsFor(freePlan).map((card) => {
      if (card === "drift") return <SnapshotAllocation key={card} snapshot={bookSnapshot} />;
      if (card === "alerts")
        return (
          <RailCard
            key={card}
            id="dashboard-alerts"
            title="Alerts"
            action={
              <RailTabs<"stock" | "crypto">
                label="Alert class"
                value={alertClass}
                onChange={onAlertClass}
                options={[
                  { id: "stock", label: "Shares" },
                  { id: "crypto", label: "Crypto" },
                ]}
              />
            }
          >
            <PriceAlerts
              key={alertClass}
              bare
              stocks={alertClass === "crypto" ? cryptoMarked : stockOnly}
              assetType={alertClass}
              holdingsReady={!loading}
              preview={preview}
              canCreate
              seedTicker={alertSeed?.asset === alertClass ? alertSeed.ticker : null}
              seedNonce={alertSeed?.asset === alertClass ? alertSeed.nonce : 0}
            />
          </RailCard>
        );
      if (card === "watchlist")
        return (
          <WatchlistPanel
            key={card}
            bot={watchClass}
            reloadSignal={watchReload}
            preview={preview}
            seedTicker={watchSeed && watchSeed.asset === watchClass ? watchSeed.ticker : null}
            seedNonce={watchSeed && watchSeed.asset === watchClass ? watchSeed.nonce : 0}
            headerAction={
              <RailTabs<"stock" | "crypto">
                label="Watchlist class"
                value={watchClass}
                onChange={onWatchClass}
                options={[
                  { id: "stock", label: "Shares" },
                  { id: "crypto", label: "Crypto" },
                ]}
              />
            }
          />
        );
      if (card === "usage")
        return (
          <RailCard key={card} id="dashboard-usage" title="Plan usage">
            <dl className="space-y-3 text-sm">
              {[
                { label: "Holdings", used: loading ? null : holdingsCount, limit: tickerLimit },
                // b28 L-4: price alerts in use. No plan limit is enforced, so none is shown.
                ...(freePlan ? [] : [{ label: "Price alerts", used: alertCount, limit: null as number | null }]),
                ...(freePlan
                  ? [{ label: "Reports this month", used: reportQuota?.used ?? null, limit: reportQuota?.limit ?? FREE_REPORTS_PER_MONTH }]
                  : []),
              ].map((row) => (
                // Goal b11 G-14: dt/dd sit directly in the row div so the list is valid.
                <div key={row.label} className="grid grid-cols-[1fr_auto] items-baseline gap-x-3" {...(row.label === "Price alerts" ? { "data-alert-counter": "plan-usage" } : {})}>
                  <dt className="text-muted-foreground">{row.label}</dt>
                  <dd className="tnum font-semibold">{usageMeterLabel(row.used, row.limit)}</dd>
                  {capsV2 && row.label === "Holdings" && row.used != null ? (
                    // b68 G-07: caps meter behind HOLDING_CAPS_V2 (OFF in prod).
                    <dd className="col-span-2"><HoldingCapsMeter used={row.used} limit={row.limit} /></dd>
                  ) : row.limit != null ? (
                    <dd className="col-span-2 mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${usagePercent(row.used, row.limit)}%` }} />
                    </dd>
                  ) : null}
                </div>
              ))}
            </dl>
          </RailCard>
        );
      return (
        <RailCard
          key={card}
          id="dashboard-unlock"
          title="Unlock with Starter and above"
          action={null}
        >
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {UNLOCK_FEATURES.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <a
            href="/pricing"
            className="mt-4 inline-flex h-9 items-center rounded-md bg-[#047857] px-4 text-sm font-semibold text-white outline-none hover:bg-[#065f46] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            See plans
          </a>
        </RailCard>
      );
    })}
            </>
  );
}
