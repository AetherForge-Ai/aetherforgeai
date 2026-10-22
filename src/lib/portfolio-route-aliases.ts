/**
 * Short paths testers and members type directly. Each one used to 404.
 * They land on the portfolio surfaces that already show the ledger and
 * price-alert notifications. Kept off the public sitemap, same as /dashboard.
 */
export const PORTFOLIO_ROUTE_ALIASES = [
  // b61 TT P2: /ledger and /transactions go straight to the dashboard Transactions tab in one 308.
  // They used to 307 to /dashboard/transactions, which then 308'd again (two hops).
  { source: "/transactions", destination: "/dashboard?tab=transactions", permanent: true },
  { source: "/ledger", destination: "/dashboard?tab=transactions", permanent: true },
  { source: "/alerts", destination: "/dashboard/alerts", permanent: false },
  { source: "/notifications", destination: "/dashboard/alerts", permanent: false },
] as const;

function findAlias(pathname: string) {
  const path = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  return PORTFOLIO_ROUTE_ALIASES.find((row) => row.source === path);
}

export function portfolioAliasRedirect(pathname: string): string | null {
  return findAlias(pathname)?.destination ?? null;
}

/** HTTP status for a portfolio alias: 308 for permanent rows, 307 otherwise. */
export function portfolioAliasStatus(pathname: string): 307 | 308 | null {
  const hit = findAlias(pathname);
  if (!hit) return null;
  return hit.permanent ? 308 : 307;
}
