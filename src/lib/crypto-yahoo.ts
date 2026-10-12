/**
 * Yahoo Finance crypto fallback — keyless charts + quotes for major coins.
 * Used when CoinGecko is rate-limited or unreachable so the Crypto tab
 * still has mapped major coins.
 */

import "server-only";
import type { CoinMarket, CoinDetail, CoinChart } from "@/lib/crypto-market";
import { snapshotBlockchain } from "@/lib/crypto-board";
import { CANONICAL_CRYPTO_IDS, canonicalCryptoId, normalizeCryptoTicker } from "@/lib/crypto-ids";
import { coinDisplayName } from "@/lib/crypto-names";
import { yahooSymbolFor } from "@/lib/crypto-vendors";
import { coinLogo, sevenDayReturnPct } from "@/lib/crypto-market";

const YAHOO_CHART = "https://query1.finance.yahoo.com/v8/finance/chart";

/** Major-coin list used when the earlier feeds are short. Kept at 100 so the Crypto tab is not a handful of names. */
export const YAHOO_MAJOR: string[] = [
  "BTC", "ETH", "USDT", "BNB", "SOL", "XRP", "USDC", "DOGE", "ADA", "TRX",
  "AVAX", "TON", "SHIB", "DOT", "LINK", "BCH", "SUI", "HBAR", "XLM", "LTC",
  "UNI", "PEPE", "NEAR", "APT", "ICP", "ETC", "ATOM", "VET", "RENDER", "FIL",
  "ARB", "OP", "IMX", "INJ", "STX", "AAVE", "MKR", "GRT", "ALGO", "RUNE",
  "THETA", "EGLD", "FLOW", "XTZ", "AXS", "EOS", "SAND", "MANA", "QNT", "LDO",
  "APE", "COMP", "DYDX", "ENS", "CRV", "CHZ", "MINA", "ZEC", "SNX", "GALA",
  "CAKE", "KAVA", "ZIL", "BAT", "GMX", "LRC", "ENJ", "IOTA", "NEO", "KSM",
  "DASH", "SUSHI", "YFI", "CELO", "ROSE", "ANKR", "SKL", "STORJ", "AUDIO", "MASK",
  "API3", "BAND", "BAL", "1INCH", "LUNC", "FET", "WLD", "TIA", "SEI", "JUP",
  "BONK", "WIF", "FLOKI", "PENDLE", "ONDO", "PYTH", "JTO", "STRK", "BLUR", "ARKM",
];

function yahooSymbol(ticker: string): string {
  return yahooSymbolFor(ticker).symbol;
}

function resolveTicker(idOrTicker: string): string {
  const raw = (idOrTicker || "").trim();
  const code = normalizeCryptoTicker(raw);
  if (CANONICAL_CRYPTO_IDS[code]) return code;
  const id = raw.toLowerCase();
  const matches = Object.entries(CANONICAL_CRYPTO_IDS).filter(([, cg]) => cg === id);
  if (matches.length === 1) return matches[0][0];
  return code;
}

async function yahooChartRaw(symbol: string, range = "1mo", interval = "1d"): Promise<any | null> {
  try {
    const url = `${YAHOO_CHART}/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; AetherForge/1.0)",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(`[crypto-yahoo] chart HTTP ${res.status} for ${symbol}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error(`[crypto-yahoo] chart failed for ${symbol}:`, err);
    return null;
  }
}

export async function fetchYahooCryptoQuote(
  ticker: string
): Promise<{ price: number; changePct: number; change7d: number | null; sparkline7d: number[]; quotedAt: string } | null> {
  const j = await yahooChartRaw(yahooSymbol(ticker), "7d", "1d");
  const r = j?.chart?.result?.[0];
  if (!r) return null;
  const price = Number(r.meta?.regularMarketPrice);
  if (!(price > 0)) return null;
  const closes: number[] = (r.indicators?.quote?.[0]?.close || []).filter(
    (n: unknown): n is number => typeof n === "number" && isFinite(n) && n > 0
  );
  // regularMarketChangePercent is Yahoo's rolling day. chartPreviousClose on this
  // 7d request is the start of the week (TON printed about −12% against a −6% day).
  // The CoinGecko id the-open-network is the right asset; the window was not.
  const reported = Number(r.meta?.regularMarketChangePercent);
  const changePct = Number.isFinite(reported) ? reported : 0;
  const unix = Number(r.meta?.regularMarketTime);
  const quotedAt =
    unix > 1_000_000_000
      ? new Date(unix > 1_000_000_000_000 ? unix : unix * 1000).toISOString()
      : new Date().toISOString();
  return { price, changePct, change7d: sevenDayReturnPct(closes), sparkline7d: closes, quotedAt };
}

