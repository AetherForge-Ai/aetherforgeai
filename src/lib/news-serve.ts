import { hasNzAuAnchor, isNewsRelevant } from "@/lib/market-news";
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
    // Global / US / crypto items need an NZ/AU anchor of their own (a source hint is not enough).
    if (!hasNzAuAnchor(`${item.headline} ${item.summary ?? ""}`)) return false;
    return isNewsRelevant({ headline: item.headline, summary: item.summary, market: item.market as any, source: item.source });
  });
}
