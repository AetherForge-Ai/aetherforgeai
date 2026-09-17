/**
 * Live market-news pipeline (SERVER-ONLY).
 *
 * Pulls fresh, portfolio/market-relevant headlines for stock (NZX / ASX / US)
 * and crypto bots, maps them into the NewsItem shape used by NewsFeed, and
 * caches results for a few hours so we don't hammer providers (Cloudflare-
 * friendly alongside force-dynamic on /api/market).
 *
 * Sources (prefer existing / free over new paid APIs):
 *  - Stocks: Yahoo Finance RSS + search, RNZ Business, BusinessDesk, BBC Business
 *  - Crypto: CoinDesk RSS, CoinTelegraph RSS, Yahoo BTC-USD RSS
 *  - Optional: CryptoCompare when CRYPTOCOMPARE_API_KEY is set
 *  - Optional: Twelve Data /press_releases when MARKET_DATA_API_KEY is set
 *
 * On any failure (or thin coverage) falls back to the curated NEWS_POOL /
 * CRYPTO_NEWS_POOL with day-rotated relative times — never blanks the page.
 */

import "server-only";

import {
  getMarketNews as getCuratedNews,
  type AssetClass,
  type MarketCode,
  type NewsItem,
} from "@/lib/market-intel";
import { keywordSentiment } from "@/lib/news-sentiment";

const NEWS_TTL_MS = 4 * 60 * 60 * 1000; // ~4h — refreshes at least daily
const UA =
  "Mozilla/5.0 (compatible; AetherForgeAI/1.0; +https://www.aetherforgeai.co.nz)";

type CacheEntry = { at: number; value: NewsItem[] };
const memo = new Map<string, CacheEntry>();

function readCache(key: string): NewsItem[] | null {
  const hit = memo.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > NEWS_TTL_MS) return null;
  return hit.value;
}

function writeCache(key: string, value: NewsItem[]): void {
  memo.set(key, { at: Date.now(), value });
}

/** Real relative age from a publish timestamp. */
export function formatRelativeTime(when: Date | string | number): string {
  const d =
    typeof when === "number"
      ? new Date(when < 1e12 ? when * 1000 : when)
      : typeof when === "string"
        ? new Date(when)
        : when;
  if (Number.isNaN(d.getTime())) return "just now";
  const secs = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-NZ", { day: "numeric", month: "short" });
}

function stripHtml(html: string): string {
  return html
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeXml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .trim();
}

function tagBetween(block: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = block.match(re);
  return m ? decodeXml(m[1]) : "";
}

function attrIn(block: string, tag: string, attr: string): string {
  const re = new RegExp(`<${tag}[^>]*\\s${attr}=["']([^"']+)["'][^>]*/?>`, "i");
  const m = block.match(re);
  return m ? decodeXml(m[1]) : "";
}

interface RawStory {
  headline: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: Date;
  imageUrl?: string;
  marketHint?: MarketCode | "Global";
}

function inferMarket(text: string, fallback: MarketCode | "Global" = "Global"): MarketCode | "Global" {
  const t = text.toLowerCase();
  if (/\b(bitcoin|ethereum|crypto|blockchain|defi|stablecoin|btc|eth|solana)\b/.test(t)) return "CRYPTO";
  if (/\b(nzx|rbnz|new zealand|auckland|wellington|fonterra|kiwibank|ocr)\b/.test(t)) return "NZX";
  if (/\b(asx|rba|australia|sydney|melbourne|bhp|cba|woodside|iron.?ore)\b/.test(t)) return "ASX";
  if (/\b(nasdaq|dow|s&p|wall street|federal reserve|fomc|nyse|nvidia|apple|treasury)\b/.test(t))
    return "US";
  return fallback;
}

function relevanceFor(text: string, assetClass: AssetClass, market: MarketCode | "Global"): number {
  let score = 55;
  const t = text.toLowerCase();
  if (assetClass === "crypto") {
    if (/\b(bitcoin|btc|ethereum|eth|solana|etf|sec|regulation)\b/.test(t)) score += 25;
    if (/\b(hack|inflow|outflow|staking|layer.?2|stablecoin)\b/.test(t)) score += 10;
  } else {
    if (market === "NZX") score += 20;
    if (market === "ASX") score += 15;
    if (market === "US") score += 12;
    if (/\b(rbnz|ocr|cpi|inflation|rate.?cut|earnings|guidance|dividend)\b/.test(t)) score += 12;
  }
  return Math.max(40, Math.min(98, score));
}