export async function fetchYahooMajorMarkets(): Promise<CoinMarket[]> {
  const out: CoinMarket[] = [];
  const batch = [...YAHOO_MAJOR];
  const conc = 8;
  let i = 0;
  async function worker() {
    while (i < batch.length) {
      const idx = i++;
      const code = batch[idx];
      const q = await fetchYahooCryptoQuote(code);
      if (!q) continue;
      const id = canonicalCryptoId(code);
      out.push({
        id,
        symbol: code,
        name: coinDisplayName(code),
        image: coinLogo(code),
        rank: idx + 1,
        price: q.price,
        marketCap: 0,
        fdv: null,
        volume24h: 0,
        change1h: null,
        change24h: q.changePct,
        change7d: q.change7d ?? 0,
        sparkline7d: q.sparkline7d,
        high24h: null,
        low24h: null,
        circulatingSupply: null,
        totalSupply: null,
        maxSupply: null,
        ath: null,
        athDate: null,
        atl: null,
        atlDate: null,
        blockchain: snapshotBlockchain(id, null, null) || snapshotBlockchain(code.toLowerCase(), null, null),
        quotedAt: q.quotedAt,
        source: "yahoo",
        priceUnavailable: false,
      });
    }
  }
  await Promise.all(Array.from({ length: conc }, () => worker()));
  out.sort((a, b) => a.rank - b.rank);
  console.log(`[crypto-yahoo] major markets → ${out.length}/${YAHOO_MAJOR.length}`);
  return out;
}

function chartCloses(payload: unknown): number[] {
  const root = payload && typeof payload === "object" ? (payload as { chart?: { result?: Array<{ indicators?: { quote?: Array<{ close?: unknown[] }> } }> } }) : null;
  const closes = root?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || [];
  return closes.filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n > 0);
}

/** Percent move from the close `barsBack` prints before the last close. */
export function trailingCloseChange(closes: number[], barsBack: number): number | null {
  const live = closes.filter((n) => n > 0);
  if (live.length < 2 || barsBack < 1) return null;
  const last = live[live.length - 1];
  const prev = live[Math.max(0, live.length - 1 - barsBack)];
  if (!(prev > 0) || !(last > 0)) return null;
  return ((last - prev) / prev) * 100;
}

export async function fetchYahooCoinDetail(idOrTicker: string): Promise<CoinDetail> {
  const ticker = resolveTicker(idOrTicker);
  const symbol = yahooSymbol(ticker);
  const [q, hour, month] = await Promise.all([
    fetchYahooCryptoQuote(ticker),
    yahooChartRaw(symbol, "1d", "5m"),
    yahooChartRaw(symbol, "1mo", "1d"),
  ]);
  if (!q) throw new Error(`Yahoo has no quote for ${ticker}`);
  const change1h = trailingCloseChange(chartCloses(hour), 12);
  const monthCloses = chartCloses(month);
  const change30d = trailingCloseChange(monthCloses, Math.max(1, monthCloses.length - 1));
  return {
    id: ticker.toLowerCase(),
    symbol: ticker,
    name: coinDisplayName(ticker),
    image: coinLogo(ticker),
    rank: null,
    price: q.price,
    marketCap: null,
    fdv: null,
    volume24h: null,
    high24h: null,
    low24h: null,
    change1h,
    change24h: q.changePct,
    change7d: q.change7d,
    change30d,
    change1y: null,
    circulatingSupply: null,
    totalSupply: null,
    maxSupply: null,
    ath: null,
    athDate: null,
    athChangePct: null,
    atl: null,
    atlDate: null,
    atlChangePct: null,
    description: `${coinDisplayName(ticker)} indicative USD quote. The as-of time is shown with the price.`,
    categories: ["Cryptocurrency"],
    homepage: null,
    explorer: null,
    twitter: null,
    reddit: null,
    github: null,
  };
}

export async function fetchYahooCoinChart(idOrTicker: string, days: string): Promise<CoinChart> {
  const ticker = resolveTicker(idOrTicker);
  const d = Number(days) || 7;
  const range = d <= 1 ? "1d" : d <= 7 ? "7d" : d <= 30 ? "1mo" : d <= 90 ? "3mo" : "1y";
  const interval = d <= 1 ? "5m" : d <= 7 ? "1h" : "1d";
  const j = await yahooChartRaw(yahooSymbol(ticker), range, interval);
  const r = j?.chart?.result?.[0];
  if (!r) return { prices: [], volumes: [] };
  const ts: number[] = r.timestamp || [];
  const closes: Array<number | null> = r.indicators?.quote?.[0]?.close || [];
  const volumes: Array<number | null> = r.indicators?.quote?.[0]?.volume || [];
  const prices: { t: number; price: number }[] = [];
  const vols: { t: number; price: number }[] = [];
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    if (c == null || !(c > 0)) continue;
    const tMs = ts[i] * 1000;
    prices.push({ t: tMs, price: c });
    const v = volumes[i];
    if (v != null) vols.push({ t: tMs, price: v });
  }
  console.log(`[crypto-yahoo] chart ${ticker} days=${days} → ${prices.length} points`);
  return { prices, volumes: vols };
}
