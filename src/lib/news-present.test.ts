import { describe, expect, it } from "vitest";
import type { NewsItem } from "@/lib/market-intel";
import { isOffTopicStory, prepareNewsFeed, sourceForUrl } from "@/lib/news-present";

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
    expect(first.time).toMatch(/2 Sept? 2026/);
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
    expect(item?.headline).toBe("Fonterra publishes a milk-price note");
    expect(item?.url).toBe("https://www.fonterra.com/nz/en/news/milk-price.html");
    expect(item?.time).toMatch(/12 Sept? 2026/);
  });

  it("drops a publisher story with a signal word instead of rewriting the headline or url", () => {
    const headline = "3 Reasons to Sell CHD and 1 Stock to Buy Instead";
    const url = "https://finance.yahoo.com/news/3-reasons-sell-chd-1-144847718.html";
    const feed = prepareNewsFeed([
      {
        headline,
        source: "Yahoo Finance",
        market: "US",
        impact: "Neutral",
        relevance: 40,
        time: "1d ago",
        publishedOn: "2026-10-06",
        summary: "A publisher note.",
        url,
      },
    ]);
    const blob = JSON.stringify(feed);
    expect(blob).not.toContain(headline);
    expect(blob).not.toContain("3-reasons-");
    expect(blob).not.toContain("CHD");
  });

  it("keeps macro stories that say hold or reduces, and still drops a sell recommendation", () => {
    const feed = prepareNewsFeed([
      {
        headline: "Fed to hold rates",
        source: "Reuters",
        market: "US",
        impact: "Neutral",
        relevance: 70,
        time: "1d ago",
        publishedOn: "2026-10-06",
        summary: "The Federal Reserve is set to hold rates.",
        url: "https://www.reuters.com/markets/us/fed-to-hold-rates",
      },
      {
        headline: "RBA reduces cash rate",
        source: "Reuters",
        market: "ASX",
        impact: "Bullish",
        relevance: 70,
        time: "1d ago",
        publishedOn: "2026-10-06",
        summary: "The Reserve Bank reduces the cash rate.",
        url: "https://www.reuters.com/markets/australia/rba-reduces-cash-rate",
      },
      {
        headline: "3 Reasons to Sell CHD and 1 Stock to Buy Instead",
        source: "Yahoo Finance",
        market: "US",
        impact: "Neutral",
        relevance: 40,
        time: "1d ago",
        publishedOn: "2026-10-06",
        summary: "A publisher recommendation.",
        url: "https://finance.yahoo.com/news/3-reasons-sell-chd-1-144847718.html",
      },
    ]);
    const hold = feed.find((item) => item.headline === "Fed to hold rates");
    const rba = feed.find((item) => item.headline === "RBA reduces cash rate");
    expect(hold?.url).toBe("https://www.reuters.com/markets/us/fed-to-hold-rates");
    expect(rba?.headline).toBe("RBA reduces cash rate");
    expect(rba?.url).toBe("https://www.reuters.com/markets/australia/rba-reduces-cash-rate");
    expect(feed.some((item) => /sell chd/i.test(item.headline))).toBe(false);
    expect(JSON.stringify(feed)).not.toContain("3-reasons-sell-chd");
  });

  it("drops mis-tagged election, France, UK miner and data-release stories", () => {
    const feed = prepareNewsFeed([
      {
        headline: "Election 2026 first leaders' debate billed as a Royal Rumble",
        source: "RNZ",
        market: "NZX",
        impact: "Neutral",
        relevance: 40,
        time: "1d ago",
        publishedOn: "2026-10-06",
        summary: "A politics story carried on a market feed.",
        url: "https://www.rnz.co.nz/news/political/leaders-debate",
      },
      {
        headline: "France's appetite for magic money meets the debt market",
        source: "Reuters",
        market: "NZX",
        impact: "Bearish",
        relevance: 50,
        time: "1d ago",
        publishedOn: "2026-10-06",
        summary: "Paris is still funding the deficit.",
        url: "https://www.reuters.com/markets/europe/france-debt-note",
      },
      {
        headline: "Deutsche Bank raises targets on UK miners",
        source: "Reuters",
        market: "ASX",
        impact: "Bullish",
        relevance: 50,
        time: "1d ago",
        publishedOn: "2026-10-06",
        summary: "London-listed mining names were marked higher.",
        url: "https://www.reuters.com/markets/uk-miners-note",
      },
      {
        headline: "Data Virtualization – Global Strategic Business Report",
        source: "GlobeNewswire",
        market: "US",
        impact: "Neutral",
        relevance: 30,
        time: "1d ago",
        publishedOn: "2026-10-06",
        summary: "A press release about a software market.",
        url: "https://www.globenewswire.com/news-release/data-virtualization-report",
      },
    ]);
    const titles = feed.map((item) => item.headline).join(" ");
    expect(titles).not.toMatch(/leaders' debate|France|UK miners|Data Virtualization/i);
  });

  it("dates future events as scheduled, labels NZ macro, and drops lifestyle stories", () => {
    const now = new Date("2026-10-07T12:00:00+13:00");
    const feed = prepareNewsFeed(
      [
        {
          headline: "Froyo's made a comeback in London cafes",
          source: "BBC",
          market: "Global",
          impact: "Neutral",
          relevance: 20,
          time: "1d ago",
          publishedOn: "2026-10-06",
          summary: "A lifestyle piece about frozen yogurt.",
          url: "https://www.bbc.com/news/articles/froyo-comeback",
        },
        {
          headline: "Jaguar unveils a new electric concept",
          source: "BBC",
          market: "Global",
          impact: "Neutral",
          relevance: 20,
          time: "1d ago",
          publishedOn: "2026-10-06",
          summary: "A car story from the business feed.",
          url: "https://www.bbc.com/news/articles/jaguar-unveils",
        },
        {
          headline: "Auckland bin collectors dumped a new roster",
          source: "RNZ",
          market: "NZX",
          impact: "Neutral",
          relevance: 70,
          time: "1d ago",
          publishedOn: "2026-10-06",
          summary: "A council story that is not a market story.",
          url: "https://www.rnz.co.nz/news/national/bin-collectors",
        },
        {
          headline: "RNZ reports inflation steadied ahead of the next OCR decision",
          source: "RNZ",
          market: "NZX",
          impact: "Neutral",
          relevance: 80,
          time: "1d ago",
          publishedOn: "2026-10-05",
          summary: "A macro note on inflation and the Reserve Bank.",
          url: "https://www.rnz.co.nz/news/business/inflation-ocr",
        },
        {
          headline: "Bitcoin dips below $84,000 as traders watch the S&P",
          source: "BeInCrypto",
          market: "US",
          impact: "Bullish",
          relevance: 60,
          time: "1d ago",
          publishedOn: "2026-10-06",
          summary: "A crypto desk note that mentions the S&P.",
          url: "https://beincrypto.com/bitcoin-sp-note",
        },
      ],
      now
    );

    expect(isOffTopicStory("Election debates return to Auckland", "Leaders met last night")).toBe(true);
    const titles = feed.map((item) => item.headline).join(" ");
    expect(titles).not.toMatch(/froyo|jaguar|bin collectors|election debate/i);
    const rnz = feed.find((item) => item.url.includes("inflation-ocr"));
    expect(rnz?.marketLabel).toBe("NZ macro");
    expect(feed.find((item) => item.url.includes("the-official-cash-rate"))?.marketLabel).toBe("NZ macro");
    const crypto = feed.find((item) => item.url.includes("beincrypto.com"));
    expect(crypto?.market).toBe("CRYPTO");
    const cpi = feed.find((item) => item.url === "https://www.bls.gov/cpi/");
    expect(cpi?.time).toContain("Scheduled: 14 Oct");
    expect(cpi?.publishedOn && cpi.publishedOn <= "2026-10-07").toBe(true);
    for (const item of feed) {
      expect(item.publishedOn && item.publishedOn <= "2026-10-07").toBe(true);
    }
  });
});
