import { describe, expect, it } from "vitest";
import type { NewsItem } from "@/lib/market-intel";
import { prepareNewsFeed, sourceForUrl } from "@/lib/news-present";

const cpi: NewsItem = {
  headline: "US CPI prints cooler than expected; rate-cut odds for the next FOMC firm up",
  source: "Bloomberg",
  market: "US",
  impact: "Bullish",
  relevance: 90,
  time: "1h ago",
  summary: "US consumer inflation printed cooler than expected.",
  url: "https://www.bls.gov/cpi/",
};

const staleOcr: NewsItem = {
  headline: "RBNZ holds the OCR at 3.25%",
  source: "NZ Markets Daily",
  market: "NZX",
  impact: "Bullish",
  relevance: 96,
  time: "2h ago",
  summary: "The Reserve Bank left the Official Cash Rate unchanged at 3.25%.",
  url: "https://www.rbnz.govt.nz/",
};

describe("public market news", () => {
  it("labels the CPI card with the site the link opens", () => {
    expect(sourceForUrl(cpi.url, cpi.source)).toBe("U.S. Bureau of Labor Statistics");
    expect(sourceForUrl("https://www.fool.com/investing/example", "Yahoo Finance")).toBe("fool.com");
    const [first, second] = prepareNewsFeed([cpi, staleOcr]);
    expect(first.headline).toMatch(/2\.75%/);
    expect(first.source).toBe("Reserve Bank of New Zealand");
    expect(first.url).toContain("rbnz.govt.nz");
    expect(first.time).toBe("2 Sep 2026");
    expect(second.source).toBe("U.S. Bureau of Labor Statistics");
    expect(second.url).toBe("https://www.bls.gov/cpi/");
    expect(second.headline).not.toMatch(/cooler than expected/);
    expect(second.time).toMatch(/\d{4}/);
    expect(`${first.summary} ${second.summary}`).not.toMatch(/3\.25/);
  });

  it("drops an undated homepage item and keeps the dated official cards", () => {
    const feed = prepareNewsFeed([
      {
        headline: "Fonterra lifts farmgate milk-price forecast",
        source: "BusinessDesk",
        market: "NZX",
        impact: "Bullish",
        relevance: 80,
        time: "4h ago",
        summary: "Fonterra raised its forecast.",
        url: "https://www.fonterra.com/nz/en.html",
      },
    ]);
    expect(feed.find((item) => item.headline.includes("Fonterra"))).toBeUndefined();
    for (const item of feed) {
      expect(item.time).not.toMatch(/ago|just now/i);
      expect(item.publishedOn).toMatch(/^\d{4}-\d{2}-\d{2}/);
    }
    expect(feed[0]?.headline).toMatch(/2\.75%/);
    expect(feed.some((item) => item.url === "https://www.bls.gov/cpi/")).toBe(true);
  });

  it("keeps a dated article and names the site the link opens", () => {
    const feed = prepareNewsFeed([
      {
        headline: "Fonterra publishes a milk-price note",
        source: "BusinessDesk",
        market: "NZX",
        impact: "Neutral",
        relevance: 80,
        time: "4h ago",
        publishedOn: "2026-09-12",
        summary: "A dated note on the Fonterra site.",
        url: "https://www.fonterra.com/nz/en/news/milk-price.html",
      },
    ]);
    const item = feed.find((row) => row.url.includes("fonterra.com"));
    expect(item?.source).toBe("Fonterra");
    expect(item?.time).toMatch(/12 Sept? 2026/);
  });
});
