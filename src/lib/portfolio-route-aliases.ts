/**
 * Short paths testers and members type directly. Each one used to 404.
 * They land on the portfolio surfaces that already show the ledger and
 * price-alert notifications. Kept off the public sitemap, same as /dashboard.
 */
export const PORTFOLIO_ROUTE_ALIASES = [
  { source: "/transactions", destination: "/dashboard/transactions" },
  { source: "/alerts", destination: "/dashboard/alerts" },
  { source: "/notifications", destination: "/dashboard/alerts" },
] as const;