function toNewsItem(raw: RawStory, assetClass: AssetClass): NewsItem {
  const blob = `${raw.headline} ${raw.summary}`;
  const market = raw.marketHint ?? inferMarket(blob, assetClass === "crypto" ? "CRYPTO" : "Global");
  const { sentiment } = keywordSentiment(blob);
  return {
    headline: raw.headline.slice(0, 220),
    summary: (raw.summary || raw.headline).slice(0, 420),
    source: raw.source.slice(0, 80) || "Market Wire",
    market,
    impact: sentiment,
    relevance: relevanceFor(blob, assetClass, market),
    time: formatRelativeTime(raw.publishedAt),
    url: raw.url || "https://www.aetherforgeai.co.nz/market-news",
    imageUrl: raw.imageUrl,
  };
}

async function fetchText(url: string, timeoutMs = 12_000): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, {
      headers: { Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*", "User-Agent": UA },
      signal: ctrl.signal,
      cache: "no-store",
    });
    clearTimeout(t);
    if (!res.ok) {
      console.error(`[market-news] HTTP ${res.status} for ${url}`);
      return null;
    }
    return await res.text();
  } catch (err) {
    console.error(`[market-news] fetch failed for ${url}:`, err);
    return null;
  }
}

/** Parse RSS 2.0 or Atom into RawStory[]. */
function parseFeedXml(xml: string, sourceFallback: string, marketHint?: MarketCode | "Global"): RawStory[] {
  const out: RawStory[] = [];
  const itemBlocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
  const entryBlocks = !itemBlocks.length ? xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [] : [];
  const blocks = itemBlocks.length ? itemBlocks : entryBlocks;

  for (const block of blocks) {
    let title = tagBetween(block, "title");
    if (!title) continue;
    title = stripHtml(title);
    if (title.length < 12) continue;
    // Skip obvious non-market fluff / sponsored slots in business feeds.
    if (/^sponsored\b/i.test(title) || /\b(stuntwomen|liquor licences|carjacking)\b/i.test(title)) continue;

    let link =
      tagBetween(block, "link") ||
      attrIn(block, "link", "href") ||
      tagBetween(block, "guid") ||
      "";
    // Atom often has <link href="..." />
    if (!link || link.length < 8) {
      const href = block.match(/<link[^>]+href=["']([^"']+)["']/i);
      if (href) link = decodeXml(href[1]);
    }
    link = link.trim();

    const pubRaw =
      tagBetween(block, "pubDate") ||
      tagBetween(block, "published") ||
      tagBetween(block, "updated") ||
      tagBetween(block, "dc:date") ||
      "";
    const publishedAt = pubRaw ? new Date(pubRaw) : new Date();
    if (Number.isNaN(publishedAt.getTime())) continue;
    // Drop stories older than ~10 days — keep the feed feeling fresh.
    if (Date.now() - publishedAt.getTime() > 10 * 24 * 60 * 60 * 1000) continue;

    const desc =
      stripHtml(tagBetween(block, "description") || tagBetween(block, "summary") || tagBetween(block, "content") || "") ||
      title;
    const imageUrl =
      attrIn(block, "media:content", "url") ||
      attrIn(block, "media:thumbnail", "url") ||
      attrIn(block, "enclosure", "url") ||
      undefined;
    const creator = tagBetween(block, "dc:creator") || tagBetween(block, "author") || sourceFallback;

    out.push({
      headline: title,
      summary: desc.slice(0, 420),
      source: creator.slice(0, 80) || sourceFallback,
      url: link.startsWith("http") ? link : `https://www.aetherforgeai.co.nz/market-news`,
      publishedAt,
      imageUrl,
      marketHint,
    });
  }
  return out;
}

