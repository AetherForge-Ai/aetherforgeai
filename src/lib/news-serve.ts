import { isListedNewsSource } from "@/lib/news-sources";

/**
 * b29 H-15/H-13: the last gate before any server serves news. Only sources /trust names, and only
 * NZ/AU-relevant items (a "Global" Burry column came through one server unfiltered on b28).
 */
export function filterServableNews<T extends { headline: string; summary?: string; market: string; source?: string }>(items: T[]): T[] {
  return items.filter((item) => {
    if (!isListedNewsSource(item.source)) return false;
    if (item.market === "NZX" || item.market === "ASX") return true;
    if (item.source === "Reserve Bank of New Zealand") return true;
    // b33 H-13 (GOAL-LOCK #6): TT saw "Yahoo Finance · Global" cards on /market-news. A Global /
    // US / crypto item that merely mentions NZ or Australia still carried the Global label, which
    // the 7-day NZ/AU-only sample counts as a failure. Only NZX/ASX-tagged items (and RBNZ) are served.
    return false;
  });
}
