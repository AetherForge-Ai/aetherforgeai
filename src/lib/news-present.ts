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
  headline: "BLS schedules the September 2026 CPI for 14 October 2026",
  source: "U.S. Bureau of Labor Statistics",
  market: "US",
  impact: "Neutral",
  relevance: 90,
  time: "14 Oct 2026",
  publishedOn: "2026-10-14",
  summary:
    "The U.S. Bureau of Labor Statistics CPI page says the Consumer Price Index for September 2026 is scheduled to be released on 14 October 2026 at 8:30 a.m. Eastern Time. This card links to that page. The index itself was not on the page when this card was written.",
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
export function prepareNewsFeed(items: NewsItem[]): NewsItem[] {
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
    prepared.push({
      ...item,
      source: sourceForUrl(item.url, item.source),
      time: formatNewsDate(item.publishedOn),
    });
  }

  if (!hasOcr) prepared.unshift(OFFICIAL_OCR_NEWS);
  if (!hasCpi) {
    const at = prepared.findIndex((item) => item.headline === OFFICIAL_OCR_NEWS.headline);
    prepared.splice(at + 1, 0, BLS_CPI_NEWS);
  }
  return prepared;
}
