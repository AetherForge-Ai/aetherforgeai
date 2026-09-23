/**
 * Precious-metals mark-to-market — pure, client-safe.
 *
 * Bullion (GOLD / SILVER) is held in troy ounces and must be marked at the
 * NZD spot per troy ounce. The Yahoo symbol GOLD is the equity Gold.com, Inc.
 * (about US$44.65), not gold spot (thousands of NZD per ounce). Using that
 * equity quote as `current_price` values 0.065 oz at ~NZ$2.90 and drops
 * metals out of allocation and net worth.
 */

export type MetalKey = "gold" | "silver";

export type QuoteRoute = "equity" | "crypto" | "bullion";

const BULLION_TICKERS = new Set(["GOLD", "SILVER"]);

export function metalKeyForTicker(ticker: string | null | undefined): MetalKey | null {
  const t = (ticker || "").trim().toUpperCase();
  if (t === "GOLD") return "gold";
  if (t === "SILVER") return "silver";
  return null;
}

/**
 * GOLD and SILVER are reserved for troy-ounce bullion in this product
 * (see feed mapping). An explicit `metal` asset type is bullion even if the
 * ticker is unusual.
 */
export function isBullionHolding(
  assetType?: string | null,
  ticker?: string | null
): boolean {
  if ((assetType || "").trim().toLowerCase() === "metal") return true;
  const t = (ticker || "").trim().toUpperCase();
  return BULLION_TICKERS.has(t);
}

export function quoteRouteForHolding(
  assetType?: string | null,
  ticker?: string | null
): QuoteRoute {
  if (isBullionHolding(assetType, ticker)) return "bullion";
  if ((assetType || "stock").trim().toLowerCase() === "crypto") return "crypto";
  return "equity";
}

/** Tickers that may be sent to an equity quote feed. Bullion is never included. */
export function equityTickersForQuotes(
  holdings: Array<{ ticker?: string | null; asset_type?: string | null }>
): string[] {
  const out: string[] = [];
  for (const h of holdings) {
    if (quoteRouteForHolding(h.asset_type, h.ticker) !== "equity") continue;
    const t = String(h.ticker || "").trim();
    if (t) out.push(t);
  }
  return out;
}

export function bullionDisplayName(ticker: string | null | undefined): string {
  return metalKeyForTicker(ticker) === "silver" ? "Silver bullion" : "Gold bullion";
}

/** True when a stored name is the equity identity Yahoo returns for GOLD. */
export function bullionNameContaminated(
  assetType: string | null | undefined,
  ticker: string | null | undefined,
  companyName: string | null | undefined
): boolean {
  if (!isBullionHolding(assetType, ticker)) return false;
  const name = String(companyName || "").trim().toLowerCase();
  if (!name) return false;
  return name.includes("gold.com") || name.includes("silver.com");
}

export interface MetalSpotPerOz {
  gold?: { nzdPerOz?: number | null } | null;
  silver?: { nzdPerOz?: number | null } | null;
}

/** NZD per troy ounce for a bullion ticker, or 0 when spot is missing. */
export function bullionNzdPerOz(
  ticker: string | null | undefined,
  spot: MetalSpotPerOz | null | undefined
): number {
  const key = metalKeyForTicker(ticker);
  if (!key || !spot) return 0;
  const px = Number(spot[key]?.nzdPerOz);
  return Number.isFinite(px) && px > 0 ? px : 0;
}

/** Ounces × NZD per troy ounce. Never pass an equity share price here. */
export function markToMarketBullionNZD(ounces: number, nzdPerTroyOz: number): number {
  const oz = Number(ounces);
  const px = Number(nzdPerTroyOz);
  if (!(oz > 0) || !(px > 0) || !Number.isFinite(oz) || !Number.isFinite(px)) return 0;
  return oz * px;
}

export interface ResolveMarkInput {
  ticker: string;
  assetType?: string | null;
  storedPrice?: number | null;
  purchasePrice?: number | null;
  /** Equity-feed price (Yahoo / Twelve Data). Ignored for bullion. */
  equityQuote?: number | null;
  cryptoQuote?: number | null;
  /** NZD per troy ounce for this holding's metal. */
  metalNzdPerOz?: number | null;
}

/**
 * Price to persist as `current_price`.
 * Bullion always prefers NZD spot per troy ounce and never the equity quote.
 * Equities/crypto return null when no live quote exists so the caller can
 * keep its existing fallback (stored price or simulated tick).
 */
export function resolveHoldingMarkPrice(input: ResolveMarkInput): number | null {
  const route = quoteRouteForHolding(input.assetType, input.ticker);
  if (route === "bullion") {
    const spot = Number(input.metalNzdPerOz);
    if (Number.isFinite(spot) && spot > 0) return spot;
    const stored = Number(input.storedPrice);
    if (Number.isFinite(stored) && stored > 0) return stored;
    const paid = Number(input.purchasePrice);
    if (Number.isFinite(paid) && paid > 0) return paid;
    return null;
  }
  if (route === "crypto") {
    const q = Number(input.cryptoQuote);
    return Number.isFinite(q) && q > 0 ? q : null;
  }
  const q = Number(input.equityQuote);
  return Number.isFinite(q) && q > 0 ? q : null;
}

/** Class weight in percent. Sub-ounce equity misquotes round toward 0% of a real book. */
export function classWeightPct(valueNZD: number, totalNZD: number): number {
  const value = Number(valueNZD);
  const total = Number(totalNZD);
  if (!(value > 0) || !(total > 0) || !Number.isFinite(value) || !Number.isFinite(total)) return 0;
  return (value / total) * 100;
}

export function netWorthNZD(parts: {
  cashNZD?: number;
  equityNZD?: number;
  cryptoNZD?: number;
  metalsNZD?: number;
}): number {
  const nums = [parts.cashNZD, parts.equityNZD, parts.cryptoNZD, parts.metalsNZD].map((n) => {
    const v = Number(n);
    return Number.isFinite(v) ? v : 0;
  });
  return nums.reduce((s, n) => s + n, 0);
}
