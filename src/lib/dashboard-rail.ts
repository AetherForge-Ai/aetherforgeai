/**
 * Dashboard right column (TT D1–D10): what each plan sees, from data the page already has.
 */
export const UNLOCK_FEATURES = ["Price alerts for shares and crypto", "Allocation drift against your targets"] as const;

export type RailCardId = "usage" | "drift" | "alerts" | "watchlist" | "unlock";

/** Free: watchlist, usage, then one merged unlock card last. Paid: drift, alerts, watchlist, usage. */
export function railCardsFor(freePlan: boolean): RailCardId[] {
  return freePlan ? ["watchlist", "usage", "unlock"] : ["drift", "alerts", "watchlist", "usage"];
}

/** "3 of 10" style usage line; "—" with no invented figure when the count is not loaded. */
export function usageLine(used: number | null | undefined, limit: number | null | undefined): string {
  if (limit == null || !Number.isFinite(limit)) return used == null ? "—" : `${Math.max(0, Math.floor(used))} · no cap`;
  if (used == null || !Number.isFinite(used)) return `— of ${limit}`;
  return `${Math.max(0, Math.floor(used))} of ${limit}`;
}

/** 0–100 for the usage bar, clamped. */
export function usagePercent(used: number | null | undefined, limit: number | null | undefined): number {
  if (used == null || limit == null || !(limit > 0)) return 0;
  return Math.min(100, Math.max(0, Math.round((used / limit) * 100)));
}

/** Main grid: two columns from xl (1280px); right column 22rem (352px). */
export const RAIL_GRID_CLASS = "mt-4 grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]";
/** D6/D7: sticky on xl with its own scroll; below xl a card grid above the holdings. */
export const RAIL_ASIDE_CLASS =
  "grid min-w-0 content-start gap-4 sm:grid-cols-2 lg:order-first xl:order-none xl:sticky xl:top-24 xl:-m-1 xl:max-h-[calc(100vh-11rem)] xl:grid-cols-1 xl:overflow-y-auto xl:overscroll-contain xl:p-1";
