"use client";

import { cryptoFreshnessLabel } from "@/lib/market-freshness";

/** Vendor quote time for the crypto book. Live only when that time is under five minutes old. */
export function CryptoLiveStatus({ updatedAt }: { updatedAt: number | null }) {
  const freshness = cryptoFreshnessLabel(updatedAt != null ? new Date(updatedAt) : null);
  return (
    <div
      className="inline-flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
      data-testid="crypto-live-status"
    >
      <span title="Pacific/Auckland" className={freshness.live ? "font-semibold text-emerald-600" : undefined}>
        {freshness.label}
      </span>
    </div>
  );
}
