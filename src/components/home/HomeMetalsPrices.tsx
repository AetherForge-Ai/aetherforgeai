"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatMoney, formatFxAsOf } from "@/lib/currency";

interface MetalSpot {
  usdPerOz: number;
  nzdPerOz: number;
}

interface MetalsSpot {
  gold: MetalSpot;
  silver: MetalSpot;
  live: boolean;
  asOf: string;
}

/**
 * Homepage gold and silver cards. Same /api/metals/spot payload and the same
 * money format as Smitty, so the figures cannot drift apart.
 */
export function HomeMetalsPrices() {
  const [spot, setSpot] = useState<MetalsSpot | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .get<MetalsSpot>("/api/metals/spot")
      .then((res) => {
        if (!active) return;
        if (res.ok && res.data?.gold && res.data.silver) setSpot(res.data);
        else setFailed(true);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const stamp = spot?.asOf ? formatFxAsOf(spot.asOf) : "";
  const status = !spot ? (failed ? "Spot prices failed to load." : "Loading spot prices…") : spot.live ? "Live" : "Estimated";

  return (
    <div className="mx-auto mt-6 grid w-full max-w-xl gap-3 sm:grid-cols-2">
      {(
        [
          ["gold", "Gold · XAU", "border-amber-500/30 bg-amber-500/10", "text-amber-400"],
          ["silver", "Silver · XAG", "border-slate-400/30 bg-slate-400/10", "text-slate-200"],
        ] as const
      ).map(([key, label, box, tone]) => {
        const row = spot?.[key];
        return (
          <div key={key} className={`rounded-2xl border p-4 ${box}`}>
            <p className={`text-xs font-semibold uppercase tracking-wider ${tone}`}>{label}</p>
            <p className={`mt-1 font-display text-xl font-bold ${tone}`}>
              {row ? (
                <>
                  {formatMoney(row.nzdPerOz, "NZD")}
                  <span className="ml-1 text-sm font-medium text-muted-foreground">/oz</span>
                </>
              ) : (
                status
              )}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {row ? `${formatMoney(row.usdPerOz, "USD")}/oz` : "Same feed as Smitty"}
            </p>
          </div>
        );
      })}
      <p className="sm:col-span-2 text-center text-xs text-muted-foreground">
        {spot ? `${status}${stamp ? ` · ${stamp}` : ""}` : status}
      </p>
    </div>
  );
}
