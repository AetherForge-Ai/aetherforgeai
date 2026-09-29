/**
 * Legacy marketing paths that used to 404. Nav labels stay "Stock Markets"
 * and "Live Results"; both the label and these old URLs land on the pages
 * that already exist.
 */
export const PUBLIC_ROUTE_ALIASES = [
  { source: "/stock-markets", destination: "/markets" },
  { source: "/live-results", destination: "/performance" },
] as const;

export function publicAliasRedirect(pathname: string): string | null {
  const path = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  const hit = PUBLIC_ROUTE_ALIASES.find((row) => row.source === path);
  return hit?.destination ?? null;
}
