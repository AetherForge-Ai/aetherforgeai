import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import sitemap from "@/app/sitemap";
import { parseAllMarketsExchange, parseAllMarketsPage } from "@/lib/all-markets-query";
import { parseMarketsTab } from "@/lib/market-detail-routes";
import { boardCoverage, findListing, isSitemapStock, listingsFor } from "@/lib/stock-catalog";
import {
  FUND_TYPE_NOTE,
  PRICE_NOT_IN_RESPONSE,
  breakerIsOpen,
  coverageSentence,
  freshBreaker,
  hasRecentVerifiedPrice,
  isDerivativeOrTestSecurity,
  listingSentence,
  noteProviderResult,
  quoteWithProviders,
  resolveEquityPrint,
  unpricedFootnote,
  usPageShouldNoindex,
  type EquityPrint,
  type SavedPrint,
} from "@/lib/stock-markets";

const yahoo = (price: number, changePct = 1): EquityPrint => ({
  price,
  changePct,
  quotedAt: "2026-10-09T03:55:00.000Z",
  source: "Yahoo Finance",
});

const saved = (price: number): SavedPrint => ({
  price,
  changePct: 0.5,
  quotedAt: "2026-10-08T03:55:00.000Z",
  source: "Last good",
});

describe("stock board coverage", () => {
  it("uses the audited counts and the Showing N of M line", () => {
    expect(coverageSentence(60, 178)).toBe("Showing 60 of 178 listed");
    expect(coverageSentence(212, 1923)).toBe("Showing 212 of 1923 listed");
    expect(coverageSentence(30, 30)).toBe("Showing 30 of 30 listed");
    expect(coverageSentence(4376, 4376)).toBe("Showing 4376 of 4376 listed");
    expect(coverageSentence(3290, 2900)).toBe("Showing 3290 of 3290 listed");

    expect(boardCoverage("NZX")).toMatchObject({ shown: 60, listed: 178, line: "Showing 60 of 178 listed" });
    expect(boardCoverage("ASX")).toMatchObject({ shown: 212, listed: 1923, line: "Showing 212 of 1923 listed" });
    expect(boardCoverage("DOW")).toMatchObject({ shown: 30, listed: 30, line: "Showing 30 of 30 listed" });
    const nasdaqAll = listingsFor("NASDAQ");
    const nasdaqOrdinary = nasdaqAll.filter((row) => !isDerivativeOrTestSecurity(row.ticker, row.name));
    const nyseAll = listingsFor("NYSE");
    const nyseOrdinary = nyseAll.filter((row) => !isDerivativeOrTestSecurity(row.ticker, row.name));
    expect(nasdaqOrdinary.length).toBeLessThan(nasdaqAll.length);
    expect(nyseOrdinary.length).toBeLessThan(nyseAll.length);
    expect(boardCoverage("NASDAQ")).toMatchObject({
      shown: nasdaqOrdinary.length,
      listed: nasdaqOrdinary.length,
    });
    expect(boardCoverage("NASDAQ").line).toBe(
      `Showing ${nasdaqOrdinary.length} of ${nasdaqOrdinary.length} listed. This count is ordinary names. Warrants, units and rights are not included.`
    );
    expect(boardCoverage("NYSE").line).toBe(
      `Showing ${nyseOrdinary.length} of ${nyseOrdinary.length} listed. This count is ordinary names. Warrants, units and rights are not included.`
    );
    expect(boardCoverage("NASDAQ", { includeDerivatives: true }).line).toBe(
      `Showing ${nasdaqAll.length} of ${nasdaqAll.length} listed. This count includes warrants, units and rights.`
    );
    expect(boardCoverage("NYSE", { includeDerivatives: true }).shown).toBe(nyseAll.length);
    expect(boardCoverage("NASDAQ").line).not.toMatch(/5622|2900|directory file/);
    expect(boardCoverage("NYSE").line).not.toMatch(/5622|2900|directory file/);

    expect(findListing("FBU.NZ")?.name).toBe("Fletcher Building");
    expect(findListing("BHP.AX")?.board).toBe("ASX");
    expect(findListing("AAPL")?.board).toBe("NASDAQ");
    expect(findListing("JPM")?.board).toBe("NYSE");
    expect(listingsFor("DOW").some((row) => row.ticker === "AAPL")).toBe(true);
    expect(listingsFor("DOW").some((row) => row.ticker === "JPM")).toBe(true);
    expect(findListing("EA")).toBeNull();
    expect(listingsFor("ASX").some((row) => row.symbol === "ASK")).toBe(false);
    expect(listingsFor("NASDAQ").every((row) => row.name.length > 0)).toBe(true);
    expect(boardCoverage("NASDAQ").note).toContain(FUND_TYPE_NOTE);
    expect(boardCoverage("NYSE").note).toContain(FUND_TYPE_NOTE);
    expect(listingSentence("Fletcher Building", "Materials", "NZX")).toBe(
      "Fletcher Building is in the Materials list on NZX."
    );
    expect(listingSentence("Aadi Bioscience", "Not stated", "NASDAQ")).toBe(
      "Aadi Bioscience is listed on NASDAQ."
    );
    expect(listingSentence("Aadi Bioscience", "Not stated", "NASDAQ")).not.toContain("Not stated");
    expect(isDerivativeOrTestSecurity("AACIU", "Aadi Bioscience, Inc. Units")).toBe(true);
    expect(isDerivativeOrTestSecurity("AACIW", "Aadi Bioscience, Inc. Warrant")).toBe(true);
    expect(isDerivativeOrTestSecurity("GROW", "U.S. Global Investors, Inc.")).toBe(false);
    expect(isDerivativeOrTestSecurity("ZVZZT", "NASDAQ TEST")).toBe(true);
    expect(isDerivativeOrTestSecurity("ABC-WT", "Example Inc.")).toBe(true);
    expect(isDerivativeOrTestSecurity("ABC-UN", "Example Inc.")).toBe(true);
    expect(isDerivativeOrTestSecurity("ABC-RI", "Example Inc.")).toBe(true);
    expect(isDerivativeOrTestSecurity("AIR", "AAR Corp.")).toBe(false);
    expect(unpricedFootnote(0)).toBeNull();
    expect(unpricedFootnote(1)).toBe("1 listing has no price in this response");
    expect(unpricedFootnote(12)).toBe("12 listings have no price in this response");
    expect(hasRecentVerifiedPrice({ price: 12, quotedAt: "2026-10-09T00:00:00.000Z" }, Date.parse("2026-10-10T00:00:00.000Z"))).toBe(true);
    expect(hasRecentVerifiedPrice({ price: 0, quotedAt: "2026-10-09T00:00:00.000Z" }, Date.parse("2026-10-10T00:00:00.000Z"))).toBe(false);
    expect(usPageShouldNoindex({ board: "NASDAQ", inSitemap: false, hasQuote: false })).toBe(true);
    expect(usPageShouldNoindex({ board: "NASDAQ", inSitemap: false, hasQuote: true })).toBe(false);
    expect(usPageShouldNoindex({ board: "NASDAQ", inSitemap: true, hasQuote: false })).toBe(false);
    expect(usPageShouldNoindex({ board: "NZX", inSitemap: true, hasQuote: false })).toBe(false);
    expect(isSitemapStock("NVDA")).toBe(true);
    expect(isSitemapStock("JPM")).toBe(true);
    expect(isSitemapStock("AACIU")).toBe(false);
    expect(isSitemapStock("AACIW")).toBe(false);
  });

  it("reads the NYSE board and keeps a bad page number on the first page", () => {
    expect(parseMarketsTab("nyse")).toBe("NYSE");
    expect(parseAllMarketsExchange("nyse")).toEqual({ ok: true, exchange: "NYSE" });
    expect(parseAllMarketsExchange("otc").ok).toBe(false);
    expect(parseAllMarketsPage("0")).toBe(1);
    expect(parseAllMarketsPage("2")).toBe(2);
  });
});