async function fetchRssStories(
  url: string,
  source: string,
  marketHint?: MarketCode | "Global"
): Promise<RawStory[]> {
  const xml = await fetchText(url);
  if (!xml) return [];
  return parseFeedXml(xml, source, marketHint);
}

interface YahooNewsHit {
  title?: string;
  publisher?: string;
  link?: string;
  providerPublishTime?: number;
  summary?: string;
  thumbnail?: { resolutions?: { url?: string }[] };
}

async function fetchYahooSearchNews(query: string, count = 8): Promise<RawStory[]> {
  const url =
    `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}` +
    `&newsCount=${count}&quotesCount=0&listsCount=0`;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12_000);
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": UA },
      signal: ctrl.signal,
      cache: "no-store",
    });
    clearTimeout(t);
    if (!res.ok) {
      console.error(`[market-news] Yahoo search HTTP ${res.status} for "${query}"`);
      return [];
    }
    const json = (await res.json()) as { news?: YahooNewsHit[] };
    return (json.news || [])
      .map((n) => {
        const publishedAt = n.providerPublishTime
          ? new Date(n.providerPublishTime * 1000)
          : new Date();
        const img = n.thumbnail?.resolutions?.[0]?.url;
        return {
          headline: String(n.title || "").trim(),
          summary: String(n.summary || n.title || "").trim(),
          source: String(n.publisher || "Yahoo Finance"),
          url: String(n.link || ""),
          publishedAt,
          imageUrl: img,
        } as RawStory;
      })
      .filter((s) => s.headline.length >= 12 && s.url.startsWith("http"));
  } catch (err) {
    console.error(`[market-news] Yahoo search failed for "${query}":`, err);
    return [];
  }
}

async function fetchTwelvePressReleases(limit = 6): Promise<RawStory[]> {
  const key = process.env.MARKET_DATA_API_KEY;
  if (!key) return [];
  // A few liquid names spanning US / ASX / NZX focus.
  const symbols = ["AAPL", "MSFT", "NVDA", "BHP", "CBA"];
  const out: RawStory[] = [];
  await Promise.all(
    symbols.slice(0, 3).map(async (symbol) => {
      try {
        const url = `https://api.twelvedata.com/press_releases?symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(key)}&outputsize=2`;
        const res = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as {
          press_releases?: { title?: string; body?: string; datetime?: string }[];
        };
        for (const pr of json.press_releases || []) {
          const title = String(pr.title || "").trim();
          if (title.length < 12) continue;
          const body = stripHtml(String(pr.body || "")).slice(0, 420);
          out.push({
            headline: title,
            summary: body || title,
            source: "Company Wire",
            url: `https://www.twelvedata.com/`,
            publishedAt: pr.datetime ? new Date(pr.datetime) : new Date(),
            marketHint: inferMarket(`${title} ${symbol}`),
          });
        }
      } catch (err) {
        console.error(`[market-news] Twelve Data press_releases(${symbol}) failed:`, err);
      }
    })
  );
  return out.slice(0, limit);
}

async function fetchCryptoCompareNews(limit = 12): Promise<RawStory[]> {
  const key = process.env.CRYPTOCOMPARE_API_KEY || process.env.CRYPTO_COMPARE_API_KEY;
  const url =
    "https://min-api.cryptocompare.com/data/v2/news/?lang=EN&sortOrder=latest" +
    (key ? `&api_key=${encodeURIComponent(key)}` : "");
  try {
    const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": UA }, cache: "no-store" });
    if (!res.ok) {
      console.error(`[market-news] CryptoCompare HTTP ${res.status}`);
      return [];
    }
    const json = (await res.json()) as { Data?: any[]; Err?: unknown };
    if (!Array.isArray(json.Data)) return [];
    return json.Data.slice(0, limit).map((n) => {
      const title = String(n.title || "");
      const body = String(n.body || "");
      return {
        headline: title,
        summary: body.slice(0, 420) || title,
        source: String(n.source_info?.name || n.source || "Crypto Wire"),
        url: String(n.url || n.guid || ""),
        publishedAt: n.published_on ? new Date(Number(n.published_on) * 1000) : new Date(),
        imageUrl: n.imageurl ? String(n.imageurl) : undefined,
        marketHint: "CRYPTO" as const,
      };
    });
  } catch (err) {
    console.error("[market-news] CryptoCompare failed:", err);
    return [];
  }
}

