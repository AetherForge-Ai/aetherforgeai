/**
 * Crypto market domain model + formatting + ranking.
 *
 * PURE module — safe to import from both client and server (no server-only,
 * no fetch). CoinGecko network access lives in `src/lib/crypto-coingecko.ts`
 * (server-only) and is exposed to the client through /api/crypto/* routes.
 *
 * Everything here is shared by the Crypto Market modal, the Coin Detail modal
 * and the Projected Performers section so numbers/labels stay identical across
 * the whole surface.
 */

/* -------------------------------- Types --------------------------------- */

/** One row from CoinGecko /coins/markets (top-500 scan). */
export interface CoinMarket {
  id: string;
  symbol: string; // upper-case, e.g. "BTC"
  name: string;
  image: string;
  rank: number; // market_cap_rank
  price: number; // USD
  marketCap: number;
  fdv: number | null; // fully diluted valuation
  volume24h: number;
  change1h: number | null; // %
  change24h: number; // %
  change7d: number; // %
  high24h: number | null;
  low24h: number | null;
  circulatingSupply: number | null;
  totalSupply: number | null;
  maxSupply: number | null;
  ath: number | null;
  athDate: string | null;
  atl: number | null;
  atlDate: string | null;
  /** ~7-day hourly price series for the inline sparkline. */
  sparkline7d: number[];
}

/** Rich single-coin payload from CoinGecko /coins/{id}. */
export interface CoinDetail {
  id: string;
  symbol: string;
  name: string;
  image: string;
  rank: number | null;
  price: number;
  marketCap: number | null;
  fdv: number | null;
  volume24h: number | null;
  high24h: number | null;
  low24h: number | null;
  change1h: number | null;
  change24h: number | null;
  change7d: number | null;
  change30d: number | null;
  change1y: number | null;
  circulatingSupply: number | null;
  totalSupply: number | null;
  maxSupply: number | null;
  ath: number | null;
  athDate: string | null;
  athChangePct: number | null;
  atl: number | null;
  atlDate: string | null;
  atlChangePct: number | null;
  description: string; // plain text (HTML stripped)
  categories: string[];
  homepage: string | null;
  explorer: string | null;
  twitter: string | null;
  reddit: string | null;
  github: string | null;
}

export interface ChartPoint {
  t: number; // epoch ms
  price: number;
}

export interface CoinChart {
  prices: ChartPoint[];
  volumes: ChartPoint[];
}

/** Selectable ranges in the Coin Detail chart. */
export type ChartRange = "1H" | "24H" | "7D" | "30D" | "90D" | "1Y" | "ALL";

/** Map a UI range to the CoinGecko market_chart `days` param. */
export const RANGE_TO_DAYS: Record<ChartRange, string> = {
  "1H": "1", // fetch 1 day @ 5-min then slice the last hour client-side
  "24H": "1",
  "7D": "7",
  "30D": "30",
  "90D": "90",
  "1Y": "365",
  ALL: "max",
};

export const CHART_RANGES: ChartRange[] = ["1H", "24H", "7D", "30D", "90D", "1Y", "ALL"];

/* ------------------------------ Formatting ------------------------------ */

/**
 * Professional price formatting with sensible, price-scaled decimals:
 *  ≥ $1,000 → 2dp w/ grouping · ≥ $1 → 2dp · < $1 → up to 6 significant digits
 *  · sub-cent micro-caps → up to 8 decimals so nothing renders as "$0.00".
 */
export function fmtPrice(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "—";
  const abs = Math.abs(n);
  let maximumFractionDigits: number;
  if (abs >= 1000) maximumFractionDigits = 2;
  else if (abs >= 1) maximumFractionDigits = 2;
  else if (abs >= 0.01) maximumFractionDigits = 4;
  else if (abs >= 0.0001) maximumFractionDigits = 6;
  else maximumFractionDigits = 8;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits,
  }).format(n);
}

/** Compact USD notation for market caps / volumes → $1.23B, $45.6M, $12.3K. */
export function fmtCompactUsd(n: number | null | undefined): string {
  if (n == null || !isFinite(n) || n === 0) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(n);
}