describe("stock quote chain", () => {
  it("drops a zero price and keeps the saved print when every provider fails", async () => {
    const failed = await quoteWithProviders({
      tickers: ["FBU.NZ"],
      now: 1_000,
      yahooBreaker: freshBreaker(),
      twelveBreaker: freshBreaker(),
      saved: { "FBU.NZ": saved(3.42) },
      pending: {},
      yahoo: async () => {
        throw new Error("yahoo down");
      },
      twelve: async () => {
        throw new Error("twelve down");
      },
      yahooTimeoutMs: 20,
      twelveTimeoutMs: 20,
    });
    expect(failed.rows["FBU.NZ"]).toMatchObject({ price: 3.42, source: "Last good" });
    expect(failed.yahooBreaker.failures).toBe(1);
    expect(failed.twelveBreaker.failures).toBe(1);
    expect(Object.values(failed.rows).some((row) => row?.price === 0)).toBe(false);

    const zero = resolveEquityPrint({ ...yahoo(0), price: 0 }, saved(3.42), null);
    expect(zero.print?.price).toBe(3.42);
    expect(zero.print?.price).not.toBe(0);
  });

  it("holds one wild print and accepts a second print that agrees with it", () => {
    const held = resolveEquityPrint(yahoo(20, 90), saved(3), null);
    expect(held.print?.price).toBe(3);
    expect(held.print?.source).toBe("Last good");
    expect(held.pending?.price).toBe(20);
    const confirmed = resolveEquityPrint(yahoo(19.5, 40), held.print, held.pending);
    expect(confirmed.print?.price).toBe(19.5);
    expect(confirmed.print?.source).toBe("Yahoo Finance");
    expect(confirmed.pending).toBeNull();
  });

  it("opens the circuit after three failures and skips that provider", async () => {
    let state = freshBreaker();
    const now = 5_000;
    state = noteProviderResult(state, false, now);
    state = noteProviderResult(state, false, now);
    expect(breakerIsOpen(state, now)).toBe(false);
    state = noteProviderResult(state, false, now);
    expect(breakerIsOpen(state, now)).toBe(true);
    let calls = 0;
    const skipped = await quoteWithProviders({
      tickers: ["AAPL"],
      now,
      yahooBreaker: state,
      twelveBreaker: freshBreaker(),
      saved: { AAPL: saved(100) },
      pending: {},
      yahoo: async () => {
        calls += 1;
        return { AAPL: yahoo(101) };
      },
      twelve: null,
      yahooTimeoutMs: 20,
    });
    expect(calls).toBe(0);
    expect(skipped.rows.AAPL?.source).toBe("Last good");
    expect(skipped.rows.AAPL?.price).toBe(100);
  });

  it("times out a hung provider and does not invent a price", async () => {
    const hung = quoteWithProviders({
      tickers: ["NVDA"],
      now: 9_000,
      yahooBreaker: freshBreaker(),
      twelveBreaker: freshBreaker(),
      saved: {},
      pending: {},
      yahoo: () => new Promise(() => {}),
      twelve: async () => {
        throw new Error("no key");
      },
      yahooTimeoutMs: 15,
      twelveTimeoutMs: 15,
    });
    const result = await hung;
    expect(result.rows.NVDA).toBeNull();
    expect(result.yahooBreaker.failures).toBe(1);
    expect(JSON.stringify(result.rows)).not.toMatch(/"price":0/);
  });
});

