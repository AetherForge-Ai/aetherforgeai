/**
 * H-13: templated stock-page text built only from real data (the listing and
 * the vendor's daily closes). Nothing is invented: a paragraph is left out
 * when its inputs are missing. The page stays noindex until the text reaches
 * STOCK_PAGE_MIN_WORDS and STOCK_PAGE_INDEXING=1.
 */
export const STOCK_PAGE_MIN_WORDS = 300;

export interface StockContentInput {
  name: string;
  symbol: string;
  sector: string;
  exchangeLabel: string;
  currency: string;
  closes: number[]; // oldest to newest, daily
}

const fmt = (n: number, ccy: string) =>
  `${ccy} ${n.toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: n < 1 ? 4 : 2 })}`;
const pct = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(1)}%`;

export function stockContentParagraphs(i: StockContentInput): string[] {
  const out: string[] = [];
  out.push(
    `${i.name} trades on the ${i.exchangeLabel} under the symbol ${i.symbol}${i.sector ? ` and is listed in the ${i.sector} sector` : ""}. Prices on this page are in ${i.currency}. They come from a market data vendor and are delayed while the market is open; outside trading hours they show the last official close. AetherForge is a paper book: recording a trade here does not buy or sell anything.`
  );
  const c = i.closes.filter((v) => Number.isFinite(v) && v > 0);
  if (c.length >= 20) {
    const last = c[c.length - 1];
    const first = c[0];
    const hi = Math.max(...c);
    const lo = Math.min(...c);
    const m1 = c[Math.max(0, c.length - 22)];
    const avg = c.reduce((a, b) => a + b, 0) / c.length;
    const rets = c.slice(1).map((v, k) => v / c[k] - 1);
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length);
    const up = rets.filter((r) => r > 0).length;
    out.push(
      `Over the last ${c.length} trading sessions the closing price moved from ${fmt(first, i.currency)} to ${fmt(last, i.currency)}, a change of ${pct((last / first - 1) * 100)}. Across that window the highest close was ${fmt(hi, i.currency)} and the lowest was ${fmt(lo, i.currency)}, so the latest close sits ${(((last - lo) / (hi - lo || 1)) * 100).toFixed(0)}% of the way from the low to the high.`
    );
    out.push(
      `Over roughly the last month (${Math.min(21, c.length - 1)} sessions) the close changed by ${pct((last / m1 - 1) * 100)}. The average close across the whole window was ${fmt(avg, i.currency)}, and the latest close is ${pct((last / avg - 1) * 100)} against that average. The price closed higher than the session before on ${up} of ${rets.length} sessions.`
    );
    out.push(
      `The typical day-to-day move in the close was about ${(sd * 100).toFixed(2)}% (one standard deviation of daily changes). A larger figure means the price has moved around more from one session to the next; it describes the past window only and says nothing certain about what happens next.`
    );
  }
  out.push(
    `These figures are calculated from published daily closes and are for general information only. They are not financial advice and do not take your goals or circumstances into account. Past price movements do not predict future returns. Before you act on anything, consider talking to a licensed financial adviser.`
  );
  return out;
}

export function wordCount(paragraphs: string[]): number {
  return paragraphs.join(" ").split(/\s+/).filter(Boolean).length;
}

export function stockPageIndexable(paragraphs: string[], flag = process.env.STOCK_PAGE_INDEXING === "1"): boolean {
  return flag && wordCount(paragraphs) >= STOCK_PAGE_MIN_WORDS;
}
