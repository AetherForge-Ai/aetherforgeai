/**
 * Short paths testers and members type directly. Each one used to 404.
 * They land on the portfolio surfaces that already show the ledger and
 * price-alert notifications. Kept off the public sitemap, same as /dashboard.
 */
export const PORTFOLIO_ROUTE_ALIASES = [
  { source: "/transactions", destination: "/dashboard/transactions" },
  { source: "/ledger", destination: "/dashboard/transactions" },
  { source: "/alerts", destination: "/dashboard/alerts" },
  { source: "/notifications", destination: "/dashboard/alerts" },
] as const;

export function portfolioAliasRedirect(pathname: string): string | null {
  const path = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  const hit = PORTFOLIO_ROUTE_ALIASES.find((row) => row.source === path);
  return hit?.destination ?? null;
}
