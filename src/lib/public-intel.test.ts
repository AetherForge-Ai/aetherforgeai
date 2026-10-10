import { describe, expect, it } from "vitest";
import { PUBLIC_ADVICE_LEAK, publisherTextHasSignalWord, technicalSnapshot, toPublicPayload } from "./public-intel";

describe("public market payloads", () => {
  it("drops ratings, conviction and sizing language", () => {
    const payload = toPublicPayload({
      universe: [
        {
          ticker: "AIR.NZ",
          market: "NZX",
          rsi: 28,
          vsSma20: -3.2,
          regime: "High Volatility",
          dailyVolPct: 3.4,
          signal: "Strong Buy",
          conviction: "Speculative",
          convictionReason: "elevated realised volatility widens the outcome range — size positions small",
          reasoning: "Strong Buy · RSI 10 is oversold — mean-reversion setup. 7-day model projects +55%.",
          macdSignal: "Bullish",
        },
        {
          ticker: "BHP.AX",
          market: "ASX",
          rsi: 74,
          vsSma20: 2,
          regime: "Trending Up",
          signal: "Sell",
          conviction: "High",
          convictionReason: "strong directional edge",
          reasoning: "Sell · MACD histogram is negative.",
        },
      ],
      news: [
        {
          headline: "Fed may Reduce rates",
          summary: "Traders sell into the print. Strong Buy chatter.",
          url: "https://finance.yahoo.com/news/fed-may-sell-rates.html",
        },
        {
          headline: "Fonterra publishes a milk-price note",
          summary: "A dated note on the Fonterra site.",
          url: "https://www.fonterra.com/nz/en/news/milk-price.html",
        },
      ],
    });

    const json = JSON.stringify(payload);
    expect(json).not.toMatch(PUBLIC_ADVICE_LEAK);
    expect(json).not.toMatch(/size positions/i);
    expect(json).not.toContain("Fed may");
    expect(json).not.toContain("fed-may-sell-rates");
    expect(json).toContain("Fonterra publishes a milk-price note");
    expect(json).toContain("https://www.fonterra.com/nz/en/news/milk-price.html");
    expect(json).toContain("Technical snapshot:");
    expect(json).toContain("oversold");
    expect(json).toContain("above its 20-day average");
    expect(technicalSnapshot({ rsi: 10, vsSma20: -4, regime: "High Volatility" })).toBe(
      "Technical snapshot: RSI 10 (oversold), below its 20-day average. Volatility: high.",
    );
  });

  it("leaves every field of a kept publisher story unchanged", () => {
    const imageUrl = "https://img.example.com/sell-off-reduced.jpg";
    const source = "Reuters sell desk";
    const payload = toPublicPayload({
      news: [
        {
          headline: "Fonterra publishes a milk-price note",
          summary: "A dated note on the Fonterra site.",
          url: "https://www.fonterra.com/nz/en/news/milk-price.html",
          imageUrl,
          source,
        },
      ],
    });
    const story = (payload as { news: Array<Record<string, string>> }).news[0];
    expect(story.imageUrl).toBe(imageUrl);
    expect(story.source).toBe(source);
    expect(story.headline).toBe("Fonterra publishes a milk-price note");
    expect(story.url).toBe("https://www.fonterra.com/nz/en/news/milk-price.html");
  });

  it("drops stock better-buy headlines and keeps other which-is-better questions", () => {
    expect(publisherTextHasSignalWord("HRMY vs. CSLLY: Which Stock Is the Better Value Option?")).toBe(true);
    expect(publisherTextHasSignalWord("Apple vs. Microsoft: Which is the better buy")).toBe(true);
    expect(publisherTextHasSignalWord("Better Buy: two listed names")).toBe(true);
    expect(publisherTextHasSignalWord("Gold vs. bitcoin: which is the better inflation hedge?")).toBe(false);
    expect(publisherTextHasSignalWord("Stocks vs. bonds: which will win as the Fed cuts?")).toBe(false);

    const payload = toPublicPayload({
      news: [
        {
          headline: "HRMY vs. CSLLY: Which Stock Is the Better Value Option?",
          summary: "A comparison of two listed names.",
          url: "https://finance.yahoo.com/news/hrmy-vs-cslly-better-value",
        },
        {
          headline: "Apple vs. Microsoft: Which is the better buy",
          summary: "A Better Buy comparison of two stocks.",
          url: "https://finance.yahoo.com/news/apple-vs-microsoft-better-buy",
        },
        {
          headline: "Gold vs. bitcoin: which is the better inflation hedge?",
          summary: "A comparison of gold and bitcoin.",
          url: "https://www.reuters.com/markets/gold-vs-bitcoin-hedge",
        },
        {
          headline: "Stocks vs. bonds: which will win as the Fed cuts?",
          summary: "Stocks and bonds ahead of a Fed cut.",
          url: "https://www.reuters.com/markets/us/stocks-vs-bonds-fed-cuts",
        },
      ],
    });
    const headlines = (payload as { news: Array<{ headline: string; url: string }> }).news.map((item) => item.headline);
    expect(headlines).toEqual([
      "Gold vs. bitcoin: which is the better inflation hedge?",
      "Stocks vs. bonds: which will win as the Fed cuts?",
    ]);
    const urls = (payload as { news: Array<{ url: string }> }).news.map((item) => item.url);
    expect(urls).toEqual([
      "https://www.reuters.com/markets/gold-vs-bitcoin-hedge",
      "https://www.reuters.com/markets/us/stocks-vs-bonds-fed-cuts",
    ]);
  });
});