/** Compact plain number (supply counts) → 19.8M, 1.2B. */
export function fmtCompactNum(n: number | null | undefined): string {
  if (n == null || !isFinite(n) || n === 0) return "—";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n);
}

/** Signed, coloured-elsewhere percentage → "+3.21%", "-0.90%". */
export function fmtPct(n: number | null | undefined, decimals = 2): string {
  if (n == null || !isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(decimals)}%`;
}

/** Tailwind colour class for a delta (green up / red down / muted flat). */
export function pctColor(n: number | null | undefined): string {
  if (n == null || !isFinite(n) || n === 0) return "text-muted-foreground";
  return n > 0 ? "text-emerald-400" : "text-rose-400";
}

/**
 * Percent change from the first to the last positive print in a 7-day series.
 * Returns 0 when the series is genuinely flat. Returns null when there is no series.
 */
export function sevenDayReturnPct(series: Array<number | null | undefined> | null | undefined): number | null {
  if (!series || series.length < 2) return null;
  const closes = series.filter((n): n is number => typeof n === "number" && isFinite(n) && n > 0);
  if (closes.length < 2) return null;
  const first = closes[0];
  const last = closes[closes.length - 1];
  if (!(first > 0)) return null;
  const pct = ((last - first) / first) * 100;
  return isFinite(pct) ? pct : null;
}

/**
 * Live 7-day change for a market row.
 * A sparkline is the source of truth. An explicit 0 with no sparkline is the
 * placeholder feeds emit when the 7-day window was never fetched — not a flat market.
 */
export function resolveSevenDayChange(
  explicit: number | null | undefined,
  sparkline?: Array<number | null | undefined> | null
): number | null {
  const fromSeries = sevenDayReturnPct(sparkline);
  if (fromSeries != null) return fromSeries;
  if (typeof explicit === "number" && isFinite(explicit) && explicit !== 0) return explicit;
  return null;
}

export function sevenDayBoardIsMissing<T extends { change7d: number; sparkline7d?: number[] | null }>(
  coins: T[]
): boolean {
  if (coins.length < 5) return false;
  const missing = coins.filter((c) => resolveSevenDayChange(c.change7d, c.sparkline7d) == null).length;
  return missing / coins.length >= 0.4;
}

/** Fill missing 7-day changes from a second feed (same symbol), preferring sparkline math. */
export function mergeSevenDayChanges<T extends { symbol: string; change7d: number; sparkline7d: number[] }>(
  coins: T[],
  fallback: Array<{ symbol: string; change7d: number; sparkline7d?: number[] | null }>
): T[] {
  const bySymbol = new Map(fallback.map((c) => [c.symbol.toUpperCase(), c]));
  return coins.map((coin) => {
    const own = resolveSevenDayChange(coin.change7d, coin.sparkline7d);
    if (own != null) return { ...coin, change7d: own };
    const alt = bySymbol.get(coin.symbol.toUpperCase());
    if (!alt) return coin;
    const altPct = resolveSevenDayChange(alt.change7d, alt.sparkline7d);
    if (altPct == null) return coin;
    const sparkline =
      coin.sparkline7d && coin.sparkline7d.length >= 2
        ? coin.sparkline7d
        : (alt.sparkline7d ?? []).filter((n): n is number => typeof n === "number" && isFinite(n));
    return { ...coin, change7d: altPct, sparkline7d: sparkline };
  });
}

/**
 * Coin logo URL from a ticker symbol.
 *
 * Swyftx's market endpoints don't return logos, so we resolve them from a
 * reliable symbol-keyed public icon CDN. Components add an onError fallback to a
 * generic coin glyph for the handful of tickers the CDN doesn't cover.
 */
export const GENERIC_COIN_ICON =
  "https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons@0.18.1/svg/color/generic.svg";

export function coinLogo(symbol: string | null | undefined): string {
  const s = (symbol || "").toLowerCase().trim();
  if (!s) return GENERIC_COIN_ICON;
  return `https://assets.coincap.io/assets/icons/${s}@2x.png`;
}

