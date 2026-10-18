"use client";

import { useEffect, useState } from "react";

/**
 * b28 L-4 / b29: count of the member's price alerts (every desk), from GET /api/alerts, kept live
 * by `af:alerts-delta` events that PriceAlerts dispatches on create (+1) and remove (−1).
 * No alert limit is enforced by any plan, so none is shown (no invented limit).
 */

export function useAlertCount(enabled: boolean): number | null {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    fetch("/api/alerts", { credentials: "include", cache: "no-store" })
      .then((r) => r.json() as Promise<{ ok?: boolean; data?: unknown[] }>)
      .then((b) => {
        if (live && b?.ok && Array.isArray(b.data)) setCount(b.data.length);
      })
      .catch(() => {});
    const onDelta = (e: Event) => {
      const d = (e as CustomEvent<{ delta: number }>).detail?.delta ?? 0;
      setCount((c) => (c == null ? c : Math.max(0, c + d)));
    };
    window.addEventListener("af:alerts-delta", onDelta);
    return () => {
      live = false;
      window.removeEventListener("af:alerts-delta", onDelta);
    };
  }, [enabled]);
  return count;
}


/** One line: "1 alert" / "3 alerts" (no plan limit). */
export function alertCountText(count: number | null): string {
  if (count == null) return "—";
  return `${count} ${count === 1 ? "alert" : "alerts"} in use (no plan limit)`;
}

/**
 * b29 L-4: TT looks for the counter on /dashboard/alerts, so it sits at the top of that page
 * (above the share, crypto and metals lists), as well as in the dashboard Plan usage card.
 */
export function AlertCounter({ enabled }: { enabled: boolean }) {
  const count = useAlertCount(enabled);
  if (!enabled) return null;
  return (
    <p className="text-sm font-semibold" data-alert-counter="alerts-page" aria-live="polite">
      Price alerts: <span className="tnum" data-alert-count={count ?? ""}>{alertCountText(count)}</span>
    </p>
  );
}
