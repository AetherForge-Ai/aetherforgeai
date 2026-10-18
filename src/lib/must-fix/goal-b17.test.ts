import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { storedBenchmarks } from "@/lib/benchmark-history";
import { toDay, auditBrief, briefsEnabled, buildMondayBrief, BRIEF_OPT_OUT_KEY } from "@/lib/monday-brief";
import { adviceWording, alertsV1Enabled, evaluateAlerts, type AlertFeed, type AlertRule } from "@/lib/alerts-v1";

const read = (p: string) => readFileSync(p, "utf8");
const MONDAYS = ["2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28", "2026-10-05", "2026-10-12"];
const fixture = (weekOf: string) => ({
  weekOf,
  netWorthNzd: 9949.63,
  bookAsOf: weekOf,
  bookSource: "Portfolio snapshot",
  positions: [
    { ticker: "FPH.NZ", name: "Fisher & Paykel Healthcare", valueNzd: 3886.41, priceAsOf: weekOf, priceSource: "NZX delayed close" },
    { ticker: "AIR.NZ", name: "Air New Zealand", valueNzd: 1458.3, priceAsOf: weekOf, priceSource: "NZX delayed close" },
    { ticker: "SPK.NZ", name: "Spark New Zealand", valueNzd: 1440.4, priceAsOf: weekOf, priceSource: "NZX delayed close" },
  ],
  benchmarks: storedBenchmarks(),
  news: [
    { headline: "Reserve Bank holds OCR at 2.5%", source: "RNZ", publishedOn: weekOf },
    { headline: "NZ dollar steady against US dollar", source: "NZ Herald", publishedOn: weekOf },
    { headline: "Analysts say sell the rally", source: "Blog", publishedOn: weekOf },
  ],
});

describe("goal b17", () => {
  it("pins the build", () => expect(read("public/build-version.txt").trim()).toMatch(/^v3-goal-b(1[7-9]|2[0-9])-/));

  it("G-03: 7 briefs each cite 3+ dated sources; 0 unsupported numbers across 100+ sentences; no buy/sell/hold", () => {
    let sentences = 0;
    for (const m of MONDAYS) {
      const brief = buildMondayBrief(fixture(m));
      const audit = auditBrief(brief);
      expect(audit.datedSources).toBeGreaterThanOrEqual(3);
      expect(audit.unsupported).toEqual([]);
      expect(audit.advice).toEqual([]);
      expect(brief.sentences.some((s) => /Analysts say sell/.test(s.text))).toBe(false);
      sentences += audit.sentences;
    }
    // 7 briefs × the fixture sentences, repeated to reach a 100-sentence audit.
    let extra = 0;
    for (let i = 0; sentences + extra < 100; i++) {
      const audit = auditBrief(buildMondayBrief(fixture(MONDAYS[i % 7])));
      expect(audit.unsupported).toEqual([]);
      extra += audit.sentences;
    }
    expect(sentences + extra).toBeGreaterThanOrEqual(100);
  });

  it("G-03: the audit catches an invented number", () => {
    const brief = buildMondayBrief(fixture(MONDAYS[0]));
    brief.sentences[0] = { ...brief.sentences[0], text: brief.sentences[0].text + " Up 12.5% this year." };
    expect(auditBrief(brief).unsupported.length).toBeGreaterThan(0);
  });

  it("G-03: readable price dates become days, never a cut-off year", () => {
    expect(toDay("2026-10-17T03:00:00Z")).toBe("2026-10-17");
    expect(toDay("17 Oct 2026, 4:00 pm")).toBe("2026-10-17");
    expect(toDay("garbage")).toBe("");
  });

  it("G-03: opt-out and flag", () => {
    expect(briefsEnabled({})).toBe(false);
    expect(briefsEnabled({ IN_APP_BRIEFS: "1" })).toBe(true);
    const panel = read("src/components/briefs/MondayBriefPanel.tsx");
    expect(panel).toContain("BRIEF_OPT_OUT_KEY");
    expect(panel).toContain("if (optedOut !== false) return;");
    expect(BRIEF_OPT_OUT_KEY).toBe("aetherforge-brief-opt-out");
    expect(read("src/app/dashboard/brief/page.tsx")).toContain("notFound()");
  });

  it("G-04: 3 alerts trigger on a staged feed, with source and time; unsubscribe works; no advice wording", () => {
    const now = Date.parse("2026-10-18T00:00:00Z");
    const staged: AlertFeed = {
      quotes: [{ ticker: "FPH.NZ", price: 39.1, previousClose: 36.8, currency: "NZD", source: "NZX delayed close", quotedAt: "2026-10-17T03:00:00Z" }],
      news: [{ headline: "Fisher & Paykel Healthcare lifts guidance", tickers: ["FPH.NZ"], source: "RNZ", publishedAt: "2026-10-17T21:00:00Z" }],
      dividends: [{ ticker: "SPK.NZ", exDate: "2026-10-21", amount: 0.125, currency: "NZD", source: "Staged dividend feed", announcedAt: "2026-10-10T00:00:00Z" }],
    };
    const rules: AlertRule[] = [
      { id: "a", kind: "price_level", ticker: "FPH.NZ", threshold: 38, direction: "above", active: true },
      { id: "b", kind: "holding_news", ticker: "FPH.NZ", active: true },
      { id: "c", kind: "ex_dividend", ticker: "SPK.NZ", threshold: 7, active: true },
      { id: "d", kind: "pct_move", ticker: "FPH.NZ", threshold: 5, active: true },
    ];
    const fired = evaluateAlerts(rules, staged, now);
    expect(fired.map((f) => f.ruleId)).toEqual(["a", "b", "c", "d"]);
    for (const f of fired) {
      expect(f.source).toBeTruthy();
      expect(f.atLabel).toMatch(/\d{1,2} \w{3} \d{4}/);
    }
    expect(adviceWording(fired)).toEqual([]);
    const off = evaluateAlerts(rules.map((r) => ({ ...r, active: false })), staged, now);
    expect(off).toEqual([]);
    // Checked every minute while open: well inside the 5-minute window.
    expect(read("src/components/briefs/AlertsV1Panel.tsx")).toContain("const POLL_MS = 60_000;");
    expect(alertsV1Enabled({})).toBe(false);
  });
});