/** Short date like "12 Mar 2021" from an ISO string. */
export function fmtShortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

/* ------------------------- Projected Performers -------------------------- */
/**
 * RANKING FORMULA (documented + surfaced to the user via an info tooltip).
 *
 * We scan the ENTIRE top-500 universe, then rank by a transparent momentum
 * composite that leans on the most recent move but rewards sustained strength:
 *
 *     momentumScore = 0.70 · change24h + 0.30 · change7d
 *
 * Only coins with a POSITIVE 24h change qualify as "top performers" — we never
 * present a negative number as a top performer. A light liquidity guard
 * (24h volume ≥ $250k) filters out illiquid micro-pumps that would otherwise
 * dominate a naïve %-sort.
 *
 * If the whole market is red (fewer positive names than requested), we fall
 * back to the strongest RELATIVE names (least-negative) and flag it with
 * `marketBroadlyDown` so the UI can label it honestly.
 */
export interface RankedPerformer extends CoinMarket {
  momentumScore: number;
}

const MIN_VOLUME_USD = 250_000;

export function rankPerformers(
  coins: CoinMarket[],
  limit: number
): { performers: RankedPerformer[]; marketBroadlyDown: boolean; scanned: number } {
  const scanned = coins.length;
  const withScore: RankedPerformer[] = coins
    .filter((c) => (c.volume24h ?? 0) >= MIN_VOLUME_USD)
    .map((c) => ({ ...c, momentumScore: 0.7 * c.change24h + 0.3 * c.change7d }));

  const positives = withScore
    .filter((c) => c.change24h > 0)
    .sort((a, b) => b.momentumScore - a.momentumScore);

  if (positives.length >= limit) {
    return { performers: positives.slice(0, limit), marketBroadlyDown: false, scanned };
  }

  // Broad market weakness — surface the strongest relative names, transparently.
  const byScore = [...withScore].sort((a, b) => b.momentumScore - a.momentumScore);
  return {
    performers: byScore.slice(0, limit),
    marketBroadlyDown: positives.length < Math.min(limit, 3),
    scanned,
  };
}

/* --------------------------- Sort & filter model ------------------------- */

export type SortKey = "market_cap" | "change24h" | "change7d" | "volume" | "price";
export type FilterKey = "all" | "gainers" | "losers" | "high_volume";

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "market_cap", label: "Market Cap" },
  { value: "change24h", label: "24h Change %" },
  { value: "change7d", label: "7d Change %" },
  { value: "volume", label: "24h Volume" },
  { value: "price", label: "Price" },
];

export const FILTER_OPTIONS: { value: FilterKey; label: string }[] = [
  { value: "all", label: "All" },
  { value: "gainers", label: "Top Gainers 24h" },
  { value: "losers", label: "Top Losers" },
  { value: "high_volume", label: "High Volume" },
];

/** Apply search + filter + sort to a coin list (pure, memo-friendly). */
export function selectCoins(
  coins: CoinMarket[],
  opts: { search: string; sort: SortKey; filter: FilterKey }
): CoinMarket[] {
  const q = opts.search.trim().toLowerCase();
  let out = coins;

  if (q) {
    out = out.filter(
      (c) => c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q)
    );
  }

  if (opts.filter === "gainers") out = out.filter((c) => c.change24h > 0);
  else if (opts.filter === "losers") out = out.filter((c) => c.change24h < 0);
  else if (opts.filter === "high_volume") {
    const sorted = [...out].sort((a, b) => b.volume24h - a.volume24h);
    out = sorted.slice(0, Math.min(100, sorted.length));
  }

  const sorted = [...out].sort((a, b) => {
    switch (opts.sort) {
      case "change24h":
        return b.change24h - a.change24h;
      case "change7d":
        return b.change7d - a.change7d;
      case "volume":
        return b.volume24h - a.volume24h;
      case "price":
        return b.price - a.price;
      case "market_cap":
      default:
        return a.rank - b.rank; // rank asc == market cap desc
    }
  });

  return sorted;
}
