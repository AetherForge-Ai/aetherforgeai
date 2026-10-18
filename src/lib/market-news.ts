/**
 * Live market-news pipeline (SERVER-ONLY).
 *
 * Pulls fresh, portfolio/market-relevant headlines for stock (NZX / ASX / US)
 * and crypto bots, maps them into the NewsItem shape used by NewsFeed, and
 * caches results for a few hours so we don't hammer providers (Cloudflare-
 * friendly alongside force-dynamic on /api/market).
 *
 * Sources:
 *  - Stocks: Yahoo Finance RSS + search, RNZ Business, BusinessDesk, BBC Business
 *  - Crypto: CryptoCompare news (no key), CoinDesk RSS, Cointelegraph RSS, Yahoo BTC-USD and ETH-USD RSS
 *
 * Stories without a publisher date, or without an article path, are dropped.
 * The public fallback is the dated official cards only — not an invented wire.
 */

import "server-only";

import { MARKET_UNIVERSE, type AssetClass, type MarketCode, type NewsItem } from "@/lib/market-intel";
import { decodeHtmlEntities, hasArticlePath, isOffTopicStory, prepareNewsFeed } from "@/lib/news-present";
import { keywordSentiment } from "@/lib/news-sentiment";

const NEWS_TTL_MS = 15 * 60 * 1000;
/** One hung feed must not hold /market-news past the 0.8 s budget. */
const NEWS_FETCH_MS = 500;
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
  const text = html
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return decodeHtmlEntities(text);
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

