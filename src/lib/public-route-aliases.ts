/**
 * Legacy marketing paths. Old URLs land on the public pages that already exist.
 * /about-us opens About. /live-results opens the July paper-book page.
 */
export const PUBLIC_ROUTE_ALIASES = [
  { source: "/stock-markets", destination: "/markets" },
  { source: "/live-results", destination: "/performance" },
  { source: "/about-us", destination: "/about" },
] as const;

export function publicAliasRedirect(pathname: string): string | null {
  const path = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  const hit = PUBLIC_ROUTE_ALIASES.find((row) => row.source === path);
  return hit?.destination ?? null;
}
