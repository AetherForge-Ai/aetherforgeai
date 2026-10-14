import { afterEach, describe, expect, it, vi } from "vitest";
import type { TickerAnalysis } from "@/lib/apex";
import { annotateTickerCalls, illustratedSizeNZD, tickerCallSentence } from "@/lib/report-topup";
import { bookCashReserve } from "@/lib/headmaster-trust";
import { distinctiveCompanyName, headlinesForSymbol } from "@/lib/stock-public-facts";
import { CONTACT_LIMIT, CONTACT_WINDOW_MS, rateLimitHeaders, resetRateLimits, takeRateLimit } from "@/lib/ip-rate-limit";
import { dexListLoading } from "@/hooks/useDexMarkets";
import { projectionEmptyReason } from "@/components/dashboard/TickerAnalysisPane";

vi.mock("@/lib/totalum", () => ({ totalumSdk: { crud: { createRecord: vi.fn(async () => ({ data: {} })) } } }));

function row(ticker: string, signal: TickerAnalysis["signal"]): TickerAnalysis {
  return {
    ticker,
    name: ticker,
    price: 1,
    changePct: 0,
    signal,
    sentiment: 50,
    momentum: [],
    momentum12moPct: 0,
    shortTerm: [],
    pathways: [],
    note: `${ticker}.`,
    call: { horizon: "7-day", range: "0.9–1.1", oddsPct: 55, killPrice: 0.8, realizedVolPct: null, bear: [0.8, 0.9], base: [0.9, 1.1], bull: [1.1, 1.2] },
  };
}

const book = { cashNZD: 9815.91 + 2000, netWorthNZD: 98159.1 };

describe("r11 item 1: report sizing follows the report action", () => {
  it("ADA with signal Accumulate and report action HOLD shows no size", () => {
    const [ada] = annotateTickerCalls([row("ADA", "Accumulate")], book, "crypto", [{ ticker: "ADA", action: "HOLD" }]);
    expect(ada.note).toContain("No new size: HOLD.");
    expect(ada.note).not.toMatch(/Illustrated size NZ\$/);
  });

  it("PFI TRIM shows no size", () => {
    const [pfi] = annotateTickerCalls([row("PFI.NZ", "Buy")], book, "stock", [{ ticker: "PFI.NZ", action: "TRIM" }]);
    expect(pfi.note).toContain("No new size: TRIM (reduce).");
    expect(pfi.note).not.toMatch(/Illustrated size|inside the cash reserve/);
  });

  it("SELL shows no size", () => {
    const line = tickerCallSentence(row("X", "Buy"), 500, 0, 100, "SELL");
    expect(line).toContain("No new size: SELL.");
  });

  it("a ticker with no report action gets no size", () => {
    const [x] = annotateTickerCalls([row("ZZZ", "Strong Buy")], book, "stock", []);
    expect(x.note).not.toMatch(/Illustrated size/);
  });

  it("a BUY size is at most cash minus reserve and is worded from cash above the reserve", () => {
    const reserve = bookCashReserve(book.netWorthNZD).retainedNZD;
    const [buy] = annotateTickerCalls([row("FPH.NZ", "Buy")], book, "stock", [{ ticker: "FPH.NZ", action: "BUY" }]);
    const match = buy.note.match(/Illustrated size NZ\$([\d,]+\.\d{2})/);
    expect(match).not.toBeNull();
    const size = Number(match![1].replace(/,/g, ""));
    expect(size).toBeGreaterThan(0);
    expect(size).toBeLessThanOrEqual(book.cashNZD - reserve + 0.005);
    expect(buy.note).toContain(`from cash above the NZ$${reserve.toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} reserve`);
    expect(buy.note).not.toMatch(/capped at the cash reserve|inside the cash reserve/);
  });

  it("the size is never capped at the reserve amount", () => {
    const size = illustratedSizeNZD({ cashNZD: 60000, bookNZD: 100000, sleeveWeightPct: 40, realizedVolPct: null, names: 1 });
    expect(size).toBe(40000);
    expect(size).toBeGreaterThan(bookCashReserve(100000).retainedNZD);
  });

  it("no cash above the reserve means a zero size", () => {
    expect(illustratedSizeNZD({ cashNZD: 5000, bookNZD: 100000, sleeveWeightPct: 40, realizedVolPct: null, names: 1 })).toBe(0);
  });
});