export function inferMarket(text: string, fallback: MarketCode | "Global" = "Global"): MarketCode | "Global" {
  const t = text.toLowerCase();
  if (/\b(bitcoin|ethereum|crypto|blockchain|defi|stablecoin|btc|eth|solana)\b/.test(t)) return "CRYPTO";
  if (/\b(nzx|rbnz|new zealand|auckland|wellington|fonterra|kiwibank|ocr|kiwisaver|stats nz)\b/.test(t)) return "NZX";
  // Goal b20 H-13: ASX-listed companies (e.g. PLS Group, formerly Pilbara Minerals) count as ASX, not Global.
  if (/\b(asx|rba|australia|australian|sydney|melbourne|perth|bhp|cba|woodside|iron.?ore|pls group|pilbara|wesfarmers|fortescue|rio tinto|westpac|commonwealth bank)\b/.test(t)) return "ASX";
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

const FINANCE_TERMS =
  /\b(market|markets|share|shares|stock|stocks|nzx|asx|wall street|nasdaq|dow|s&p|index|earnings|profit|revenue|dividend|guidance|rbnz|ocr|reserve bank|interest rate|rates?|inflation|cpi|gdp|economy|economic|bond|yield|currency|dollar|kiwi|fx|commodit|oil|gold|bitcoin|crypto|ethereum|investor|fund|kiwisaver|ipo|merger|acquisition|takeover|trade|tariff|budget|treasury|bank|company|firm|price|prices|sales|exports?|imports?)\b/i;
const POLITICS_ONLY =
  /\b(election|poll|polls|campaign|parliament|minister|mp|caucus|labour party|national party|greens|act party|nz first|te pāti māori|te pati maori|protest|coalition|senate|congress|republican|democrat|white house|trump|biden|harris|prime minister|premier)\b/i;

/**
 * H-13: keep finance stories. A story that reads as politics and carries no
 * finance term (rates, markets, companies, trade, budget) is dropped.
 */
const MARKET_TERMS =
  /\b(nzx|asx|nasdaq|wall street|s&p|sharemarket|stock market|shares|earnings|dividend|rbnz|ocr|reserve bank|interest rates?|inflation|cpi|gdp|bond yields?|kiwisaver|ipo|takeover|tariffs?)\b/i;

export function isFinanceRelevant(text: string): boolean {
  if (POLITICS_ONLY.test(text)) return MARKET_TERMS.test(text);
  if (CRIME_OR_COURT.test(text)) return MARKET_TERMS.test(text);
  return FINANCE_TERMS.test(text);
}

/**
 * b5 H-13: local crime and court reports ("sentenced over $320,000 kickbacks")
 * arrive on business feeds. Dropped unless they are about markets (e.g. an
 * insider-trading case that names the NZX).
 */
const CRIME_OR_COURT =
  /\b(sentenced|sentencing|jailed|prison|convicted|guilty|pleaded|police|arrested|fraud trial|kickbacks?|stabbing|assault|murder|manslaughter|home detention)\b/i;

/**
 * b5 H-13: opinion and speculation pieces from the US headline feed
 * ("Will Starlink Mobile matter for Apple?", "What Are Starbucks Stock Bulls Not
 * Worried About?"). The page is NZ/AU-first; overseas stories stay only when they
 * are market-wide news, never a single-company think piece.
 */
const SPECULATIVE_HEADLINE =
  /\?\s*$|\b(should you|is it time|could .* (soar|double|crash)|will .* matter|bulls|bears|millionaire|retire (early|rich)|top \d+|\d+ (stocks?|shares) to|buy now|before it'?s too late|no-brainer|motley fool)\b/i;
const OVERSEAS_NOT_RELEVANT =
  /\b(BLS|Bureau of Labor Statistics|scheduled|schedule|release date|calendar|think about|differently|pay attention|forecast and chart)\b/i;
const OVERSEAS_MARKET_WIDE =
  /\b(wall street|s&p ?500|nasdaq|dow jones|federal reserve|fed|fomc|treasury yields?|bond yields?|inflation|cpi|gdp|jobs report|payrolls|tariffs?|oil prices?|gold prices?|recession|central bank|interest rates?)\b/i;

const NZ_AU_TERMS =
  /\b(nzx|asx|nzsx|rbnz|rba|ocr|new zealand|kiwi|kiwis|aotearoa|auckland|wellington|christchurch|australia|australian|aussie|sydney|melbourne|brisbane|perth|nz\$|a\$|nzd|aud|fonterra|kiwisaver|superannuation|rba|stats nz|statistics new zealand|abs|ird|inland revenue|fma|asic|nz)\b/i;

/** Goal b11 H-13: NZ/AU finance sources whose stories count as local. */
const NZ_AU_SOURCES =
  /\b(nz herald|nzherald|stuff|rnz|radio new zealand|interest\.co\.nz|businessdesk|newsroom|the post|nbr|afr|australian financial review|smh|sydney morning herald|the age|abc news|abc\.net\.au|the australian|market index|marketindex|stockhead|motley fool australia|nzx|asx|rbnz|rba)\b/i;
const NAME_STOP = new Set(["the", "air", "new", "first", "general", "national", "global", "united", "smart", "market", "energy", "group", "capital", "property", "health", "michael", "james", "john", "david", "peter"]);
let nzAuNames: RegExp | null = null;
let nzAuTickers: RegExp | null = null;
/** NZ/AU tickers as written in headlines ("BHP", "FPH"). Case-sensitive so "air" does not match. */
function nzAuTickerPattern(): RegExp {
  if (nzAuTickers) return nzAuTickers;
  const codes = new Set<string>();
  for (const entry of MARKET_UNIVERSE) {
    if (entry.market !== "NZX" && entry.market !== "ASX") continue;
    const code = entry.ticker.replace(/\.(NZ|AX)$/i, "").toUpperCase();
    if (/^[A-Z0-9]{3,5}$/.test(code)) codes.add(code);
  }
  nzAuTickers = codes.size ? new RegExp(`\\b(${[...codes].join("|")})\\b`) : /$^/;
  return nzAuTickers;
}
function nzAuNamePattern(): RegExp {
  if (nzAuNames) return nzAuNames;
  const words = new Set<string>();
  for (const entry of MARKET_UNIVERSE) {
    if (entry.market !== "NZX" && entry.market !== "ASX") continue;
    const clean = entry.name
      .replace(/\(.*?\)/g, "")
      .replace(/\b(limited|ltd|group|holdings|corporation|corp|inc|plc|nz|australia|trust|fund)\b\.?/gi, "")
      .trim();
    const parts = clean.split(/\s+/).filter(Boolean);
    if (!parts.length) continue;
    const first = parts[0].toLowerCase();
    const phrase = first.length >= 5 && !NAME_STOP.has(first) ? parts[0] : parts.slice(0, 2).join(" ");
    if (phrase.length >= 4) words.add(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  }
  nzAuNames = words.size ? new RegExp(`\\b(${[...words].join("|")})\\b`, "i") : /$^/;
  return nzAuNames;
}

/** True when the story names New Zealand or Australia, an NZ/AU venue, or an NZ/AU listed company. */
export function hasNzAuAnchor(text: string): boolean {
  return NZ_AU_TERMS.test(text) || nzAuNamePattern().test(text) || nzAuTickerPattern().test(text);
}

export function isNewsRelevant(input: { headline: string; summary?: string; market: MarketCode | "Global"; source?: string }): boolean {
  const blob = `${input.headline} ${input.summary ?? ""}`;
  // Goal b11 H-13: a headline naming an NZX/ASX company or ticker is company
  // news (output, contracts, leadership) unless it is politics or crime.
  if ((nzAuTickerPattern().test(input.headline) || nzAuNamePattern().test(input.headline)) && !POLITICS_ONLY.test(blob) && !CRIME_OR_COURT.test(blob)) {
    return true;
  }
  if (!isFinanceRelevant(blob)) return false;
  // b6 H-13: an NZ/AU feed hint is not enough. Syndicated US single-stock pieces
  // ("Palantir", "Amgen") came in through NZ/AU feeds; without an NZ/AU anchor
  // the story is judged as overseas news.
  // b7: US agency calendars never count, whatever feed they came through.
  if (/\b(BLS|Bureau of Labor Statistics)\b/.test(input.headline)) return false;
  // b7: names and tickers must be in the headline (an ASX ticker such as "CPI"
  // in a summary is not an anchor); NZ/AU words may be in either.
  const anchored = hasNzAuAnchor(input.headline) || NZ_AU_TERMS.test(input.summary ?? "");
  // Goal b11 H-13: allow-list. A story stays only when it is anchored to NZ/AU
  // (venue, macro body, listed company or ticker, or NZ/AU words) or comes from
  // an NZ/AU finance source and is not a speculative piece. US/EU-only stories
  // (Fed, BLS, Wall Street, S&P-only names) are dropped unless they name NZ/AU.
  if (anchored) return true;
  if (input.source && NZ_AU_SOURCES.test(input.source) && !SPECULATIVE_HEADLINE.test(input.headline.trim()) && !OVERSEAS_MARKET_WIDE.test(input.headline)) {
    return true;
  }
  void OVERSEAS_NOT_RELEVANT;
  return false;
}

function toNewsItem(raw: RawStory, assetClass: AssetClass): NewsItem | null {
  if (!raw.url.startsWith("http") || !hasArticlePath(raw.url)) return null;
  if (Number.isNaN(raw.publishedAt.getTime())) return null;
  const headline = decodeHtmlEntities(raw.headline);
  const summary = decodeHtmlEntities(raw.summary || raw.headline);
  const source = decodeHtmlEntities(raw.source);
  const blob = `${headline} ${summary}`;
  // Goal b20 H-13: a feed-level "Global" hint is only a fallback; the story's own words decide first.
  const market =
    raw.marketHint && raw.marketHint !== "Global"
      ? raw.marketHint
      : inferMarket(blob, raw.marketHint ?? (assetClass === "crypto" ? "CRYPTO" : "Global"));
  if (assetClass !== "crypto" && !isNewsRelevant({ headline, summary, market, source })) return null;
  const { sentiment } = keywordSentiment(headline, summary === headline ? "" : summary);
  const url = raw.url;
  const publishedOn = raw.publishedAt.toISOString();
  return {
    headline: headline.slice(0, 220),
    summary: summary.slice(0, 420),
    source: source.slice(0, 80) || "Market Wire",
    market,
    impact: sentiment,
    relevance: relevanceFor(blob, assetClass, market),
    publishedOn,
    time: publishedOn,
    url,
    imageUrl: raw.imageUrl,
  };
}

async function fetchText(url: string, timeoutMs = NEWS_FETCH_MS): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*", "User-Agent": UA },
      signal: AbortSignal.timeout(timeoutMs),
      next: { revalidate: 900 },
    });
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
    if (!link.startsWith("http") || !hasArticlePath(link)) continue;

    const pubRaw =
      tagBetween(block, "pubDate") ||
      tagBetween(block, "published") ||
      tagBetween(block, "updated") ||
      tagBetween(block, "dc:date") ||
      "";
    if (!pubRaw) continue;
    const publishedAt = new Date(pubRaw);
    if (Number.isNaN(publishedAt.getTime())) continue;
    // Drop stories older than ~10 days — keep the feed feeling fresh.
    if (Date.now() - publishedAt.getTime() > 10 * 24 * 60 * 60 * 1000) continue;

    const desc =
      stripHtml(tagBetween(block, "description") || tagBetween(block, "summary") || tagBetween(block, "content") || "") ||
      title;
    if (isOffTopicStory(title, desc)) continue;
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
      url: link,
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
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": UA },
      signal: AbortSignal.timeout(NEWS_FETCH_MS),
      next: { revalidate: 900 },
    });
    if (!res.ok) {
      console.error(`[market-news] Yahoo search HTTP ${res.status} for "${query}"`);
      return [];
    }
    const json = (await res.json()) as { news?: YahooNewsHit[] };
    return (json.news || [])
      .map((n) => {
        if (!n.providerPublishTime) return null;
        const publishedAt = new Date(n.providerPublishTime * 1000);
        const img = n.thumbnail?.resolutions?.[0]?.url;
        return {
          headline: decodeHtmlEntities(String(n.title || "").trim()),
          summary: decodeHtmlEntities(String(n.summary || n.title || "").trim()),
          source: decodeHtmlEntities(String(n.publisher || "Yahoo Finance")),
          url: String(n.link || ""),
          publishedAt,
          imageUrl: img,
        } as RawStory;
      })
      .filter((s): s is RawStory => !!s && s.headline.length >= 12 && s.url.startsWith("http") && hasArticlePath(s.url) && !isOffTopicStory(s.headline, s.summary));
  } catch (err) {
    console.error(`[market-news] Yahoo search failed for "${query}":`, err);
    return [];
  }
}

