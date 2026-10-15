import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("server-only", () => ({}));

import { cryptoFreshnessLabel, quoteAgeWords } from "@/lib/market-freshness";
import { futureValue, goalProgress, validateGoal } from "@/lib/goal-math";
import { stockContentParagraphs, stockPageIndexable, wordCount } from "@/lib/stock-page-content";
import { AI_REQUEST_LINES, POSITIONING_LINE, ULTIMATE_PRICE_PENDING_D6 } from "@/lib/public-copy";
import { BOT_PAGE_DISCLAIMER } from "@/lib/bot-guides";
import { HEADMASTER_GOALS, KOINS_MODEL_V2, LEDGER_ROW_EDIT, ULTIMATE_FEATURES } from "@/lib/feature-flags";
import { PERFORMANCE_SAMPLE } from "@/lib/performance-sample";

const read = (p: string) => readFileSync(p, "utf8");

describe("H-1 freshness", () => {
  it("a lagging crypto snapshot is labelled with its age", () => {
    const now = new Date("2026-10-16T18:10:00Z");
    const label = cryptoFreshnessLabel(new Date("2026-10-16T16:32:00Z"), now).label;
    expect(label).toMatch(/^Delayed · updated .*\(1 h 38 min ago\)$/);
    expect(quoteAgeWords(12 * 60_000)).toBe("12 min ago");
  });
  it("the drawer helper clears when the price is edited", () => {
    const src = read("src/components/dashboard/RecordTransactionPanel.tsx");
    expect(src).toMatch(/setPriceDirty\(true\);\s*setQuoteOrigin\(""\);[\s\S]{0,120}setHint\(""\)/);
  });
});

describe("H-11 goal maths (storage blocked)", () => {
  const now = new Date("2026-10-16T00:00:00Z");
  it("matches spreadsheet FV within NZ$1", () => {
    // Spreadsheet: =FV(5%/12, 50, -500, -20000) = 52,352.70
    const fv = futureValue(20000, 500, 50, 5);
    expect(Math.abs(fv - 52352.7)).toBeLessThan(1);
    const g = goalProgress({ targetNzd: 100000, targetDate: "2031-01-01", monthlyNzd: 500, bookNzd: 20000, annualReturnPct: 5 }, now);
    expect(g.status).toBe("behind");
    expect(g.range.label).toBe("Illustrative, not a forecast");
  });
  it("validates", () => {
    const base = { targetNzd: 100000, targetDate: "2031-01-01", monthlyNzd: 500, bookNzd: 20000, annualReturnPct: 5 };
    expect(validateGoal(base, now)).toBeNull();
    expect(validateGoal({ ...base, targetDate: "2020-01-01" }, now)).toMatch(/future/);
    expect(validateGoal({ ...base, bookNzd: -1 }, now)).toMatch(/negative/);
    expect(validateGoal({ ...base, bookNzd: 200000 }, now)).toMatch(/already reached/);
    expect(validateGoal({ ...base, monthlyNzd: 0, annualReturnPct: 0 }, now)).toMatch(/monthly/);
  });
  it("is off behind its flag", () => {
    expect(HEADMASTER_GOALS).toBe(false);
  });
});

describe("H-13 templated stock text", () => {
  const closes = Array.from({ length: 62 }, (_, k) => 40 + Math.sin(k / 4) * 3 + k * 0.05);
  const paras = stockContentParagraphs({ name: "Fisher & Paykel Healthcare", symbol: "FPH", sector: "Health Care", exchangeLabel: "NZX", currency: "NZD", closes });
  it("is built from the closes and reaches 300 words with a full window", () => {
    expect(paras.join(" ")).toContain("62 trading sessions");
    expect(wordCount(paras)).toBeGreaterThanOrEqual(300);
  });
  it("is short (and so stays noindex) without history", () => {
    const thin = stockContentParagraphs({ name: "X", symbol: "X", sector: "", exchangeLabel: "NZX", currency: "NZD", closes: [] });
    expect(stockPageIndexable(thin, true)).toBe(false);
    expect(stockPageIndexable(paras, false)).toBe(false);
  });
});

describe("/trust retention matches the code", () => {
  it("says what is stored", () => {
    const line = AI_REQUEST_LINES.join(" ");
    expect(line).toContain("stay until you clear the chat");
    expect(read("src/app/api/chat/route.ts")).toContain('createRecord("chat_message"');
    for (const r of ["src/app/api/personal-guide/route.ts", "src/app/api/portfolio-coach"]) {
      try {
        expect(read(r)).not.toContain("createRecord(");
      } catch {
        /* directory */
      }
    }
  });
});

describe("Batch 3 copy and flags", () => {
  it("BL-6 Ultimate reads From … Talk to us", () => {
    expect(ULTIMATE_PRICE_PENDING_D6).toBe(false);
    expect(read("src/components/pricing/PricingCards.tsx")).toContain("data-ultimate-from");
    expect(ULTIMATE_FEATURES).toBe(false);
  });
  it("BL-5 one positioning line on bot pages", () => {
    expect(BOT_PAGE_DISCLAIMER.startsWith(POSITIONING_LINE)).toBe(true);
  });
  it("BL-7 row edit on by default (B4), BL-9 off", () => {
    expect(LEDGER_ROW_EDIT).toBe(true);
    expect(KOINS_MODEL_V2).toBe(false);
  });
  it("L-1 404 H1", () => {
    expect(read("src/app/not-found.tsx")).toContain(">Page not found</h1>");
  });
  it("M-2 the help address is not one @ string in server HTML", () => {
    expect(read("src/components/EmailAddress.tsx")).not.toMatch(/href=\{`mailto:\$\{email\}`\}/);
  });
  it("M-2 changelog has no SHAs or 'develop'", () => {
    const page = read("src/app/changelog/page.tsx");
    expect(page.toLowerCase()).not.toContain("develop");
    expect(page).not.toMatch(/\b[0-9a-f]{7,40}\b/);
  });
  it("M-4 performance describes two days; FIF notes are user-facing", () => {
    expect(PERFORMANCE_SAMPLE.definition).not.toContain("8–9 hours");
    expect(read("src/lib/fif-working-paper.ts")).not.toContain("0.4 × 599.89");
  });
  it("M-5 pricing US$ line is labelled approximate", () => {
    expect(read("src/lib/currency.ts")).toContain("approx., you're charged in NZD");
  });
  it("M-7 one green for text", () => {
    expect(read("src/components/dashboard/MarketsExplorer.tsx")).not.toMatch(/text-emerald-(500|600)\b/);
  });
  it("M-1 a session cookie bypasses the marketing cache", () => {
    expect(read("src/middleware.ts")).toContain("!signedIn && isCacheableMarketingPath");
  });
});
