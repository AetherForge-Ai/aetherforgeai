export const NZ_TAX_PREVIEW_PATH = "/tax/what-if-sell";

/** Hidden when the flag is off. The destination page 404s in that case as well. */
export function WhatIfSellLink({
  enabled,
  ticker,
  year,
  className,
}: {
  enabled: boolean;
  ticker: string;
  year?: number | null;
  className?: string;
}) {
  if (!enabled || !ticker.trim()) return null;
  const query = new URLSearchParams({ ticker: ticker.trim().toUpperCase() });
  if (year) query.set("year", String(year));
  return (
    <a
      href={`${NZ_TAX_PREVIEW_PATH}?${query.toString()}`}
      data-af-nz-tax-preview-link
      className={className ?? "text-sm font-semibold text-primary underline-offset-4 hover:underline"}
      aria-label={`What if I sell ${ticker.trim().toUpperCase()}?`}
    >
      What if I sell?
    </a>
  );
}
