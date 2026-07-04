/**
 * Market-intelligence engine.
 *
 * Institutional-grade, deterministic technical-analysis layer for AetherForge AI.
 * Ships a curated NZX / ASX / US universe and, for each security, synthesises a
 * realistic multi-month daily price series from a seeded RNG. From that series it
 * derives genuine technical indicators (SMA, RSI, MACD, Bollinger Bands), 1D/7D/30D
 * performance, a 7-day forward projection (linear regression + mean-reversion) and
 * an explicit BUY / SELL / HOLD signal with plain-English reasoning.
 *
 * Pure module — no external API keys, safe to import on client AND server. The
 * seeded RNG keeps output stable across renders so charts never jump.
 */

export type MarketCode = "NZX" | "ASX" | "US";

export interface UniverseEntry {
  ticker: string;
  name: string;
  sector: string;
  market: MarketCode;
  basePrice: number;
}

export interface SeriesPoint {
  label: string; // day label e.g. "D-29" or "May 12"
  price: number;
  projected?: boolean;
}

export interface SecurityIntel {
  ticker: string;
  name: string;
  sector: string;
  market: MarketCode;
  currency: "NZD" | "AUD" | "USD";
  price: number;
  change1d: number; // %
  change7d: number; // %
  change30d: number; // %
  history: SeriesPoint[]; // last 30 sessions
  projection: SeriesPoint[]; // next 7 sessions (continues from last history point)
  projected7dPct: number; // % move projected over the next 7 days
  confidence: number; // 0-100 confidence in the projection
  rsi: number; // 0-100
  macd: number;
  macdSignalLine: number;
  macdHistogram: number;
  macdSignal: "Bullish" | "Bearish" | "Neutral";
  bbPosition: number; // 0-100 position within the Bollinger band
  sma20: number;
  vsSma20: number; // % price is above/below its 20-day SMA
  signal: "Strong Buy" | "Buy" | "Hold" | "Reduce" | "Sell";
  score: number; // 0-100 conviction score
  reasoning: string;
}

/* ------------------------------ Universe -------------------------------- */

