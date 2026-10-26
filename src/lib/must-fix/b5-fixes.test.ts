/**
 * Must-fix Batch 5 (TT retest of v3-must-fix-b4-2026-10-16).
 * pull-check:v3-must-fix-b5-2026-10-17
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const grokMock = vi.hoisted(() => ({ impl: async (): Promise<string> => "The paper book records what you hold." }));
vi.mock("@/lib/grok", () => ({
  isGrokConfigured: () => !!process.env.XAI_API_KEY,
  createGrokChatCompletion: vi.fn(async () => grokMock.impl()),
  GrokError: class GrokError extends Error {
    constructor(message: string, readonly code: string) {
      super(message);
    }
  },
  guideModel: () => "test-guide-model",
  GUIDE_MODEL_FALLBACK: "test-fallback-model",
  noteGuideFailure: () => undefined,
}));
vi.mock("@/lib/totalum", () => ({
  totalumSdk: {
    crud: {
      // The live table is missing: every call fails, as on the b4 build.
      query: vi.fn(async () => {
        throw new Error("table rate_limit_counter not found");
      }),
      editRecordById: vi.fn(),
      createRecord: vi.fn(),
    },
  },
}));

import { resetRateLimits, setDurableCounterStore, rateLimitHeaders, takeRateLimit } from "@/lib/ip-rate-limit";
import { GUIDE_MAX_TOKENS, GUIDE_REPLY_DISCLAIMER } from "@/lib/guide-safety";
import { SECURITY_HEADERS } from "@/lib/security-headers";
import { BOT_PAGE_NOTES, BOT_PAGE_DISCLAIMER } from "@/lib/bot-guides";
import { PAPER_BOOK_STATEMENT, POSITIONING_LINE } from "@/lib/public-copy";
import { fmtCompactUsd } from "@/lib/crypto-market";
import { cryptoDetailCopy } from "@/lib/crypto-public-meta";
import { PUBLISHED_PLAN_PRICES, ULTIMATE_FROM_LINE } from "@/lib/plan-usage";
import { isFinanceRelevant, isNewsRelevant } from "@/lib/market-news";

const read = (p: string) => readFileSync(p, "utf8");

function guidePost(ip: string, message = "What does the dashboard show?") {
  return new Request("https://aetherforgeai.co.nz/api/personal-guide", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": ip },
    body: JSON.stringify({ message }),
  });
}

describe("CR-2 guide answers and the limiter works", () => {
  beforeEach(() => {
    resetRateLimits();
    setDurableCounterStore(null);
    vi.stubEnv("XAI_API_KEY", "test-key");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    grokMock.impl = async () => "The paper book records what you hold.";
  });

  it("the first request gets an answer (200), not 503", async () => {
    const { POST } = await import("@/app/api/personal-guide/route");
    const res = await POST(guidePost("192.0.2.10"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; data: { reply: string } };
    expect(json.ok).toBe(true);
    expect(json.data.reply).toContain(GUIDE_REPLY_DISCLAIMER);
  });

  it("a vendor error or an empty reply falls back to the built-in guide (200), not 'busy'", async () => {
    grokMock.impl = async () => {
      throw new Error("AI returned an empty response.");
    };
    const { POST } = await import("@/app/api/personal-guide/route");
    const res = await POST(guidePost("192.0.2.11"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { reply: string; fallback: boolean; reason: string } };
    expect(json.data.fallback).toBe(true);
    expect(json.data.reason).toBe("ai_unavailable");
    expect(json.data.reply).toContain(GUIDE_REPLY_DISCLAIMER);
  });

  it("only a real timeout returns 503 busy with Retry-After", async () => {
    grokMock.impl = async () => {
      const err = new Error("timed out");
      err.name = "TimeoutError";
      throw err;
    };
    const { POST } = await import("@/app/api/personal-guide/route");
    const res = await POST(guidePost("192.0.2.12"));
    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("10");
  });

  it("7 POSTs in a minute from one IP: 6 answered, the 7th is 429", async () => {
    const { POST } = await import("@/app/api/personal-guide/route");
    const statuses: number[] = [];
    let last: Response | null = null;
    for (let i = 0; i < 7; i++) {
      last = await POST(guidePost("192.0.2.13"));
      statuses.push(last.status);
    }
    expect(statuses).toEqual([200, 200, 200, 200, 200, 200, 429]);
    expect(last?.headers.get("Retry-After")).toBeTruthy();
  });

  it("the reply allowance leaves room past the model's reasoning", () => {
    expect(GUIDE_MAX_TOKENS).toBeGreaterThanOrEqual(800);
    expect(read("src/app/api/personal-guide/route.ts")).toContain("maxTokens: GUIDE_MAX_TOKENS");
  });

  it("a failing durable store still counts in memory and says which store answered", async () => {
    const mod = await import("@/lib/durable-counter.server");
    setDurableCounterStore(mod.totalumCounterStore);
    const r = await takeRateLimit("personal-guide:192.0.2.14", 6, 60_000, Date.UTC(2026, 9, 17));
    expect(r.allowed).toBe(true);
    expect(["cache", "memory"]).toContain(r.store);
    expect(rateLimitHeaders(r)["X-RateLimit-Store"]).toBe(r.store);
  });
});

describe("CR-4 one shared disclaimer", () => {
  it("home, /trust and /tax render <DisclaimerNotice variant=\"full\" />; /status once via PublicGuide", () => {
    for (const f of ["src/app/page.tsx", "src/app/trust/page.tsx", "src/components/tax/TaxPageContent.tsx", "src/app/pricing/page.tsx"]) {
      const src = read(f);
      expect(src, f).toContain('<DisclaimerNotice variant="full"');
      expect(src.match(/<DisclaimerNotice/g)?.length, f).toBe(1);
    }
    expect(read("src/app/status/page.tsx")).not.toContain("DisclaimerNotice");
    expect(read("src/components/public/PublicGuide.tsx").match(/<DisclaimerNotice/g)?.length).toBe(1);
  });
});

describe("CR-5 headers", () => {
  it("no stale report-only CSP; enforced CSP is nonce-based (goal b8)", () => {
    const h = SECURITY_HEADERS as Record<string, string>;
    expect(h["Content-Security-Policy-Report-Only"]).toBeUndefined();
    expect(h["Content-Security-Policy"]).toContain("object-src 'none'");
    expect(h["Content-Security-Policy"]).not.toContain("'unsafe-inline'");
  });
});

describe("M-3 distinct bot-page copy", () => {
  it("each bot page has its own note and no page repeats the paper-book paragraph", () => {
    const notes = Object.values(BOT_PAGE_NOTES);
    expect(new Set(notes).size).toBe(4);
    expect(BOT_PAGE_DISCLAIMER).toBe(POSITIONING_LINE);
    const guide = read("src/components/public/BotGuide.tsx");
    expect(guide).not.toContain("PAPER_BOOK_STATEMENT");
    expect(read("src/lib/bot-guides.ts")).not.toContain(PAPER_BOOK_STATEMENT.slice(0, 40));
  });
});

describe("M-4 /performance wording", () => {
  it("no single-session wording against the 7–8 Jul dates", () => {
    const blob = read("src/components/performance/LiveExamplesGallery.tsx") + read("src/app/performance/page.tsx");
    expect(blob).not.toMatch(/one session|late session|that session|that day|day's high|One day's/);
    expect(blob).toContain("two-day");
  });
});

describe("M-5 US$ on compact USD amounts", () => {
  it("market cap reads US$", () => {
    expect(fmtCompactUsd(1.64e12)).toBe("US$1.64T");
    expect(fmtCompactUsd(-2.5e9)).toBe("-US$2.5B");
    const d = cryptoDetailCopy({ slug: "bitcoin", name: "Bitcoin", symbol: "btc", priceUsd: 90000, marketCapUsd: 1.64e12 });
    expect(d.description).toContain("Market cap US$1.64T.");
    expect(d.description).not.toMatch(/(^|[^S])\$1\.64T/);
  });
});

describe("M-11 Ultimate", () => {
  it("reads 'From NZ$199/mo — Talk to us' and shows no yearly 1,990", () => {
    expect(ULTIMATE_FROM_LINE).toBe("From NZ$199/mo — Talk to us");
    expect(PUBLISHED_PLAN_PRICES).not.toMatch(/1,990/);
    expect(read("src/components/pricing/PricingCards.tsx")).toContain("{ULTIMATE_FROM_LINE}");
  });
});

describe("H-13 market-news relevance", () => {
  it("drops overseas think pieces and local crime; keeps NZ/AU and market-wide news", () => {
    expect(isNewsRelevant({ headline: "Will Starlink Mobile matter for Apple?", summary: "Apple shares and the stock", market: "US" })).toBe(false);
    expect(isNewsRelevant({ headline: "What Are Starbucks Stock Bulls Not Worried About?", summary: "Starbucks stock", market: "US" })).toBe(false);
    expect(isNewsRelevant({ headline: "Former dairy manager sentenced over $320,000 kickbacks", summary: "The company lost money", market: "NZX" })).toBe(false);
    expect(isFinanceRelevant("Man jailed for fraud at Auckland firm")).toBe(false);
    expect(isNewsRelevant({ headline: "Fisher & Paykel lifts earnings guidance", market: "NZX" })).toBe(true);
    expect(isNewsRelevant({ headline: "RBNZ holds the OCR as inflation eases", market: "NZX" })).toBe(true);
    expect(isNewsRelevant({ headline: "BHP shares rise as iron ore prices climb", market: "ASX" })).toBe(true);
    expect(isNewsRelevant({ headline: "Wall Street closes higher after Fed signals rate cut", market: "US" })).toBe(false); // b11 H-13 allow-list: US-only market-wide news is dropped
    expect(isNewsRelevant({ headline: "Insider trading case: NZX-listed firm director convicted", market: "NZX" })).toBe(true);
  });
});

describe("batch 5 pins", () => {
  it("build string and pull-check marker", () => {
    expect(read("public/build-version.txt").trim()).toBe("v3-g10-b73-2026-10-28");
    expect(read("qa/PULL-CHECK-2026-10-12.md")).toContain("pull-check:v3-must-fix-b5-2026-10-17");
  });
});