describe("stock sitemap and the pull-check marker", () => {
  it("lists named ticker pages and stays under the sitemap limit", () => {
    const rows = sitemap();
    expect(rows.length).toBeLessThan(50_000);
    const paths = new Set(rows.map((row) => new URL(row.url).pathname));
    expect(paths.has("/markets/stock/FBU.NZ")).toBe(true);
    expect(paths.has("/markets/stock/NVDA")).toBe(true);
    expect(paths.has("/markets/stock/JPM")).toBe(true);
    expect(paths.has("/markets/stock/AACIU")).toBe(false);
    expect(paths.has("/markets/stock/AACIW")).toBe(false);
    const stockPaths = [...paths].filter((href) => href.startsWith("/markets/stock/"));
    expect(stockPaths.length).toBeGreaterThan(300);
    expect(stockPaths.length).toBeLessThan(800);
    expect(paths.has("/projections")).toBe(false);
    const source = readFileSync(path.join(process.cwd(), "src/lib/stock-markets.ts"), "utf8");
    const qa = readFileSync(path.join(process.cwd(), "qa/PULL-CHECK-2026-10-10.md"), "utf8");
    expect(source).toContain("pull-check:stock-markets-full-2026-10-11");
    expect(qa).toContain("pull-check:stock-markets-full-2026-10-11");
  });
});