function dedupeStories(stories: RawStory[]): RawStory[] {
  const seen = new Set<string>();
  const out: RawStory[] = [];
  for (const s of stories) {
    const key = s.headline.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 80);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

async function loadStockStories(): Promise<RawStory[]> {
  const [rnz, bd, bbc, yahooAsxRss, yahooUsRss, yAsx, yNas, ySp, press] = await Promise.all([
    fetchRssStories("https://www.rnz.co.nz/rss/business.xml", "RNZ", "NZX"),
    fetchRssStories("https://www.businessdesk.co.nz/feed", "BusinessDesk", "NZX"),
    fetchRssStories("https://feeds.bbci.co.uk/news/business/rss.xml", "BBC Business", "Global"),
    fetchRssStories(
      "https://finance.yahoo.com/rss/headline?s=BHP.AX,CBA.AX,WBC.AX,NAB.AX,CSL.AX,WES.AX,FMG.AX",
      "Yahoo Finance",
      "ASX"
    ),
    fetchRssStories(
      "https://finance.yahoo.com/rss/headline?s=%5EGSPC,%5EDJI,%5EIXIC,AAPL,MSFT,NVDA,JPM",
      "Yahoo Finance",
      "US"
    ),
    fetchYahooSearchNews("ASX 200", 6),
    fetchYahooSearchNews("NASDAQ", 6),
    fetchYahooSearchNews("S&P 500", 4),
    fetchTwelvePressReleases(6),
  ]);

  // Prefer NZ/ASX/US market-moving items; keep some global macro.
  const nz = [...rnz, ...bd].slice(0, 10);
  const asx = [...yahooAsxRss, ...yAsx].slice(0, 10);
  const us = [...yahooUsRss, ...yNas, ...ySp, ...press].slice(0, 12);
  const global = bbc.slice(0, 6);

  return dedupeStories([...nz, ...asx, ...us, ...global]).sort(
    (a, b) => b.publishedAt.getTime() - a.publishedAt.getTime()
  );
}

async function loadCryptoStories(): Promise<RawStory[]> {
  const [cc, coindesk, ct, yahooBtc] = await Promise.all([
    fetchCryptoCompareNews(12),
    fetchRssStories("https://www.coindesk.com/arc/outboundfeeds/rss/", "CoinDesk", "CRYPTO"),
    fetchRssStories("https://cointelegraph.com/rss", "CoinTelegraph", "CRYPTO"),
    fetchRssStories("https://finance.yahoo.com/rss/headline?s=BTC-USD,ETH-USD", "Yahoo Finance", "CRYPTO"),
  ]);
  return dedupeStories([...cc, ...coindesk, ...ct, ...yahooBtc]).sort(
    (a, b) => b.publishedAt.getTime() - a.publishedAt.getTime()
  );
}

/**
 * Async loader used by GET /api/market (and other server routes).
 * Returns live headlines when available; otherwise the curated pool with
 * day-rotated relative times.
 */
export async function loadMarketNews(assetClass: AssetClass = "stock"): Promise<NewsItem[]> {
  const cacheKey = `news-${assetClass}`;
  const cached = readCache(cacheKey);
  if (cached?.length) return cached;

  try {
    const raw = assetClass === "crypto" ? await loadCryptoStories() : await loadStockStories();
    const live = raw
      .filter((s) => s.headline.length >= 12)
      .slice(0, 18)
      .map((s) => toNewsItem(s, assetClass))
      .sort((a, b) => b.relevance - a.relevance);

    if (live.length >= 4) {
      console.log(`[market-news] Serving ${live.length} live ${assetClass} headlines`);
      writeCache(cacheKey, live);
      return live;
    }
    console.warn(
      `[market-news] Live coverage thin (${live.length}) for ${assetClass} — using curated fallback`
    );
  } catch (err) {
    console.error(`[market-news] loadMarketNews(${assetClass}) failed:`, err);
  }

  const fallback = getCuratedNews(assetClass);
  writeCache(cacheKey, fallback);
  return fallback;
}
