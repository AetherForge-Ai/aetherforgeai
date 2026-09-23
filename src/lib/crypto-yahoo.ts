/**
 * Yahoo Finance crypto fallback — keyless charts + quotes for major coins.
 * Used when Swyftx/CoinGecko are rate-limited or unreachable so the Crypto tab
 * never stays permanently "unavailable".
 */

import "server-only";
import type { CoinMarket, CoinDetail, CoinChart } from "@/lib/crypto-market";
import { CANONICAL_CRYPTO_IDS, CRYPTO_DISPLAY_NAMES, normalizeCryptoTicker } from "@/lib/crypto-ids";
import { coinLogo } from "@/lib/crypto-market";

const YAHOO_CHART = "https://query1.finance.yahoo.com/v8/finance/chart";

/** Fallback universe when Swyftx and CoinGecko are both down. Kept at 100 so the Stock Markets Crypto tab is never a short list. */
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
  return `${normalizeCryptoTicker(ticker)}-USD`;
}

function resolveTicker(idOrTicker: string): string {
  const raw = (idOrTicker || "").trim();
  const code = normalizeCryptoTicker(raw);
  for (const [t, cg] of Object.entries(CANONICAL_CRYPTO_IDS)) {
    if (cg === raw.toLowerCase() || t === code) return t;
  }
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
): Promise<{ price: number; changePct: number } | null> {
  const j = await yahooChartRaw(yahooSymbol(ticker), "5d", "1d");
  const r = j?.chart?.result?.[0];
  if (!r) return null;
  const price = Number(r.meta?.regularMarketPrice);
  const prev = Number(r.meta?.chartPreviousClose ?? r.meta?.previousClose);
  if (!(price > 0)) return null;
  const changePct = prev > 0 ? ((price - prev) / prev) * 100 : 0;
  return { price, changePct };
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
      out.push({
        id: code.toLowerCase(),
        symbol: code,
        name: CRYPTO_DISPLAY_NAMES[code] || code,
        image: coinLogo(code),
        rank: idx + 1,
        price: q.price,
        marketCap: 0,
        fdv: null,
        volume24h: 0,
        change1h: null,
        change24h: q.changePct,
        change7d: 0,
        high24h: null,
        low24h: null,
        circulatingSupply: null,
        totalSupply: null,
        maxSupply: null,
        ath: null,
        athDate: null,
        atl: null,
        atlDate: null,
        sparkline7d: [],
      });
    }
  }
  await Promise.all(Array.from({ length: conc }, () => worker()));
  out.sort((a, b) => a.rank - b.rank);
  console.log(`[crypto-yahoo] major markets → ${out.length}/${YAHOO_MAJOR.length}`);
  return out;
}

export async function fetchYahooCoinDetail(idOrTicker: string): Promise<CoinDetail> {
  const ticker = resolveTicker(idOrTicker);
  const q = await fetchYahooCryptoQuote(ticker);
  if (!q) throw new Error(`Yahoo has no quote for ${ticker}`);
  return {
    id: ticker.toLowerCase(),
    symbol: ticker,
    name: CRYPTO_DISPLAY_NAMES[ticker] || ticker,
    image: coinLogo(ticker),
    rank: null,
    price: q.price,
    marketCap: null,
    fdv: null,
    volume24h: null,
    high24h: null,
    low24h: null,
    change1h: null,
    change24h: q.changePct,
    change7d: null,
    change30d: null,
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
    description: `${CRYPTO_DISPLAY_NAMES[ticker] || ticker} live USD quote via Yahoo Finance fallback (Swyftx/CoinGecko unavailable).`,
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
