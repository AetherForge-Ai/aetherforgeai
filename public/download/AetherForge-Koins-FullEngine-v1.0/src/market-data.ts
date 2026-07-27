/**
 * Crypto market data — KEYLESS.
 * Primary: Yahoo Finance (BTC-USD style symbols)
 * Fallback: CoinGecko public API
 */

export interface CryptoQuote {
  price: number;
  changePct: number;
  prevClose: number;
  currency: string;
  name?: string;
}

const YAHOO_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";
const YAHOO_SPARK = "https://query1.finance.yahoo.com/v8/finance/spark";
const CG_BASE = "https://api.coingecko.com/api/v3";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36";

const QUOTE_CACHE = new Map<string, { quote: CryptoQuote; at: number }>();
const HIST_CACHE = new Map<string, { closes: number[]; at: number }>();
const QUOTE_TTL = 60_000;
const HIST_TTL = 10 * 60_000;

/** Map internal symbol → Yahoo symbol (BTC → BTC-USD). */
function yahooSymbol(sym: string): string {
  const s = sym.toUpperCase().replace(/-?USDT?$/, "");
  return `${s}-USD`;
}

/** Common CoinGecko id map for major coins. */
const CG_IDS: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  BNB: "binancecoin",
  XRP: "ripple",
  ADA: "cardano",
  AVAX: "avalanche-2",
  DOGE: "dogecoin",
  LINK: "chainlink",
  DOT: "polkadot",
  MATIC: "matic-network",
  LTC: "litecoin",
  UNI: "uniswap",
  ATOM: "cosmos",
  NEAR: "near",
  APT: "aptos",
  ARB: "arbitrum",
  OP: "optimism",
  SHIB: "shiba-inu",
  TRX: "tron",
  TON: "the-open-network",
  SUI: "sui",
  PEPE: "pepe",
  RENDER: "render-token",
  FET: "fetch-ai",
};

function cleanName(raw: unknown): string | undefined {
  const s = String(raw ?? "").trim();
  return s || undefined;
}

async function fetchYahooQuote(symbol: string): Promise<CryptoQuote | null> {
  const ySym = yahooSymbol(symbol);
  const cached = QUOTE_CACHE.get(symbol);
  if (cached && Date.now() - cached.at <= QUOTE_TTL) return cached.quote;

  try {
    const url = `${YAHOO_BASE}/${encodeURIComponent(ySym)}?interval=1d&range=1d`;
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      chart?: { result?: Array<{ meta?: Record<string, any> }> };
    };
    const meta = json?.chart?.result?.[0]?.meta;
    if (!meta) return null;

    const price = Number(meta.regularMarketPrice);
    const prevClose = Number(meta.chartPreviousClose ?? meta.previousClose ?? price);
    if (!Number.isFinite(price) || price <= 0) return null;

    const changePct = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;
    const quote: CryptoQuote = {
      price,
      changePct: Number.isFinite(changePct) ? changePct : 0,
      prevClose: prevClose > 0 ? prevClose : price,
      currency: "USD",
      name: cleanName(meta.longName) ?? cleanName(meta.shortName) ?? symbol,
    };
    QUOTE_CACHE.set(symbol, { quote, at: Date.now() });
    return quote;
  } catch {
    return null;
  }
}

async function fetchCoinGeckoQuote(symbol: string): Promise<CryptoQuote | null> {
  const id = CG_IDS[symbol.toUpperCase()];
  if (!id) return null;
  try {
    const url = `${CG_BASE}/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const json = (await res.json()) as Record<string, { usd?: number; usd_24h_change?: number }>;
    const node = json[id];
    if (!node?.usd || node.usd <= 0) return null;
    const changePct = Number(node.usd_24h_change ?? 0);
    const quote: CryptoQuote = {
      price: node.usd,
      changePct: Number.isFinite(changePct) ? changePct : 0,
      prevClose: node.usd / (1 + changePct / 100),
      currency: "USD",
      name: symbol.toUpperCase(),
    };
    QUOTE_CACHE.set(symbol, { quote, at: Date.now() });
    return quote;
  } catch {
    return null;
  }
}

async function fetchOneQuote(symbol: string): Promise<CryptoQuote | null> {
  const y = await fetchYahooQuote(symbol);
  if (y) return y;
  return fetchCoinGeckoQuote(symbol);
}

/** Fetch live quotes for many crypto symbols. */
export async function fetchQuotes(symbols: string[]): Promise<Record<string, CryptoQuote>> {
  const unique = [...new Set(symbols.map((s) => s.toUpperCase().replace(/-?USDT?$/, "")))];
  const out: Record<string, CryptoQuote> = {};
  const CONCURRENCY = 6;
  let cursor = 0;

  async function worker() {
    while (cursor < unique.length) {
      const i = cursor++;
      const sym = unique[i];
      const q = await fetchOneQuote(sym);
      if (q) out[sym] = q;
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, unique.length) }, () => worker()));
  console.log(`[market] Live crypto quotes: ${Object.keys(out).length}/${unique.length}`);
  return out;
}

/** Fetch ~6 months of daily closes (Yahoo spark, BTC-USD style). */
export async function fetchHistory(symbol: string): Promise<number[] | null> {
  const sym = symbol.toUpperCase().replace(/-?USDT?$/, "");
  const cached = HIST_CACHE.get(sym);
  if (cached && Date.now() - cached.at <= HIST_TTL) return cached.closes;

  try {
    const ySym = yahooSymbol(sym);
    const url = `${YAHOO_SPARK}?symbols=${encodeURIComponent(ySym)}&range=6mo&interval=1d`;
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (!res.ok) return null;
    const json = (await res.json()) as Record<string, any>;

    let closes: number[] | null = null;
    if (json?.spark?.result && Array.isArray(json.spark.result)) {
      const r = json.spark.result[0];
      const raw = r?.response?.[0]?.indicators?.quote?.[0]?.close;
      if (Array.isArray(raw)) {
        closes = raw.map((v: any) => Number(v)).filter((v: number) => Number.isFinite(v) && v > 0);
      }
    } else if (json[ySym]?.close && Array.isArray(json[ySym].close)) {
      closes = json[ySym].close.map((v: any) => Number(v)).filter((v: number) => Number.isFinite(v) && v > 0);
    }

    if (closes && closes.length >= 40) {
      HIST_CACHE.set(sym, { closes, at: Date.now() });
      return closes;
    }
    return null;
  } catch {
    return null;
  }
}

export async function fetchHistories(symbols: string[]): Promise<Record<string, number[]>> {
  const unique = [...new Set(symbols.map((s) => s.toUpperCase().replace(/-?USDT?$/, "")))];
  const out: Record<string, number[]> = {};
  const CONCURRENCY = 4;
  let cursor = 0;

  async function worker() {
    while (cursor < unique.length) {
      const i = cursor++;
      const sym = unique[i];
      const h = await fetchHistory(sym);
      if (h) out[sym] = h;
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, unique.length) }, () => worker()));
  console.log(`[market] Real crypto histories: ${Object.keys(out).length}/${unique.length}`);
  return out;
}