async function fetchCryptoCompareNews(limit = 12): Promise<RawStory[]> {
  const url = "https://min-api.cryptocompare.com/data/v2/news/?lang=EN&sortOrder=latest";
  try {
    const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": UA }, cache: "no-store" });
    if (!res.ok) {
      console.error(`[market-news] CryptoCompare HTTP ${res.status}`);
      return [];
    }
    const json = (await res.json()) as { Data?: any[]; Err?: unknown };
    if (!Array.isArray(json.Data)) return [];
    return json.Data.slice(0, limit).flatMap((n) => {
      if (!n.published_on || !String(n.url || "").startsWith("http")) return [];
      const title = decodeHtmlEntities(String(n.title || ""));
      const body = decodeHtmlEntities(String(n.body || ""));
      return [{
        headline: title,
        summary: body.slice(0, 420) || title,
        source: decodeHtmlEntities(String(n.source_info?.name || n.source || "Crypto Wire")),
        url: String(n.url || n.guid || ""),
        publishedAt: n.published_on ? new Date(Number(n.published_on) * 1000) : new Date(NaN),
        imageUrl: n.imageurl ? String(n.imageurl) : undefined,
        marketHint: "CRYPTO" as const,
      }];
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
  const [rnz, bd, bbc, yahooAsxRss, yahooUsRss, yAsx, yNas, ySp] = await Promise.all([
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
  ]);

  // Prefer NZ/ASX/US market-moving items; keep some global macro.
  const nz = [...rnz, ...bd].slice(0, 10);
  const asx = [...yahooAsxRss, ...yAsx].slice(0, 10);
  const us = [...yahooUsRss, ...yNas, ...ySp].slice(0, 12);
  const global = bbc.slice(0, 6);

  return dedupeStories([...nz, ...asx, ...us, ...global]).sort(
    (a, b) => b.publishedAt.getTime() - a.publishedAt.getTime()
  );
}

async function loadCryptoStories(): Promise<RawStory[]> {
  const [cc, coindesk, ct, yahooBtc] = await Promise.all([
    fetchCryptoCompareNews(12),
    fetchRssStories("https://www.coindesk.com/arc/outboundfeeds/rss/", "CoinDesk", "CRYPTO"),
    fetchRssStories("https://cointelegraph.com/rss", "Cointelegraph", "CRYPTO"),
    fetchRssStories("https://finance.yahoo.com/rss/headline?s=BTC-USD,ETH-USD", "Yahoo Finance", "CRYPTO"),
  ]);
  return dedupeStories([...cc, ...coindesk, ...ct, ...yahooBtc]).sort(
    (a, b) => b.publishedAt.getTime() - a.publishedAt.getTime()
  );
}

/**
 * Async loader used by GET /api/market.
 * Live stories need a publisher date and an article link. Otherwise the
 * response is the dated official cards, not an invented wire.
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
      .flatMap((s) => {
        const item = toNewsItem(s, assetClass);
        return item ? [item] : [];
      })
      .sort((a, b) => b.relevance - a.relevance);

    const dated = prepareNewsFeed(live);
    console.log(`[market-news] Serving ${dated.length} dated ${assetClass} headlines (${live.length} from feeds)`);
    if (live.length >= 8) writeCache(cacheKey, dated);
    return dated;
  } catch (err) {
    console.error(`[market-news] loadMarketNews(${assetClass}) failed:`, err);
  }

  return prepareNewsFeed([]);
}