export const MARKET_UNIVERSE: UniverseEntry[] = [
  // NZX (NZD)
  { ticker: "AIR.NZ", name: "Air New Zealand", sector: "Industrials", market: "NZX", basePrice: 0.68 },
  { ticker: "FPH.NZ", name: "Fisher & Paykel Healthcare", sector: "Healthcare", market: "NZX", basePrice: 36.8 },
  { ticker: "MEL.NZ", name: "Meridian Energy", sector: "Utilities", market: "NZX", basePrice: 6.15 },
  { ticker: "SPK.NZ", name: "Spark New Zealand", sector: "Telecom", market: "NZX", basePrice: 4.2 },
  { ticker: "CEN.NZ", name: "Contact Energy", sector: "Utilities", market: "NZX", basePrice: 9.34 },
  { ticker: "MCY.NZ", name: "Mercury NZ", sector: "Utilities", market: "NZX", basePrice: 6.02 },
  { ticker: "AIA.NZ", name: "Auckland Airport", sector: "Industrials", market: "NZX", basePrice: 7.58 },
  { ticker: "EBO.NZ", name: "Ebos Group", sector: "Healthcare", market: "NZX", basePrice: 37.15 },
  { ticker: "MFT.NZ", name: "Mainfreight", sector: "Logistics", market: "NZX", basePrice: 68.4 },
  { ticker: "IFT.NZ", name: "Infratil", sector: "Infrastructure", market: "NZX", basePrice: 10.86 },
  { ticker: "ATM.NZ", name: "The a2 Milk Company", sector: "Consumer Staples", market: "NZX", basePrice: 5.62 },
  { ticker: "FBU.NZ", name: "Fletcher Building", sector: "Materials", market: "NZX", basePrice: 2.94 },
  // ASX (AUD)
  { ticker: "BHP.AX", name: "BHP Group", sector: "Materials", market: "ASX", basePrice: 40.12 },
  { ticker: "CBA.AX", name: "Commonwealth Bank", sector: "Financials", market: "ASX", basePrice: 158.7 },
  { ticker: "CSL.AX", name: "CSL Limited", sector: "Healthcare", market: "ASX", basePrice: 236.5 },
  { ticker: "NAB.AX", name: "National Australia Bank", sector: "Financials", market: "ASX", basePrice: 38.9 },
  { ticker: "WBC.AX", name: "Westpac Banking", sector: "Financials", market: "ASX", basePrice: 33.44 },
  { ticker: "WES.AX", name: "Wesfarmers", sector: "Consumer Discretionary", market: "ASX", basePrice: 75.2 },
  { ticker: "MQG.AX", name: "Macquarie Group", sector: "Financials", market: "ASX", basePrice: 224.6 },
  { ticker: "WOW.AX", name: "Woolworths Group", sector: "Consumer Staples", market: "ASX", basePrice: 30.15 },
  { ticker: "FMG.AX", name: "Fortescue", sector: "Materials", market: "ASX", basePrice: 19.06 },
  { ticker: "TLS.AX", name: "Telstra Group", sector: "Telecom", market: "ASX", basePrice: 4.05 },
  { ticker: "WDS.AX", name: "Woodside Energy", sector: "Energy", market: "ASX", basePrice: 24.3 },
  { ticker: "GMG.AX", name: "Goodman Group", sector: "Real Estate", market: "ASX", basePrice: 37.9 },
  // US (USD)
  { ticker: "AAPL", name: "Apple Inc.", sector: "Technology", market: "US", basePrice: 229.87 },
  { ticker: "MSFT", name: "Microsoft Corporation", sector: "Technology", market: "US", basePrice: 441.58 },
  { ticker: "NVDA", name: "NVIDIA Corporation", sector: "Semiconductors", market: "US", basePrice: 131.26 },
  { ticker: "GOOGL", name: "Alphabet Inc.", sector: "Communication Services", market: "US", basePrice: 178.35 },
  { ticker: "AMZN", name: "Amazon.com, Inc.", sector: "Consumer Discretionary", market: "US", basePrice: 201.44 },
  { ticker: "META", name: "Meta Platforms, Inc.", sector: "Communication Services", market: "US", basePrice: 594.12 },
  { ticker: "TSLA", name: "Tesla, Inc.", sector: "Automotive", market: "US", basePrice: 342.68 },
  { ticker: "AVGO", name: "Broadcom Inc.", sector: "Semiconductors", market: "US", basePrice: 176.9 },
  { ticker: "JPM", name: "JPMorgan Chase & Co.", sector: "Financials", market: "US", basePrice: 243.75 },
  { ticker: "LLY", name: "Eli Lilly and Company", sector: "Healthcare", market: "US", basePrice: 782.5 },
  { ticker: "AMD", name: "Advanced Micro Devices", sector: "Semiconductors", market: "US", basePrice: 122.18 },
  { ticker: "PLTR", name: "Palantir Technologies", sector: "Technology", market: "US", basePrice: 66.5 },
];

const UNIVERSE_MAP: Record<string, UniverseEntry> = MARKET_UNIVERSE.reduce(
  (acc, e) => {
    acc[e.ticker] = e;
    return acc;
  },
  {} as Record<string, UniverseEntry>
);

export function currencyForMarket(market: MarketCode): "NZD" | "AUD" | "USD" {
  return market === "NZX" ? "NZD" : market === "ASX" ? "AUD" : "USD";
}

/* --------------------------------- RNG ---------------------------------- */

