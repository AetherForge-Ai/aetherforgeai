/**
 * Must-fix Batch 6 (TT retest of v3-must-fix-b5-2026-10-17).
 * pull-check:v3-must-fix-b6-2026-10-17
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// A shared in-memory "table" that behaves like Totalum: every createRecord is
// visible to the next query, even across concurrent callers.
const table = vi.hoisted(() => ({ rows: [] as { _id: string; bucket_key: string; count: number }[] }));
vi.mock("@/lib/totalum", () => ({
  totalumSdk: {
    crud: {
      createRecord: vi.fn(async (_t: string, row: { bucket_key: string; count: number }) => {
        // Yield so a burst interleaves like separate isolates would.
        await new Promise((r) => setTimeout(r, 1));
        table.rows.push({ _id: String(table.rows.length + 1), ...row });
        return { data: row };
      }),
      query: vi.fn(async (_t: string, q: { _filter: { bucket_key: string } }) => {
        await new Promise((r) => setTimeout(r, 1));
        return { data: table.rows.filter((r) => r.bucket_key === q._filter.bucket_key) };
      }),
      editRecordById: vi.fn(),
    },
  },
}));

import { totalumCounterStore } from "@/lib/durable-counter.server";
import { resetRateLimits, setDurableCounterStore, takeRateLimit, PERSONAL_GUIDE_LIMIT } from "@/lib/ip-rate-limit";
import { completionText, redactSecrets, GUIDE_MODEL_DEFAULT } from "@/lib/grok";
import { findDuplicateDividend, dividendDayKey, type DividendView } from "@/lib/dividend-ledger";
import { cleanStoredReport } from "@/lib/report-prose";
import { isNewsRelevant, hasNzAuAnchor } from "@/lib/market-news";

const read = (p: string) => readFileSync(p, "utf8");

describe("CR-2 durable limiter enforces under a burst", () => {
  beforeEach(() => {
    table.rows = [];
    resetRateLimits();
    setDurableCounterStore(totalumCounterStore);
  });

  it("11 requests (3 spaced, burst of 8) return 429 after the limit even when each isolate is fresh", async () => {
    const now = Date.now();
    const results: boolean[] = [];
    for (let i = 0; i < 3; i++) {
      resetRateLimits(); // a different isolate each time
      results.push((await takeRateLimit("personal-guide:203.0.113.9", PERSONAL_GUIDE_LIMIT, 60_000, now)).allowed);
    }
    const burst = await Promise.all(
      Array.from({ length: 8 }, () => {
        resetRateLimits();
        return takeRateLimit("personal-guide:203.0.113.9", PERSONAL_GUIDE_LIMIT, 60_000, now);
      })
    );
    results.push(...burst.map((b) => b.allowed));
    expect(results.filter(Boolean).length).toBeLessThanOrEqual(PERSONAL_GUIDE_LIMIT);
    expect(results.filter((ok) => !ok).length).toBeGreaterThanOrEqual(11 - PERSONAL_GUIDE_LIMIT);
    expect(burst.some((b) => !b.allowed && b.store === "durable")).toBe(true);
  });

  it("per-instance memory limit still refuses the 7th call", async () => {
    setDurableCounterStore(null);
    const now = Date.now();
    const out = [];
    for (let i = 0; i < 7; i++) out.push(await takeRateLimit("personal-guide:198.51.100.2", PERSONAL_GUIDE_LIMIT, 60_000, now));
    expect(out[6].allowed).toBe(false);
  });
});

describe("CR-2 AI call", () => {
  it("guide uses a fast non-reasoning model by default and parses array content", () => {
    expect(GUIDE_MODEL_DEFAULT).toMatch(/non-reasoning/);
    expect(completionText([{ type: "text", text: "Hello " }, { type: "text", text: "there" }])).toBe("Hello there");
    expect(completionText("  hi ")).toBe("hi");
    expect(completionText(null)).toBe("");
  });
  it("logs never carry a key", () => {
    expect(redactSecrets("bad key xai-abc123DEF and Bearer xai-zzz")).not.toMatch(/abc123DEF|xai-zzz/);
    const src = read("src/lib/grok.ts");
    expect(src).not.toMatch(/console\.[a-z]+\([^)]*apiKey/);
  });
});

describe("CR-5 failed sign-in limit", () => {
  it("sign-in POSTs are limited and answer 429", () => {
    const src = read("src/app/api/auth/[...all]/route.ts");
    expect(src).toContain("authRateLimitRule");
    expect(src).toContain("status: 429");
  });
});

describe("H-5 duplicate dividend", () => {
  const listed: DividendView[] = [
    { id: "1", when: "2026-10-13T11:00:00.000Z", ticker: "FPH.NZ", assetName: "FPH", assetType: "stock", parts: null, cashNzd: 15 },
  ];
  it("a UTC-stored row matches the same NZ day", () => {
    expect(dividendDayKey("2026-10-13T11:00:00.000Z")).toBe("2026-10-14");
    expect(findDuplicateDividend(listed, { ticker: "FPH.NZ", when: "2026-10-14", grossNative: 15, cashNzd: 15 })).not.toBeNull();
    expect(findDuplicateDividend(listed, { ticker: "FPH", when: "2026-10-14", grossNative: 15, cashNzd: 15 })).not.toBeNull();
    expect(findDuplicateDividend(listed, { ticker: "FPH.NZ", when: "2026-10-15", grossNative: 15, cashNzd: 15 })).toBeNull();
  });
});

describe("H-6 stored reports are cleaned at view time", () => {
  it("strips markdown and Headmaster lines from old Stox/Koins payloads", () => {
    const out = cleanStoredReport({
      ticker: "FPH.NZ",
      executiveSummary: "**HOLD FPH.NZ** steady. Cash follows the same cash rule as the Headmaster skeleton. _Informational only, not advice._",
    });
    expect(out.executiveSummary).not.toMatch(/\*\*|(^|\s)_|Headmaster|skeleton/);
    expect(out.executiveSummary).toContain("HOLD FPH.NZ");
    expect(out.ticker).toBe("FPH.NZ");
    expect(read("src/app/api/reports/route.ts")).toContain("cleanStoredReport(payload");
  });
});

describe("H-13 market news NZ/AU relevance", () => {
  it("drops US single-stock pieces that arrive through an NZ/AU feed", () => {
    expect(isNewsRelevant({ headline: "Why You Should Think About Palantir Differently Now", summary: "Palantir shares earnings outlook", market: "ASX" })).toBe(false);
    expect(isNewsRelevant({ headline: "When Amgen's Forecast And Chart Say The Same Thing, Pay Attention", summary: "Amgen stock earnings", market: "NZX" })).toBe(false);
    expect(isNewsRelevant({ headline: "NZX 50 lifts as Fisher & Paykel shares gain", summary: "NZ shares rose", market: "NZX" })).toBe(true);
    expect(hasNzAuAnchor("RBNZ holds the OCR")).toBe(true);
  });
});

describe("UI fixes (source checks)", () => {
  it("H-2 no stray 'no print' label and the seed keeps high/low", () => {
    const src = read("src/components/dashboard/MarketsExplorer.tsx");
    expect(src).not.toMatch(/>\s*no print\s*</);
    expect(read("src/lib/public-market-index.ts")).toContain("dayHigh: row.dayHigh");
  });
  it("H-1 watchlist falls back to the ticker quote route", () => {
    expect(read("src/components/dashboard/WatchlistPanel.tsx")).toContain("/api/tickers/quote");
  });
  it("H-4 report center shows a loading line, not the default allowance", () => {
    expect(read("src/components/dashboard/ReportCenter.tsx")).toContain("Checking your AI reports this month");
  });
  it("H-7 plan usage counts every open holding", () => {
    expect(read("src/components/dashboard/PortfolioDashboard.tsx")).toContain("holdingsCount={holdingCounts.total}");
  });
  it("H-11 Headmaster copy drops unbuilt features", () => {
    for (const f of ["src/components/bots/TotalumShowcase.tsx", "src/components/totalum/TotalumConsole.tsx"]) {
      const src = read(f);
      expect(src).not.toMatch(/title: "Strategy Builder"|title: "Scenario Simulator"|grow and protect/);
    }
  });
  it("M-3 bot pages use transparent cut-outs with no mask", () => {
    expect(read("src/components/public/BotGuide.tsx")).not.toContain("mask-image");
    for (const b of ["stox", "koins", "smitty"]) expect(read(`src/app/${b}/page.tsx`)).not.toContain(`/brand/bot-${b}.png`);
  });
  it("M-6 figures stay on one line with icon spacing", () => {
    expect(read("src/components/dashboard/ShowTheMaths.tsx")).toContain("whitespace-nowrap");
    expect(read("src/components/dashboard/UnifiedHoldingsTable.tsx")).toContain("flex-nowrap");
    expect(read("src/components/portfolio-coach/PortfolioCoach.tsx")).toContain("2xl:block");
  });
  it("build version", () => {
    expect(read("public/build-version.txt").trim()).toBe("v3-goal-b33-2026-10-19");
    expect(read("qa/PULL-CHECK-2026-10-12.md")).toContain("pull-check:v3-must-fix-b6-2026-10-17");
  });
});
