import { vi } from "vitest";
vi.mock("server-only", () => ({}));
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { tidyHeadline, summaryRepeatsHeadline, presentNewsTiming } from "@/lib/news-present";
import { keywordSentiment } from "@/lib/news-sentiment";
import type { NewsItem } from "@/lib/market-intel";

describe("TT fresh M10 — /how-it-works", () => {
  it("no flows/news/sentiment or confidence-score claims", () => {
    const page = readFileSync("src/app/how-it-works/page.tsx", "utf8");
    expect(page).not.toMatch(/synthesising flows|confidence scores|Probabilistic/);
    expect(page).toContain("rules-based engine");
  });
});

describe("TT fresh M11 — /market-news", () => {
  it("drops a stray quote and a repeated summary", () => {
    expect(tidyHeadline("Heating oil users face fuel or food winter choice'")).toBe("Heating oil users face fuel or food winter choice");
    expect(tidyHeadline("'Quoted' headline")).toBe("'Quoted' headline");
    expect(summaryRepeatsHeadline("Dow Jones Futures: Techs Rise", "Dow Jones Futures: Techs Rise")).toBe(true);
    expect(summaryRepeatsHeadline("A", "Something else entirely")).toBe(false);
  });
  it("UNH outpacing the S&P is not Bearish", () => {
    expect(keywordSentiment("UNH Stock Outpaces S&P 500, Eyes Best Year").sentiment).toBe("Bullish");
  });
  it("a general RNZ story is not tagged NZX", () => {
    const item = { headline: "The Kiwis avoiding the big supermarkets", summary: "", source: "RNZ", url: "https://www.rnz.co.nz/news/x", market: "NZX", impact: "Neutral", relevance: 50, time: "" } as unknown as NewsItem;
    expect(presentNewsTiming(item).marketLabel).toBe("NZ news");
  });
});
