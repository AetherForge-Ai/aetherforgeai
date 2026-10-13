"use client";

import { allocationShares } from "@/lib/snapshot-allocation";
import type { PortfolioSnapshot } from "@/lib/portfolio-snapshot";

export function SnapshotAllocation({ snapshot }: { snapshot: PortfolioSnapshot | null }) {
  if (!snapshot) {
    return (
      <section className="rounded-2xl border border-border/70 bg-card/50 p-4" data-section="allocation">
        <h2 className="text-sm font-semibold">Allocation</h2>
        <p className="mt-2 text-sm text-muted-foreground" title="Allocation waits for the snapshot.">
          —
          <span className="mt-1 block text-xs">Allocation waits for the snapshot.</span>
        </p>
      </section>
    );
  }
  const shares = allocationShares(snapshot);
  return (
    <section className="rounded-2xl border border-border/70 bg-card/50 p-4" data-section="allocation">
      <h2 className="text-sm font-semibold">Allocation</h2>
      <p className="mt-1 text-xs text-muted-foreground">By asset class, from this snapshot.</p>
      <ul className="mt-3 space-y-3">
        {shares.map((row) => (
          <li key={row.id}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span>{row.label}</span>
              <span className="tnum" title={row.reason || undefined}>
                {row.display}
                {row.reason ? <span className="sr-only"> {row.reason}</span> : null}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted/50" aria-hidden>
              <div
                className="h-full rounded-full bg-primary/70"
                style={{ width: `${row.share == null ? 0 : Math.max(0, Math.min(100, row.share * 100))}%` }}
              />
            </div>
            {row.share == null && row.reason ? <p className="mt-1 text-xs text-muted-foreground">{row.reason}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
