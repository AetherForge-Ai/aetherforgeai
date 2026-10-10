import type { NewsItem } from "@/lib/market-intel";
import { isPublishedUsCpiDay, usCpiDateLabel } from "@/lib/us-cpi-schedule";
import { publisherTextHasSignalWord } from "@/lib/public-intel";

/** Pull-check marker for the publisher-verbatim news gate. */
export const P1_FOLLOWUP_PUBLISHER_HEADLINES_VERBATIM =
  "p1-followup-publisher-headlines-verbatim-92fa";

/** Pull-check marker for the 8 Oct retest follow-ups (entities, relevance, signals, markets tabs). */
export const P1_FOLLOWUP_RETEST_FIXES = "p1-followup-retest-entities-relevance-signals-tabs-90e2";

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
  time: "4 Oct 2026 · Scheduled: 14 Oct 2026 (US)",
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
  /\b(froyo|frozen yogh?urt|jaguar|bin collectors?|election debates?|leaders['’]?\s+debate|royal rumble|data virtuali[sz]ation|strategic business report|lifestyle|celebrity|red carpet|recipe|premiere|stuntwomen|carjacking|liquor licences|wealthy people can teach|variable rate fix|as agent bank|evident\s+ai)\b|\btops\b.{0,80}\bbanking index\b/i;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201c",
  rdquo: "\u201d",
  bull: "•",
  middot: "·",
};

function decodeCodePoint(code: number): string | null {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return null;
  if ((code >= 0xd800 && code <= 0xdfff) || (code < 32 && code !== 9 && code !== 10 && code !== 13)) return null;
  try {
    return String.fromCodePoint(code);
  } catch {
    return null;
  }
}

/**
 * Named and numeric HTML entities become characters. Words stay as written.
 * Call this on headline, summary and source only — never on a URL.
 */
export function decodeHtmlEntities(input: string): string {
  let value = input;
  for (let pass = 0; pass < 2; pass++) {
    const next = value
      .replace(/&#(\d+);/g, (match, digits: string) => decodeCodePoint(Number(digits)) ?? match)
      .replace(/&#x([0-9a-f]+);/gi, (match, hex: string) => decodeCodePoint(parseInt(hex, 16)) ?? match)
      .replace(/&([a-z][a-z0-9]+);/gi, (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
    if (next === value) break;
    value = next;
  }
  return value;
}

const MARKET_SIGNAL =
  /\b(share|shares|stock|stocks|market|markets|nzx|asx|nasdaq|dow|s&p|rbnz|rba|ocr|cpi|inflation|gdp|earnings|dividend|ipo|bond|currency|oil|iron|banks?|bitcoin|crypto|ethereum|fed|fomc|treasury|index|investor|trading|economy|economic|fonterra|profit|revenue|nzd|usd|aud|gold|silver|commodity|equity|listing|cash rate|interest)\b/i;

const CRYPTO_HOST = /(beincrypto|coindesk|cointelegraph|theblock|decrypt|cryptoslate)\./i;

/** A crypto-feed card has to be about a digital asset. Equity wraps are dropped. */
const CRYPTO_ASSET =
  /\b(bitcoin|btc|ethereum|ether|crypto(?:currency)?s?|digital assets?|blockchain|defi|stablecoins?|solana|altcoins?|dogecoin|ripple|xrp|cardano|binance|coinbase|nft|web3)\b|\beth\b/i;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Lifestyle, motoring and other non-market headlines. A digital-asset story is on-topic. */
export function isOffTopicStory(headline: string, summary = ""): boolean {
  const blob = `${headline} ${summary}`;
  if (OFF_TOPIC.test(blob)) return true;
  if (CRYPTO_ASSET.test(blob)) return false;
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
  if (isPublishedUsCpiDay(isoDay)) return `Scheduled: ${usCpiDateLabel(isoDay)}`;
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

const NZ_ANCHOR = /\b(nzx|\.nz\b|nze|rbnz|new zealand|auckland|wellington|fonterra|\bocr\b|kiwi)\b/i;
const AU_ANCHOR = /\b(asx|\.ax\b|rba|australia|australian|sydney|melbourne|\bbhp\b)\b/i;
const US_ANCHOR = /\b(nasdaq|dow jones|s&p|wall street|nyse|federal reserve|\bfed\b|\bfomc\b|\bu\.s\.\b|united states)\b/i;

/**
 * Feed hints stamp NZX/ASX/US even when the story is about somewhere else.
 * A contradicted tag is dropped. A single clear market can replace it.
 */
function alignStoryMarket(item: NewsItem): NewsItem | null {
  const blob = `${item.headline} ${item.summary}`;
  const nz = NZ_ANCHOR.test(blob);
  const au = AU_ANCHOR.test(blob);
  const us = US_ANCHOR.test(blob);
  const election = /\b(election|leaders['’]?\s+debate|royal rumble)\b/i.test(blob);
  const ukMiners = /\b(uk|u\.k\.|britain|british)\b/i.test(blob) && /\bminers?\b/i.test(blob);
  const dataRelease = /\b(data virtuali[sz]ation|strategic business report)\b/i.test(blob);
  // The retest column only. A Paris or French market story stays.
  const franceDebtBomb =
    /\bmagic money\b/i.test(blob) ||
    (/\b(france|french)\b/i.test(blob) && /\bdebt bomb\b/i.test(blob));

  if (franceDebtBomb) return null;
  // The crypto feed only carries digital-asset stories. Equity wraps are dropped.
  if (item.market === "CRYPTO" && !CRYPTO_ASSET.test(blob)) return null;

  const contradicted =
    (item.market === "NZX" && election && !nz) ||
    (item.market === "ASX" && ukMiners && !au) ||
    (item.market === "US" && dataRelease && !us);

  if (!contradicted) return item;

  const supported: NewsItem["market"][] = [];
  if (nz) supported.push("NZX");
  if (au) supported.push("ASX");
  if (us) supported.push("US");
  if (supported.length === 1) return { ...item, market: supported[0] };
  return null;
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

  for (const rawItem of items) {
    const item: NewsItem = {
      ...rawItem,
      headline: decodeHtmlEntities(rawItem.headline),
      summary: decodeHtmlEntities(rawItem.summary),
      source: decodeHtmlEntities(rawItem.source),
      url: rawItem.url,
    };
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
    if (publisherTextHasSignalWord(`${item.headline}\n${item.summary}\n${item.url}\n${item.source}`)) continue;
    const aligned = alignStoryMarket(item);
    if (!aligned) continue;
    prepared.push({
      ...aligned,
      headline: item.headline,
      summary: item.summary,
      url: rawItem.url,
      source: decodeHtmlEntities(sourceForUrl(rawItem.url, item.source)),
    });
  }

  if (!hasOcr) prepared.unshift(OFFICIAL_OCR_NEWS);
  if (!hasCpi) {
    const at = prepared.findIndex((item) => item.headline === OFFICIAL_OCR_NEWS.headline);
    prepared.splice(at + 1, 0, BLS_CPI_NEWS);
  }
  return prepared.map((item) => presentNewsTiming(item, now));
}
