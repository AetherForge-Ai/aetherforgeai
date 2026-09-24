"use client";

import { formatAucklandHms } from "@/lib/crypto-live";

/** Pulsing Live mark plus the last successful refresh, in Pacific/Auckland. */
export function CryptoLiveStatus({ updatedAt }: { updatedAt: number | null }) {
  const label = updatedAt != null ? formatAucklandHms(new Date(updatedAt)) : null;
  return (
    <div
      className="inline-flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
      data-testid="crypto-live-status"
    >
      <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-600">
        <span className="relative flex size-1.5" aria-hidden>
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400/70" />
          <span className="relative inline-flex size-1.5 rounded-full bg-emerald-400" />
        </span>
        Live
      </span>
      <span title="Pacific/Auckland">Last updated {label ?? "—"}</span>
    </div>
  );
}
