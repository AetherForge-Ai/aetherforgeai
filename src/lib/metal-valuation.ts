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
  if (t === "GOLD" || t === "XAU" || t === "XAUUSD") return "gold";
  if (t === "SILVER" || t === "XAG" || t === "XAGUSD") return "silver";
  return null;
}

export function inferMetalKey(input: {
  ticker?: string | null;
  assetType?: string | null;
  companyName?: string | null;
  sector?: string | null;
}): MetalKey | null {
  const fromTicker = metalKeyForTicker(input.ticker);
  if (fromTicker) return fromTicker;
  // Name/sector text is only a hint for explicit metal lots. A miner such as
  // "Newmont Gold" stays an equity so its share price is never replaced by spot.
  if ((input.assetType || "").trim().toLowerCase() !== "metal") return null;
  const blob = `${input.companyName || ""} ${input.sector || ""}`.toLowerCase();
  if (blob.includes("silver")) return "silver";
  return "gold";
}

/**
 * GOLD and SILVER are reserved for troy-ounce bullion in this product
 * (see feed mapping). An explicit `metal` asset type is bullion even if the
 * ticker is unusual.
 */
export function isBullionHolding(
  assetType?: string | null,
  ticker?: string | null,
  companyName?: string | null
): boolean {
  return (
    inferMetalKey({ ticker, assetType, companyName }) != null ||
    (assetType || "").trim().toLowerCase() === "metal" ||
    BULLION_TICKERS.has((ticker || "").trim().toUpperCase())
  );
}

/**
 * Equity sleeve used by stock KPIs and the stock holdings table.
 * Bullion (GOLD / SILVER / asset_type metal) belongs on the metals hub only,
 * even when the lot is stored in the stock table.
 */
export function isListedStockHolding(
  assetType?: string | null,
  ticker?: string | null,
  companyName?: string | null
): boolean {
  const kind = (assetType || "stock").trim().toLowerCase();
  if (kind !== "stock") return false;
  return !isBullionHolding(assetType, ticker, companyName);
}

/**
 * Yahoo GOLD (~US$44) stored as current_price against a per-ounce cost in the
 * thousands. That print must never be the market value.
 */
export function isContaminatedEquityPrint(storedPrice: number, purchasePerOz: number): boolean {
  const stored = Number(storedPrice);
  const paid = Number(purchasePerOz);
  if (!(stored > 0) || !(paid > 0)) return false;
  return paid >= 500 && stored <= paid / 20;
}

export function quoteRouteForHolding(
  assetType?: string | null,
  ticker?: string | null,
  companyName?: string | null
): QuoteRoute {
  if (isBullionHolding(assetType, ticker, companyName)) return "bullion";
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

export interface BullionHoldingLike {
  ticker?: string | null;
  asset_type?: string | null;
  company_name?: string | null;
  sector?: string | null;
  shares?: number | null;
  current_price?: number | null;
  purchase_price?: number | null;
}

/**
 * NZD per troy ounce to store and display for a bullion lot.
 * Live spot wins. A persisted equity print (US$44.65) is never returned when
 * the cost basis is a per-ounce NZD price.
 */
export function bullionMarkForHolding(
  holding: BullionHoldingLike,
  spot: MetalSpotPerOz | null | undefined
): number {
  const key = inferMetalKey({
    ticker: holding.ticker,
    assetType: holding.asset_type,
    companyName: holding.company_name,
    sector: holding.sector,
  });
  const spotPx = key ? bullionNzdPerOz(key === "silver" ? "SILVER" : "GOLD", spot) : 0;
  if (spotPx > 0) return spotPx;
  const purchase = Number(holding.purchase_price) || 0;
  const stored = Number(holding.current_price) || 0;
  if (purchase > 0 && isContaminatedEquityPrint(stored, purchase)) return purchase;
  if (stored > 0) return stored;
  return purchase > 0 ? purchase : 0;
}

/** Replace bullion current_price with NZD/oz. Equity and crypto rows are copied through. */
export function markBookAtBullionSpot<T extends BullionHoldingLike>(
  rows: T[],
  spot: MetalSpotPerOz | null | undefined
): T[] {
  return rows.map((row) => {
    if (!isBullionHolding(row.asset_type, row.ticker, row.company_name)) return row;
    const mark = bullionMarkForHolding(row, spot);
    if (!(mark > 0)) return row;
    if (Math.abs((Number(row.current_price) || 0) - mark) < 1e-9) return row;
    return { ...row, current_price: mark };
  });
}

export interface VisibleBullionLot {
  id: string;
  metal: MetalKey;
  ounces: number;
  purchasePerOz: number;
  /** ounces × NZD spot (or decontaminated per-oz cost when spot is missing). */
  marketValueNZD: number;
  source: "ledger" | "desk";
}

/** Metals hub rows: ledger GOLD/SILVER lots plus the precious_metal desk. */
export function visibleBullionLots(
  ledger: Array<BullionHoldingLike & { _id?: string }>,
  precious: Array<{
    _id: string;
    metal: MetalKey;
    ounces: number;
    purchase_price_per_oz: number;
  }>,
  spot: MetalSpotPerOz | null | undefined
): VisibleBullionLot[] {
  const fromLedger: VisibleBullionLot[] = [];
  for (const row of ledger) {
    if (!isBullionHolding(row.asset_type, row.ticker, row.company_name)) continue;
    const metal =
      inferMetalKey({
        ticker: row.ticker,
        assetType: row.asset_type,
        companyName: row.company_name,
        sector: row.sector,
      }) ?? "gold";
    const ounces = Number(row.shares) || 0;
    const purchasePerOz = Number(row.purchase_price) || 0;
    const mark = bullionMarkForHolding(row, spot);
    fromLedger.push({
      id: `ledger-${row._id || row.ticker || fromLedger.length}`,
      metal,
      ounces,
      purchasePerOz,
      marketValueNZD: markToMarketBullionNZD(ounces, mark),
      source: "ledger",
    });
  }
  const fromDesk: VisibleBullionLot[] = precious.map((row) => {
    const mark = bullionNzdPerOz(row.metal === "silver" ? "SILVER" : "GOLD", spot);
    const purchasePerOz = Number(row.purchase_price_per_oz) || 0;
    const px = mark > 0 ? mark : purchasePerOz;
    return {
      id: `desk-${row._id}`,
      metal: row.metal,
      ounces: Number(row.ounces) || 0,
      purchasePerOz,
      marketValueNZD: markToMarketBullionNZD(row.ounces, px),
      source: "desk" as const,
    };
  });
  return [...fromLedger, ...fromDesk];
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
    const spotPx = Number(input.metalNzdPerOz);
    const spot =
      spotPx > 0
        ? input.ticker.toUpperCase().includes("SILVER") || input.assetType === "silver"
          ? { silver: { nzdPerOz: spotPx } }
          : { gold: { nzdPerOz: spotPx }, silver: { nzdPerOz: spotPx } }
        : null;
    const mark = bullionMarkForHolding(
      {
        ticker: input.ticker,
        asset_type: input.assetType,
        current_price: input.storedPrice,
        purchase_price: input.purchasePrice,
      },
      spot
    );
    return mark > 0 ? mark : null;
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
