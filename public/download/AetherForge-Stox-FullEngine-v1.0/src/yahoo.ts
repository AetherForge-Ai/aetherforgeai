/**
 * Yahoo Finance live quotes + daily history — KEYLESS.
 * Same public endpoints used by the AetherForge website.
 */

export interface YahooQuote {
  price: number;
  changePct: number;
  prevClose: number;
  currency: string;
  name?: string;
}

const CHART_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";
const SPARK_BASE = "https://query1.finance.yahoo.com/v8/finance/spark";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36";

const QUOTE_CACHE = new Map<string, { quote: YahooQuote; at: number }>();
const HIST_CACHE = new Map<string, { closes: number[]; at: number }>();
const QUOTE_TTL = 60_000;
const HIST_TTL = 10 * 60_000;

function cleanName(raw: unknown): string | undefined {
  const s = String(raw ?? "").trim();
  if (!s) return undefined;
  return (
    s
      .replace(/\s*\[[^\]]*\]\s*$/, "")
      .replace(/\s+\b(FPO|ORD|CDI|NPV|NVS|REIT|UNITS?|STAPLED)\b\.?$/i, "")
      .trim() || s
  );
}

async function fetchOneQuote(symbol: string): Promise<YahooQuote | null> {
  const cached = QUOTE_CACHE.get(symbol);
  if (cached && Date.now() - cached.at <= QUOTE_TTL) return cached.quote;

  try {
    const url = `${CHART_BASE}/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (!res.ok) {
      console.warn(`[yahoo] HTTP ${res.status} for ${symbol}`);
      return null;
    }
    const json = (await res.json()) as {
      chart?: { result?: Array<{ meta?: Record<string, any> }> };
    };
    const meta = json?.chart?.result?.[0]?.meta;
    if (!meta) return null;

    const price = Number(meta.regularMarketPrice);
    const prevClose = Number(meta.chartPreviousClose ?? meta.previousClose ?? price);
    if (!Number.isFinite(price) || price <= 0) return null;

    const changePct = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;
    const quote: YahooQuote = {
      price,
      changePct: Number.isFinite(changePct) ? changePct : 0,
      prevClose: prevClose > 0 ? prevClose : price,
      currency: typeof meta.currency === "string" ? meta.currency : "USD",
      name: cleanName(meta.longName) ?? cleanName(meta.shortName),
    };
    QUOTE_CACHE.set(symbol, { quote, at: Date.now() });
    return quote;
  } catch (err) {
    console.warn(`[yahoo] Quote failed for ${symbol}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/** Fetch live quotes for many tickers (bounded concurrency). */
export async function fetchQuotes(tickers: string[]): Promise<Record<string, YahooQuote>> {
  const unique = [...new Set(tickers.map((t) => t.toUpperCase()))];
  const out: Record<string, YahooQuote> = {};
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
  console.log(`[yahoo] Live quotes: ${Object.keys(out).length}/${unique.length}`);
  return out;
}

/**
 * Fetch ~6 months of daily closes for a ticker (oldest → newest).
 * Used to drive real RSI / MACD / momentum when available.
 */
export async function fetchHistory(symbol: string): Promise<number[] | null> {
  const sym = symbol.toUpperCase();
  const cached = HIST_CACHE.get(sym);
  if (cached && Date.now() - cached.at <= HIST_TTL) return cached.closes;

  try {
    const url = `${SPARK_BASE}?symbols=${encodeURIComponent(sym)}&range=6mo&interval=1d`;
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (!res.ok) return null;

    const json = (await res.json()) as Record<string, any>;
    let closes: number[] | null = null;

    if (json?.spark?.result && Array.isArray(json.spark.result)) {
      const r = json.spark.result.find((x: any) => x?.symbol === sym) ?? json.spark.result[0];
      const raw = r?.response?.[0]?.indicators?.quote?.[0]?.close;
      if (Array.isArray(raw)) {
        closes = raw.map((v: any) => Number(v)).filter((v: number) => Number.isFinite(v) && v > 0);
      }
    } else if (json[sym]?.close && Array.isArray(json[sym].close)) {
      closes = json[sym].close.map((v: any) => Number(v)).filter((v: number) => Number.isFinite(v) && v > 0);
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

/** Fetch histories for many tickers. */
export async function fetchHistories(
  tickers: string[]
): Promise<Record<string, number[]>> {
  const unique = [...new Set(tickers.map((t) => t.toUpperCase()))];
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
  console.log(`[yahoo] Real histories: ${Object.keys(out).length}/${unique.length}`);
  return out;
}
