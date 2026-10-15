/**
 * Legacy marketing paths. Old URLs land on the public pages that already exist.
 * /about-us opens About. /live-results opens the July paper-book page.
 */
export const PUBLIC_ROUTE_ALIASES = [
  { source: "/stock-markets", destination: "/markets" },
  { source: "/live-results", destination: "/performance" },
  { source: "/about-us", destination: "/about" },
  { source: "/dividends", destination: "/tax/dividends" },
] as const;

export function publicAliasRedirect(pathname: string): string | null {
  const path = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  const hit = PUBLIC_ROUTE_ALIASES.find((row) => row.source === path);
  return hit?.destination ?? null;
}

/**
 * H-15: permanent (301) moves. /returns used to be the member return
 * calculator (now /my-returns); the public word "returns" means refunds.
 */
export const PERMANENT_REDIRECTS = [
  { source: "/returns", destination: "/refunds" },
  // H-3: CoinGecko slugs that no longer carry a price. MATIC migrated to POL;
  // the two wrapped/staked tokens point at the asset they track.
  { source: "/markets/crypto/matic-network", destination: "/markets/crypto/polygon-ecosystem-token" },
  { source: "/markets/crypto/lido-staked-ether", destination: "/markets/crypto/staked-ether" },
  { source: "/markets/crypto/coinbase-wrapped-btc", destination: "/markets/crypto/bitcoin" },
] as const;

export function permanentRedirect(pathname: string): string | null {
  const path = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  return PERMANENT_REDIRECTS.find((row) => row.source === path)?.destination ?? null;
}
