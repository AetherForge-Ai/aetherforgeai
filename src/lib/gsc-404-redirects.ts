/**
 * b62 GSC-404: URLs that answered 404 on the live site on 23 Oct 2026 and that
 * Google or our own older pages pointed at. Each is one 308 (permanent) hop.
 * /own-the-bots was removed (the page now lives at /buy-the-bots). The rest are
 * the usual well-known guesses for files that exist under another path.
 * pull-check:v3-goal-b62-2026-10-23
 */
export const GSC_404_REDIRECTS = [
  { source: "/own-the-bots", destination: "/buy-the-bots" },
  { source: "/own-the-bots/:path*", destination: "/buy-the-bots" },
  { source: "/security.txt", destination: "/.well-known/security.txt" },
  { source: "/manifest.webmanifest", destination: "/site.webmanifest" },
  { source: "/manifest.json", destination: "/site.webmanifest" },
] as const;

/** Middleware copy of the table above (exact paths, plus anything under /own-the-bots/). */
export function gsc404Redirect(pathname: string): string | null {
  const path = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  if (path === "/own-the-bots" || path.startsWith("/own-the-bots/")) return "/buy-the-bots";
  const hit = GSC_404_REDIRECTS.find((row) => !row.source.includes(":") && row.source === path);
  return hit?.destination ?? null;
}