describe("r11 item 2: stock news matching", () => {
  const news = [
    { headline: "AT&T beats on wireless subscribers" },
    { headline: "New Zealand dollar falls against the greenback" },
    { headline: "Air New Zealand cuts flights over engine checks" },
    { headline: "Australia energy stocks slide" },
    { headline: "Fairing stocks rise" },
  ];

  it("keeps AT&T and the NZ dollar off AIR.NZ and keeps Air New Zealand", () => {
    const hits = headlinesForSymbol(news, "AIR.NZ", "Air New Zealand Limited");
    expect(hits).toEqual(["Air New Zealand cuts flights over engine checks"]);
  });

  it("does not match a bare short ticker inside other words", () => {
    expect(headlinesForSymbol([{ headline: "Fresh air for markets" }, { headline: "Repair costs rise" }], "AIR.NZ", "")).toEqual([]);
  });

  it("matches ticker forms AIR.NZ, NZX:AIR and (AIR)", () => {
    const items = [{ headline: "AIR.NZ jumps" }, { headline: "NZX:AIR update" }, { headline: "Airline (AIR) guidance" }];
    expect(headlinesForSymbol(items, "AIR.NZ", "")).toHaveLength(3);
  });

  it("matches Worley by its name, never by generic words", () => {
    const hits = headlinesForSymbol(
      [{ headline: "Worley wins a contract" }, { headline: "Australia mining group upgrades" }],
      "WOR.AX",
      "Worley Limited"
    );
    expect(hits).toEqual(["Worley wins a contract"]);
  });

  it("a single generic or place word is not a distinctive name", () => {
    expect(distinctiveCompanyName("Zealand")).toBeNull();
    expect(distinctiveCompanyName("Energy Group Ltd")).toBeNull();
    expect(headlinesForSymbol([{ headline: "Energy prices rise" }], "XYZ.AX", "Energy Group Ltd")).toEqual([]);
    expect(distinctiveCompanyName("Air New Zealand Limited")).toBe("AIR NEW ZEALAND");
  });
});

describe("r11 item 3: stock page renders the h1 before the feed", () => {
  it("wraps the quote line and the facts in Suspense with skeletons", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync("src/app/markets/stock/[ticker]/page.tsx", "utf8");
    expect(src).toMatch(/<Suspense fallback={<QuoteLineSkeleton \/>}>\s*<StockQuoteLine/);
    expect(src).toMatch(/<Suspense fallback={<FactsSkeleton \/>}>\s*<StockPublicFacts/);
    expect(src).toContain('<h1 className="sr-only">');
  });
});

describe("r11 item 4: projection reasons are plain text", () => {
  it("never echoes raw API text", () => {
    for (const status of [400, 401, 429, 500, 502, null]) {
      expect(projectionEmptyReason(status)).toMatch(/^No projection: /);
    }
  });
});

describe("r11 item 6: DEX first load shows a skeleton", () => {
  it("is loading before the first answer and not after an empty answer", () => {
    expect(dexListLoading({ active: true, loading: false, fetchedAt: 0, error: null, rows: 0 })).toBe(true);
    expect(dexListLoading({ active: true, loading: false, fetchedAt: 1, error: null, rows: 0 })).toBe(false);
    expect(dexListLoading({ active: true, loading: false, fetchedAt: 0, error: "x", rows: 0 })).toBe(false);
    expect(dexListLoading({ active: true, loading: true, fetchedAt: 0, error: null, rows: 3 })).toBe(false);
  });
});

describe("r11 item 7: rate-limit 429 headers", () => {
  afterEach(() => resetRateLimits());

  it("refuses past the limit with RateLimit and Retry-After headers", async () => {
    const now = 1_000_000_000_000;
    let last = await takeRateLimit("t:1.2.3.4", CONTACT_LIMIT, CONTACT_WINDOW_MS, now);
    for (let i = 1; i < CONTACT_LIMIT; i++) last = await takeRateLimit("t:1.2.3.4", CONTACT_LIMIT, CONTACT_WINDOW_MS, now);
    expect(last.allowed).toBe(true);
    const refused = await takeRateLimit("t:1.2.3.4", CONTACT_LIMIT, CONTACT_WINDOW_MS, now);
    expect(refused.allowed).toBe(false);
    const headers = rateLimitHeaders(refused, true);
    expect(headers["RateLimit-Limit"]).toBe(String(CONTACT_LIMIT));
    expect(headers["RateLimit-Remaining"]).toBe("0");
    expect(Number(headers["Retry-After"])).toBeGreaterThan(0);
  });

  it("/api/contact answers 429 with headers, even for an empty body", async () => {
    const { POST } = await import("@/app/api/contact/route");
    const make = () =>
      new Request("https://aetherforgeai.co.nz/api/contact", {
        method: "POST",
        headers: { "cf-connecting-ip": "9.9.9.9", "content-type": "application/json" },
        body: "{}",
      });
    let res: Response = await POST(make());
    expect(res.status).toBe(400);
    expect(res.headers.get("RateLimit-Limit")).toBe(String(CONTACT_LIMIT));
    for (let i = 1; i < CONTACT_LIMIT; i++) res = await POST(make());
    res = await POST(make());
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
    expect(res.headers.get("RateLimit-Remaining")).toBe("0");
  });
});