function hashSeed(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A single monthly-stable salt keeps the whole app's "market state" coherent
// per calendar month without depending on Math.random / Date at import time.
const MARKET_EPOCH = "aetherforge-2026-07";

function round(v: number, dp = 2): number {
  const f = Math.pow(10, dp);
  return Math.round(v * f) / f;
}

/* ------------------------- Price-series synthesis ----------------------- */

/**
 * Deterministic daily close series of `days` sessions, ending exactly at
 * `basePrice`. Uses a mild drift + volatility random walk seeded per ticker.
 */
function dailySeries(ticker: string, basePrice: number, days = 140): number[] {
  const rnd = mulberry32(hashSeed(MARKET_EPOCH + "|" + ticker));
  const drift = (rnd() - 0.45) * 0.6; // total trend over the window
  const vol = 0.012 + rnd() * 0.02; // daily volatility 1.2%–3.2%
  const start = basePrice / (1 + drift);
  const out: number[] = [];
  let price = start;
  for (let i = 0; i < days; i++) {
    const step = drift / (days - 1) + (rnd() - 0.5) * vol * 2;
    price = Math.max(0.01, price * (1 + step));
    out.push(price);
  }
  out[out.length - 1] = basePrice; // pin the latest close to the quoted price
  return out;
}

/* --------------------------- Technical indicators ----------------------- */

function sma(series: number[], period: number): number {
  if (series.length < period) return average(series);
  const slice = series.slice(-period);
  return average(slice);
}

function average(xs: number[]): number {
  if (!xs.length) return 0;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = average(xs);
  return Math.sqrt(average(xs.map((x) => (x - m) ** 2)));
}

function ema(series: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = series[0];
  series.forEach((v, i) => {
    prev = i === 0 ? v : v * k + prev * (1 - k);
    out.push(prev);
  });
  return out;
}

function computeRSI(series: number[], period = 14): number {
  if (series.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = series.length - period; i < series.length; i++) {
    const diff = series[i] - series[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return round(100 - 100 / (1 + rs), 1);
}

function computeMACD(series: number[]): { macd: number; signal: number; histogram: number } {
  const emaFast = ema(series, 12);
  const emaSlow = ema(series, 26);
  const macdLine = emaFast.map((v, i) => v - emaSlow[i]);
  const signalLine = ema(macdLine, 9);
  const macd = macdLine[macdLine.length - 1];
  const signal = signalLine[signalLine.length - 1];
  return { macd: round(macd, 3), signal: round(signal, 3), histogram: round(macd - signal, 3) };
}

function computeBollinger(series: number[], period = 20, mult = 2) {
  const slice = series.slice(-period);
  const mid = average(slice);
  const sd = stddev(slice);
  const upper = mid + mult * sd;
  const lower = mid - mult * sd;
  const price = series[series.length - 1];
  const position = upper > lower ? clamp(((price - lower) / (upper - lower)) * 100, 0, 100) : 50;
  return { upper, lower, mid, position: round(position, 1) };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/* ------------------------------ Projection ------------------------------ */

/**
 * 7-day forward projection: linear regression on the last 20 sessions blended
 * with an RSI-driven mean-reversion nudge. Returns the projected path and a
 * confidence score derived from how cleanly the recent trend fits a line.
 */
function projectForward(series: number[], rsi: number): { path: number[]; pct: number; confidence: number } {
  const window = series.slice(-20);
  const n = window.length;
  const xs = window.map((_, i) => i);
  const meanX = average(xs);
  const meanY = average(window);
  let num = 0;
  let den = 0;
  xs.forEach((x, i) => {
    num += (x - meanX) * (window[i] - meanY);
    den += (x - meanX) ** 2;
  });
  const slope = den === 0 ? 0 : num / den;

  // R² as a confidence proxy for the linear fit.
  let ssRes = 0;
  let ssTot = 0;
  xs.forEach((x, i) => {
    const pred = meanY + slope * (x - meanX);
    ssRes += (window[i] - pred) ** 2;
    ssTot += (window[i] - meanY) ** 2;
  });
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

  // Mean-reversion: overbought (RSI>70) drags the slope down, oversold lifts it.
  const reversion = (50 - rsi) / 50; // +ve when oversold
  const last = series[series.length - 1];
  const adjSlope = slope * 0.8 + last * 0.004 * reversion;

  const path: number[] = [];
  let p = last;
  for (let d = 1; d <= 7; d++) {
    p = Math.max(0.01, p + adjSlope);
    path.push(round(p, last < 5 ? 4 : 2));
  }
  const pct = round(((path[path.length - 1] - last) / last) * 100, 2);
  const confidence = Math.round(clamp(45 + r2 * 45 + (10 - Math.abs(pct)) * 0.5, 40, 96));
  return { path, pct, confidence };
}

/* ------------------------------ Signal logic ---------------------------- */

function deriveSignal(input: {
  rsi: number;
  macdHistogram: number;
  vsSma20: number;
  projected7dPct: number;
  bbPosition: number;
}): { signal: SecurityIntel["signal"]; score: number; reasoning: string } {
  const { rsi, macdHistogram, vsSma20, projected7dPct, bbPosition } = input;
  let score = 50;
  const notes: string[] = [];

  // Momentum (MACD)
  if (macdHistogram > 0) {
    score += 10;
    notes.push("MACD histogram is positive (bullish momentum)");
  } else {
    score -= 10;
    notes.push("MACD histogram is negative (fading momentum)");
  }

  // Trend vs SMA20
  if (vsSma20 > 2) {
    score += 8;
    notes.push(`trading ${round(vsSma20, 1)}% above its 20-day average`);
  } else if (vsSma20 < -2) {
    score -= 8;
    notes.push(`trading ${round(Math.abs(vsSma20), 1)}% below its 20-day average`);
  }

  // RSI extremes
  if (rsi >= 70) {
    score -= 12;
    notes.push(`RSI ${round(rsi, 0)} is overbought — pullback risk`);
  } else if (rsi <= 30) {
    score += 12;
    notes.push(`RSI ${round(rsi, 0)} is oversold — mean-reversion setup`);
  } else {
    notes.push(`RSI ${round(rsi, 0)} is neutral`);
  }

  // Bollinger position
  if (bbPosition >= 92) {
    score -= 6;
    notes.push("price is pinned to the upper Bollinger band");
  } else if (bbPosition <= 8) {
    score += 6;
    notes.push("price is pressing the lower Bollinger band");
  }

  // Forward projection (largest weight)
  score += clamp(projected7dPct * 3, -22, 22);
  if (projected7dPct > 1.5) notes.push(`7-day model projects +${projected7dPct}%`);
  else if (projected7dPct < -1.5) notes.push(`7-day model projects ${projected7dPct}%`);
  else notes.push("7-day model projects a broadly flat tape");

  score = Math.round(clamp(score, 2, 98));

  let signal: SecurityIntel["signal"];
  if (score >= 72) signal = "Strong Buy";
  else if (score >= 58) signal = "Buy";
  else if (score >= 42) signal = "Hold";
  else if (score >= 28) signal = "Reduce";
  else signal = "Sell";

  const reasoning = `${signal} · ${notes.join("; ")}.`;
  return { signal, score, reasoning };
}

/* --------------------------- Per-security intel ------------------------- */

const CACHE = new Map<string, SecurityIntel>();

/** Full technical intelligence for one ticker. Overridable current price. */
export function analyzeSecurity(ticker: string, priceOverride?: number, nameOverride?: string): SecurityIntel {
  const key = `${ticker}|${priceOverride ?? ""}`;
  const cached = CACHE.get(key);
  if (cached) return cached;

  const entry = UNIVERSE_MAP[ticker];
  const base = priceOverride ?? entry?.basePrice ?? 100;
  const market: MarketCode = entry?.market ?? (ticker.endsWith(".NZ") ? "NZX" : ticker.endsWith(".AX") ? "ASX" : "US");
  const name = nameOverride ?? entry?.name ?? ticker;
  const sector = entry?.sector ?? "General";

  const series = dailySeries(ticker, base);
  const last = series[series.length - 1];
  const prev = series[series.length - 2] ?? last;
  const wk = series[series.length - 8] ?? last;
  const mo = series[series.length - 31] ?? series[0];

  const rsi = computeRSI(series);
  const macd = computeMACD(series);
  const boll = computeBollinger(series);
  const sma20 = sma(series, 20);
  const vsSma20 = round(((last - sma20) / sma20) * 100, 2);
  const projection = projectForward(series, rsi);

  const macdSignal: SecurityIntel["macdSignal"] =
    macd.histogram > 0.001 ? "Bullish" : macd.histogram < -0.001 ? "Bearish" : "Neutral";

  const { signal, score, reasoning } = deriveSignal({
    rsi,
    macdHistogram: macd.histogram,
    vsSma20,
    projected7dPct: projection.pct,
    bbPosition: boll.position,
  });

  const dp = last < 5 ? 4 : 2;
  const history: SeriesPoint[] = series.slice(-30).map((p, i) => ({
    label: `D-${29 - i}`,
    price: round(p, dp),
  }));
  const projPath: SeriesPoint[] = projection.path.map((p, i) => ({
    label: `+${i + 1}d`,
    price: p,
    projected: true,
  }));

  const intel: SecurityIntel = {
    ticker,
    name,
    sector,
    market,
    currency: currencyForMarket(market),
    price: round(last, dp),
    change1d: round(((last - prev) / prev) * 100, 2),
    change7d: round(((last - wk) / wk) * 100, 2),
    change30d: round(((last - mo) / mo) * 100, 2),
    history,
    projection: projPath,
    projected7dPct: projection.pct,
    confidence: projection.confidence,
    rsi,
    macd: macd.macd,
    macdSignalLine: macd.signal,
    macdHistogram: macd.histogram,
    macdSignal,
    bbPosition: boll.position,
    sma20: round(sma20, dp),
    vsSma20,
    signal,
    score,
    reasoning,
  };
  CACHE.set(key, intel);
  return intel;
}

/* ------------------------------ Aggregations ---------------------------- */

let ALL_INTEL: SecurityIntel[] | null = null;
function allIntel(): SecurityIntel[] {
  if (!ALL_INTEL) ALL_INTEL = MARKET_UNIVERSE.map((e) => analyzeSecurity(e.ticker));
  return ALL_INTEL;
}

/** Snapshot grouped by market, each sorted by 1-day change (desc). */
export function getMarketSnapshot(): Record<MarketCode, SecurityIntel[]> {
  const all = allIntel();
  const group = (m: MarketCode) => all.filter((s) => s.market === m).sort((a, b) => b.change1d - a.change1d);
  return { NZX: group("NZX"), ASX: group("ASX"), US: group("US") };
}

export type MoverWindow = "1d" | "7d" | "30d";

export function getTopMovers(window: MoverWindow, count = 6): { gainers: SecurityIntel[]; losers: SecurityIntel[] } {
  const key = window === "1d" ? "change1d" : window === "7d" ? "change7d" : "change30d";
  const sorted = [...allIntel()].sort((a, b) => (b[key] as number) - (a[key] as number));
  return {
    gainers: sorted.slice(0, count),
    losers: sorted.slice(-count).reverse(),
  };
}

/** Highest-conviction 7-day projected movers across the whole universe. */
export function getProjectionLeaders(count = 6): SecurityIntel[] {
  return [...allIntel()]
    .sort((a, b) => b.projected7dPct * (b.confidence / 100) - a.projected7dPct * (a.confidence / 100))
    .slice(0, count);
}

/* --------------------------------- News --------------------------------- */

export interface NewsItem {
  headline: string;
  source: string;
  market: MarketCode | "Global";
  impact: "Bullish" | "Bearish" | "Neutral";
  relevance: number; // 0-100 relevance to NZ/AU investors
  time: string;
}

const NEWS_POOL: NewsItem[] = [
  { headline: "RBNZ holds the OCR at 3.25%; forward guidance turns dovish on cooling inflation", source: "NZ Markets Daily", market: "NZX", impact: "Bullish", relevance: 96, time: "2h ago" },
  { headline: "Fonterra lifts farmgate milk-price forecast, buoying NZX dairy exposure", source: "BusinessDesk", market: "NZX", impact: "Bullish", relevance: 88, time: "4h ago" },
  { headline: "Fisher & Paykel Healthcare guides FY revenue above consensus on hospital demand", source: "NZX Wire", market: "NZX", impact: "Bullish", relevance: 84, time: "5h ago" },
  { headline: "ASX resources rally as iron-ore firms above US$105/t on China stimulus", source: "ASX Wire", market: "ASX", impact: "Bullish", relevance: 82, time: "3h ago" },
  { headline: "Commonwealth Bank flags stable margins but cautious consumer outlook", source: "AFR", market: "ASX", impact: "Neutral", relevance: 78, time: "6h ago" },
  { headline: "Woodside Energy signs long-term LNG supply deal with Asian utility", source: "Reuters", market: "ASX", impact: "Bullish", relevance: 71, time: "7h ago" },
  { headline: "US CPI prints cooler than expected; rate-cut odds for the next FOMC firm up", source: "Bloomberg", market: "US", impact: "Bullish", relevance: 90, time: "1h ago" },
  { headline: "NVIDIA data-centre backlog extends; AI capex cycle shows no sign of peaking", source: "CNBC", market: "US", impact: "Bullish", relevance: 68, time: "8h ago" },
  { headline: "NZD/USD strengthens toward 0.61 as risk sentiment improves globally", source: "FX Observer", market: "Global", impact: "Neutral", relevance: 74, time: "2h ago" },
  { headline: "Global funds rotate into APAC value names as US mega-cap valuations stretch", source: "Morningstar", market: "Global", impact: "Bullish", relevance: 70, time: "9h ago" },
  { headline: "Oil eases on demand concerns, pressuring energy-heavy ASX index weightings", source: "MarketWatch", market: "ASX", impact: "Bearish", relevance: 62, time: "10h ago" },
  { headline: "Auckland Airport passenger volumes recover to 92% of pre-2020 levels", source: "NZ Herald", market: "NZX", impact: "Bullish", relevance: 66, time: "11h ago" },
];

export function getMarketNews(): NewsItem[] {
  return [...NEWS_POOL].sort((a, b) => b.relevance - a.relevance);
}

/** Format a price with its market currency (compact, NZ locale). */
export function formatMarketPrice(price: number, currency: "NZD" | "AUD" | "USD"): string {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: price < 5 ? 4 : 2,
  }).format(price);
}
