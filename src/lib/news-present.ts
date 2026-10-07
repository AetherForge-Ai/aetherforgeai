import type { NewsItem } from "@/lib/market-intel";

/**
 * Official cash rate as published by the Reserve Bank of New Zealand.
 * Fetched 4 October 2026 from the page below: 2.75%, updated 2:00pm on 2 September 2026,
 * next decision 2:00pm on 28 October 2026.
 * https://www.rbnz.govt.nz/monetary-policy/about-monetary-policy/the-official-cash-rate
 */
export const OFFICIAL_OCR_NEWS: NewsItem = {
  headline: "RBNZ Official Cash Rate is 2.75%",
  source: "Reserve Bank of New Zealand",
  market: "NZX",
  impact: "Neutral",
  relevance: 98,
  time: "2 Sep 2026",
  publishedOn: "2026-09-02",
  summary:
    "The Reserve Bank of New Zealand shows the Official Cash Rate at 2.75%, updated at 2:00pm on 2 September 2026. The next decision is scheduled for 2:00pm on 28 October 2026. This figure is the Bank's published rate.",
  url: "https://www.rbnz.govt.nz/monetary-policy/about-monetary-policy/the-official-cash-rate",
};

/**
 * BLS CPI home page, fetched 4 October 2026. The page states the next release;
 * it does not say the September 2026 index has been published. The date on this
 * card is that printed release date.
 */
export const BLS_CPI_NEWS: NewsItem = {
  headline: "BLS has scheduled the September 2026 CPI release",
  source: "U.S. Bureau of Labor Statistics",
  market: "US",
  impact: "Neutral",
  relevance: 90,
  time: "4 Oct 2026 · Scheduled: 14 Oct",
  publishedOn: "2026-10-04",
  scheduledFor: "2026-10-14",
  summary:
    "The U.S. Bureau of Labor Statistics CPI page lists a future release. This card is the schedule we collected on 4 October 2026. The index itself was not on the page when this card was written.",
  url: "https://www.bls.gov/cpi/",
};

const HOST_PUBLISHER: Array<[string, string]> = [
  ["bls.gov", "U.S. Bureau of Labor Statistics"],
  ["rbnz.govt.nz", "Reserve Bank of New Zealand"],
  ["bloomberg.com", "Bloomberg"],
  ["fonterra.com", "Fonterra"],
  ["fphcare.com", "Fisher & Paykel Healthcare"],
  ["asx.com.au", "ASX"],
  ["commbank.com.au", "Commonwealth Bank"],
  ["woodside.com", "Woodside Energy"],
  ["nvidia.com", "NVIDIA"],
  ["morningstar.com", "Morningstar"],
  ["marketwatch.com", "MarketWatch"],
  ["aucklandairport.co.nz", "Auckland Airport"],
  ["coindesk.com", "CoinDesk"],
  ["theblock.co", "The Block"],
  ["blockworks.co", "Blockworks"],
  ["glassnode.com", "Glassnode"],
  ["reuters.com", "Reuters"],
  ["kaiko.com", "Kaiko"],
  ["l2beat.com", "L2Beat"],
  ["cryptoquant.com", "CryptoQuant"],
  ["deribit.com", "Deribit"],
  ["messari.io", "Messari"],
  ["cointelegraph.com", "Cointelegraph"],
  ["finance.yahoo.com", "Yahoo Finance"],
  ["yahoo.com", "Yahoo Finance"],
  ["rnz.co.nz", "RNZ"],
  ["bbc.com", "BBC"],
  ["bbc.co.uk", "BBC"],
];

/**
 * Publisher name that matches the host the reader will open.
 * An unmapped host is shown as that host, never as the feed that carried the link.
 */
export function sourceForUrl(url: string, fallback: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    for (const [domain, name] of HOST_PUBLISHER) {
      if (host === domain || host.endsWith(`.${domain}`)) return name;
    }
    return host;
  } catch {
    return fallback;
  }
}

const OFF_TOPIC =
  /\b(froyo|frozen yogh?urt|jaguar|bin collectors?|election debates?|lifestyle|celebrity|red carpet|recipe|premiere|stuntwomen|carjacking|liquor licences)\b/i;

const MARKET_SIGNAL =
  /\b(share|shares|stock|stocks|market|markets|nzx|asx|nasdaq|dow|s&p|rbnz|rba|ocr|cpi|inflation|gdp|earnings|dividend|ipo|bond|currency|oil|iron|bank|bitcoin|crypto|ethereum|fed|fomc|treasury|index|investor|trading|economy|economic|fonterra|profit|revenue|nzd|usd|aud|gold|silver|commodity|equity|listing|cash rate|interest)\b/i;

const CRYPTO_HOST = /(beincrypto|coindesk|cointelegraph|theblock|decrypt|cryptoslate)\./i;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Lifestyle, motoring and other non-market headlines. */
export function isOffTopicStory(headline: string, summary = ""): boolean {
  const blob = `${headline} ${summary}`;
  if (OFF_TOPIC.test(blob)) return true;
  return !MARKET_SIGNAL.test(blob);
}

