/**
 * Goal loop batch b10 (GOAL-LOCK G-04 G-05 G-06 G-12 G-13 G-16, G-10 review).
 * pull-check:v3-goal-b53b-2026-10-21
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { composeWatchNotices, applyUnsubscribe } from "@/lib/holding-alert";
import { decodeWatch, encodeWatch, isWatchRow, rowToWatch, watchSpecError, WATCH_POLL_MS } from "@/lib/watch-alerts";
import { feedOffFromCookieHeader, parseSimulate, SIMULATED_SOURCE } from "@/lib/test-hooks";
import { priceBadge } from "@/lib/price-confidence";
import { BOT_GUIDE_PARAGRAPHS, BOT_EXAMPLES, BOT_PAGE_NOTES } from "@/lib/bot-guides";
import { DEMO_BOOK } from "@/lib/demo-book";
import { fifTotals } from "@/lib/fif-working-paper";
import { fifCsv } from "@/lib/tax-pack";
import { documentAccess } from "@/lib/route-gate";

const read = (p: string) => readFileSync(p, "utf8");
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

describe("b10 pins", () => {
  it("build version", () => {
    expect(read("public/build-version.txt").trim()).toBe("v3-goal-b53b-2026-10-21");
    expect(read("qa/PULL-CHECK-2026-10-12.md")).toContain("pull-check:v3-goal-b53b-2026-10-21");
  });
});

describe("G-04 alerts v1", () => {
  const now = new Date("2026-10-19T01:00:00Z"); // 14:00 NZDT, outside quiet hours
  const rows = [
    { _id: "a1", ticker: "AIR.NZ", status: "active", instructions: encodeWatch({ kind: "price_level", level: 1.3, side: "below" }) },
    { _id: "a2", ticker: "FPH.NZ", status: "active", instructions: encodeWatch({ kind: "percent_move", movePct: 5 }) },
    { _id: "a3", ticker: "SPK.NZ", status: "active", instructions: encodeWatch({ kind: "ex_dividend", exDate: "2026-10-19" }) },
    { _id: "a4", ticker: "MEL.NZ", status: "active", instructions: encodeWatch({ kind: "news" }) },
  ];
  it("watch rows round-trip and stay off the sell-trigger desk", () => {
    expect(isWatchRow(rows[0].instructions)).toBe(true);
    expect(isWatchRow("trim at 10%")).toBe(false);
    expect(decodeWatch(rows[1].instructions)).toEqual({ kind: "percent_move", movePct: 5 });
    expect(read("src/app/api/alerts/route.ts")).toContain("!isWatchRow(a?.instructions)");
    expect(watchSpecError({ kind: "price_level", level: 0, side: "above" })).toMatch(/above 0/);
    expect(watchSpecError({ kind: "ex_dividend", exDate: "soon" })).toMatch(/ex-dividend/);
  });
  it("simulated feed fires price, % move, ex-dividend and news within one 60 s refresh, with source and time", () => {
    const sims = parseSimulate("AIR.NZ:1.20:,FPH.NZ::-6.5", true);
    expect(sims).toEqual([{ ticker: "AIR.NZ", price: 1.2, changePct: null }, { ticker: "FPH.NZ", price: null, changePct: -6.5 }]);
    const quotes: Record<string, { price: number | null; changePct: number | null; source: string; asOf: string }> = {};
    for (const s of sims) quotes[s.ticker] = { price: s.price, changePct: s.changePct, source: SIMULATED_SOURCE, asOf: now.toISOString() };
    quotes["SPK.NZ"] = { price: null, changePct: null, source: SIMULATED_SOURCE, asOf: now.toISOString() };
    quotes["MEL.NZ"] = { price: null, changePct: null, source: SIMULATED_SOURCE, asOf: now.toISOString() };
    const watches = rows.map((r) => rowToWatch(r, r.ticker === "MEL.NZ" ? "Simulated test headline for MEL.NZ" : null)!);
    const notices = composeWatchNotices({ alerts: watches, quotes, now, today: "2026-10-19" });
    expect(notices.map((n) => n.kind).sort()).toEqual(["ex_dividend", "news", "percent_move", "price_level"]);
    for (const n of notices) {
      expect(n.sent).toBe(false);
      expect(n.text).toContain(`Source: ${SIMULATED_SOURCE}`);
      expect(n.text).toContain(`Time: ${now.toISOString()}`);
      expect(n.text).toMatch(/not a recommendation/);
      expect(n.text).not.toMatch(/\byou should (buy|sell)\b/i);
    }
    expect(WATCH_POLL_MS).toBeLessThanOrEqual(5 * 60 * 1000);
  });
  it("unsubscribe stops a watch", () => {
    const watches = rows.map((r) => rowToWatch(r)!);
    const paused = applyUnsubscribe(watches, "a1");
    const notices = composeWatchNotices({
      alerts: paused,
      quotes: { "AIR.NZ": { price: 1, changePct: 0, source: SIMULATED_SOURCE, asOf: now.toISOString() } },
      now,
      today: "2026-10-19",
    });
    expect(notices.find((n) => n.id === "a1")).toBeUndefined();
  });
  it("in-app UI, API and test page exist; nothing is emailed", () => {
    expect(read("src/components/dashboard/PortfolioDashboard.tsx")).toContain("<WatchAlerts canCreate={!freePlan} />");
    const api = read("src/app/api/watches/route.ts");
    expect(api).toContain("parseSimulate");
    expect(api).not.toMatch(/sendEmail|resend|nodemailer/i);
    expect(read("src/components/dashboard/WatchAlerts.tsx")).toContain("Unsubscribe");
    expect(documentAccess("/test-hooks")).toBe("test-hooks"); // Goal b20 SECURITY: no longer public
  });
  it("simulate is ignored when hooks are off", () => {
    expect(parseSimulate("AIR.NZ:1", false)).toEqual([]);
  });
});

describe("G-05 price confidence", () => {
  it("feed-off cookie switch", () => {
    expect(feedOffFromCookieHeader("a=1; af_test_feed_off=1", true)).toBe(true);
    expect(feedOffFromCookieHeader("af_test_feed_off=1", false)).toBe(false);
    expect(feedOffFromCookieHeader("x=1", true)).toBe(false);
    expect(read("src/app/api/ticker/route.ts")).toContain("feedOffFromCookieHeader");
  });
  it("cells go amber after one missed refresh, red after two", () => {
    const now = new Date("2026-10-19T01:00:00Z");
    const quotedAt = new Date("2026-10-19T00:55:00Z");
    const base = { source: "Public market data", delay: "Delayed", quotedAt, now };
    expect(priceBadge({ ...base, refreshOk: true }).tone).toBe("green");
    expect(priceBadge({ ...base, refreshOk: false, failedRefreshes: 1 }).tone).toBe("amber");
    expect(priceBadge({ ...base, refreshOk: false, failedRefreshes: 2 }).tone).toBe("red");
    const cell = read("src/components/MarketTicker.tsx");
    expect(cell).toContain("data-price-tone={badge.tone}");
    expect(cell).not.toMatch(/real-time|licensed|official/i);
  });
});

describe("G-06 bot pages and demo", () => {
  it("each bot guide is long-form, factual and model-free", () => {
    for (const k of ["stox", "koins", "smitty", "headmaster"] as const) {
      const text = BOT_GUIDE_PARAGRAPHS[k].join(" ") + " " + BOT_PAGE_NOTES[k] + " " + BOT_EXAMPLES[k].report;
      expect(words(text)).toBeGreaterThanOrEqual(500);
      expect(text).not.toMatch(/\b(SuperGrok|Grok|xAI|Claude|Gemini|GPT|OpenAI|Anthropic)\b/);
      expect(text).not.toMatch(/real-time|\blicensed\b|\bofficial\b|\bGST\b/i);
      expect(text).not.toMatch(/\d+(\.\d+)?% (return|gain|win rate)/i);
      const page = read(`src/app/${k}/page.tsx`);
      expect(page.match(/src: "\/screens\//g)?.length).toBe(2);
      expect(page.match(/alt: "Screenshot/g)?.length).toBe(2);
    }
    expect(BOT_EXAMPLES.stox.report).toMatch(/^Example/);
  });
  it("signed-out read-only demo with no real data", () => {
    expect(documentAccess("/demo")).toBe("public");
    expect(DEMO_BOOK.notice).toMatch(/^Example\. Not a member book/);
    expect(JSON.stringify(DEMO_BOOK)).not.toMatch(/AIR\.NZ|FPH\.NZ|BTC|ETH/);
    const page = read("src/app/demo/page.tsx");
    expect(page).not.toMatch(/getCurrentUser|totalumSdk/);
  });
});

describe("G-12 FIF rounding", () => {
  it("5-holding fixture: printed total = sum of rounded rows, CSV = page", () => {
    const positions = [
      { ticker: "AAPL", className: "attributable", costNzd: 1000.005, openingNzd: 1200.004, closingNzd: 1300, fdrNzd: 60.0002, cvNzd: 100.005, gainsNzd: 0, costsInYearNzd: 0 },
      { ticker: "MSFT", className: "attributable", costNzd: 2000.004, openingNzd: 2100, closingNzd: 2200, fdrNzd: 105.005, cvNzd: 100.004, gainsNzd: 0, costsInYearNzd: 0 },
      { ticker: "VOO", className: "attributable", costNzd: 3000.005, openingNzd: 3100, closingNzd: 3200, fdrNzd: 155.005, cvNzd: 100.005, gainsNzd: 0, costsInYearNzd: 0 },
      { ticker: "GOOG", className: "attributable", costNzd: 4000.004, openingNzd: 4100, closingNzd: 4200, fdrNzd: 205.004, cvNzd: 100.004, gainsNzd: 0, costsInYearNzd: 0 },
      { ticker: "AMZN", className: "attributable", costNzd: 5000.005, openingNzd: 5100, closingNzd: 5200, fdrNzd: 255.005, cvNzd: 100.005, gainsNzd: 0, costsInYearNzd: 0 },
    ];
    const totals = fifTotals(positions as never);
    const rounded = (k: "costNzd" | "fdrNzd" | "cvNzd") => positions.reduce((s, p) => s + Math.round(Math.round((p[k] + Number.EPSILON) * 100)), 0) / 100;
    expect(totals.costNzd).toBe(rounded("costNzd"));
    expect(totals.fdrNzd).toBe(rounded("fdrNzd"));
    expect(totals.cvNzd).toBe(rounded("cvNzd"));
    const csv = fifCsv({ endingYear: 2027, label: "", attributing: positions, australian: [], newZealand: [], notShares: [], peakCostNzd: 15000.02, threshold: "over", assumptions: [], sources: [] } as never);
    const totalLine = csv.split("\n").find((l) => l.startsWith("Total,"))!;
    expect(totalLine).toContain(totals.costNzd!.toFixed(2));
    expect(totalLine).toContain(totals.fdrNzd!.toFixed(2));
    expect(read("src/app/tax/fif/page.tsx")).toContain("fifTotals(paper.attributing)");
    expect(fifTotals([{ costNzd: null, fdrNzd: 1, cvNzd: 1 }]).costNzd).toBeNull();
  });
});

describe("G-13 /tax public page", () => {
  it("has an Example sample and no personal data when signed out", () => {
    const summary = read("src/lib/tax-public-summary.ts");
    expect(summary).toContain("Example. This fixture is not a customer's book.");
    expect(read("src/app/tax/page.tsx")).toContain("book = null");
  });
});

describe("G-16 changelog RSS", () => {
  it("valid RSS 2.0 with self link and guids, advertised on /changelog", () => {
    const rss = read("src/app/rss.xml/route.ts");
    expect(rss).toContain('xmlns:atom="http://www.w3.org/2005/Atom"');
    expect(rss).toContain('rel="self"');
    expect(rss).toContain("<guid isPermaLink=\"false\">");
    expect(read("src/app/changelog/page.tsx")).toContain('"application/rss+xml": "/rss.xml"');
  });
});