export function aucklandDay(when: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Pacific/Auckland",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(when);
}

export function scheduledLabel(isoDay: string): string {
  const [, month, day] = isoDay.slice(0, 10).split("-");
  const monthName = MONTHS[Number(month) - 1] || month;
  return `Scheduled: ${Number(day)} ${monthName}`;
}

function isNzMacro(item: NewsItem): boolean {
  const blob = `${item.headline} ${item.summary} ${item.source} ${item.url}`;
  if (/rbnz|reserve bank of new zealand|official cash rate|\bocr\b/i.test(blob)) return true;
  const rnz = item.source === "RNZ" || /rnz\.co\.nz/i.test(item.url);
  return rnz && /\b(ocr|official cash rate|cpi|inflation|gdp|unemployment|monetary policy|interest rate|reserve bank)\b/i.test(blob);
}

function withDisplayTags(item: NewsItem): NewsItem {
  const next: NewsItem = { ...item };
  if (CRYPTO_HOST.test(item.url)) next.market = "CRYPTO";
  if (isNzMacro(next)) next.marketLabel = "NZ macro";
  return next;
}

/** Card date is the publish or collection day. A future event is labelled Scheduled. */
export function presentNewsTiming(item: NewsItem, now = new Date()): NewsItem {
  const today = aucklandDay(now);
  const published = (item.publishedOn || "").slice(0, 10);
  const scheduled = (item.scheduledFor || "").slice(0, 10);
  const next = withDisplayTags(item);
  if (scheduled && scheduled > today) {
    const collected = published && published <= today ? published : today;
    return {
      ...next,
      publishedOn: collected,
      scheduledFor: scheduled,
      time: `${formatNewsDate(collected)} · ${scheduledLabel(scheduled)}`,
    };
  }
  if (published && published > today) {
    return {
      ...next,
      publishedOn: today,
      scheduledFor: published,
      time: `${formatNewsDate(today)} · ${scheduledLabel(published)}`,
    };
  }
  if (published) {
    return { ...next, publishedOn: published, time: formatNewsDate(published) };
  }
  return next;
}

export function formatNewsDate(when: string | Date): string {
  const date = typeof when === "string" ? new Date(when.length === 10 ? `${when}T00:00:00+12:00` : when) : when;
  if (Number.isNaN(date.getTime())) return "Date not stated";
  return date.toLocaleDateString("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Pacific/Auckland",
  });
}

function isStaleOcr(item: NewsItem): boolean {
  const blob = `${item.headline} ${item.summary}`;
  return /official cash rate|\bOCR\b/i.test(blob) && /3\.25/.test(blob);
}

function isCpiPointer(item: NewsItem): boolean {
  return /bls\.gov\/cpi/i.test(item.url) || /US CPI prints cooler/i.test(item.headline);
}

/** Dated official cards. These are the only headlines the desk will show without a publisher timestamp. */
export function officialPublicNews(): NewsItem[] {
  return [OFFICIAL_OCR_NEWS, BLS_CPI_NEWS];
}

/** A link with a real path. A bare homepage is not an article. */
export function hasArticlePath(url: string): boolean {
  try {
    const path = new URL(url).pathname.replace(/\/+$/, "");
    return path.length > 1;
  } catch {
    return false;
  }
}

/**
 * Public news list. The source name follows the link. Every card has a calendar
 * date. Items with no publisher date are dropped — a date is not invented.
 * The stale 3.25% cash-rate line is replaced by the Reserve Bank card.
 */
export function prepareNewsFeed(items: NewsItem[], now = new Date()): NewsItem[] {
  const prepared: NewsItem[] = [];
  let hasOcr = false;
  let hasCpi = false;

  for (const item of items) {
    if (isStaleOcr(item)) continue;
    if (item.headline === OFFICIAL_OCR_NEWS.headline || item.url.includes("the-official-cash-rate")) {
      if (hasOcr) continue;
      hasOcr = true;
      prepared.push(OFFICIAL_OCR_NEWS);
      continue;
    }
    if (isCpiPointer(item)) {
      if (hasCpi) continue;
      hasCpi = true;
      prepared.push(BLS_CPI_NEWS);
      continue;
    }
    if (!item.publishedOn || !hasArticlePath(item.url)) continue;
    if (isOffTopicStory(item.headline, item.summary)) continue;
    prepared.push({
      ...item,
      source: sourceForUrl(item.url, item.source),
    });
  }

  if (!hasOcr) prepared.unshift(OFFICIAL_OCR_NEWS);
  if (!hasCpi) {
    const at = prepared.findIndex((item) => item.headline === OFFICIAL_OCR_NEWS.headline);
    prepared.splice(at + 1, 0, BLS_CPI_NEWS);
  }
  return prepared.map((item) => presentNewsTiming(item, now));
}
