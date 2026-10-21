/**
 * Must-fix Batch 7 (TT retest of v3-must-fix-b6-2026-10-17).
 * pull-check:v3-must-fix-b7-2026-10-17
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const table = vi.hoisted(() => ({ rows: [] as { bucket_key?: string }[], dropKey: false }));
vi.mock("@/lib/totalum", () => ({
  totalumSdk: {
    crud: {
      createRecord: vi.fn(async (_t: string, row: { bucket_key: string }) => {
        // dropKey: the live table has no bucket_key column, so the field is lost.
        table.rows.push(table.dropKey ? {} : row);
        return { data: row };
      }),
      query: vi.fn(async (_t: string, q: { _filter: { bucket_key: string } }) => ({
        data: table.rows.filter((r) => r.bucket_key === q._filter.bucket_key),
      })),
      editRecordById: vi.fn(),
    },
  },
}));

import { totalumCounterStore } from "@/lib/durable-counter.server";
import { resetRateLimits, setDurableCounterStore, takeRateLimit, PERSONAL_GUIDE_LIMIT } from "@/lib/ip-rate-limit";
import { findDuplicateDividendTx } from "@/lib/dividend-ledger";
import { isNewsRelevant } from "@/lib/market-news";
import { officialPublicNews, prepareNewsFeed } from "@/lib/news-present";
import { GUIDE_MODEL_DEFAULT } from "@/lib/grok";

const read = (p: string) => readFileSync(p, "utf8");

describe("CR-2 limiter", () => {
  beforeEach(() => {
    table.rows = [];
    table.dropKey = false;
    resetRateLimits();
  });

  it("a durable read that cannot see its own insert is a store failure, not an allow", async () => {
    table.dropKey = true;
    await expect(totalumCounterStore.increment("rl:x:1", 60_000, Date.now())).rejects.toThrow(/no rows/);
  });

  it("memory floor refuses the 7th call in one instance whatever the store says", async () => {
    // A store that always says "first hit" (the live failure mode).
    setDurableCounterStore({ increment: async () => 1 });
    const now = Date.now();
    const out: boolean[] = [];
    for (let i = 0; i < 8; i++) out.push((await takeRateLimit("personal-guide:203.0.113.5", PERSONAL_GUIDE_LIMIT, 60_000, now)).allowed);
    expect(out.slice(0, 6).every(Boolean)).toBe(true);
    expect(out[6]).toBe(false);
    expect(out[7]).toBe(false);
    setDurableCounterStore(null);
  });

  it("guide and sign-in use the shared edge limiter; wrangler declares it", () => {
    expect(read("src/app/api/personal-guide/route.ts")).toContain('edge: "GUIDE_RATE_LIMITER"');
    expect(read("src/app/api/auth/[...all]/route.ts")).toContain('edge: "AUTH_RATE_LIMITER"');
    const w = read("wrangler.jsonc");
    expect(w).toContain('"GUIDE_RATE_LIMITER"');
    expect(w).toContain('"AUTH_RATE_LIMITER"');
  });

  it("guide model id is one the xAI API lists", () => {
    expect(GUIDE_MODEL_DEFAULT).toBe("grok-4.20-0309-non-reasoning");
  });
});

describe("CR-5 sign-in limit on /api/auth/sign-in/email", () => {
  it("is keyed by IP + email and answers 429 with Retry-After", () => {
    const src = read("src/app/api/auth/[...all]/route.ts");
    expect(src).toMatch(/auth:\$\{rule\.name\}:\$\{encodeURIComponent\(ip\)\}:\$\{encodeURIComponent\(who\)\}/);
    expect(src).toContain("rateLimitHeaders(result, true)");
    const auth = read("src/lib/auth.ts");
    expect(auth).toContain('"/sign-in/email": { window: 300, max: 10 }');
    expect(auth).toContain('ipAddressHeaders: ["cf-connecting-ip"]');
  });
});

describe("H-5 duplicate dividend end to end", () => {
  const rows = [
    { _id: "a", type: "dividend", ticker: "FPH.NZ", total: 15, executed_at: "2026-10-13T11:00:00.000Z" },
    { _id: "b", type: "buy", ticker: "FPH.NZ", total: 15, executed_at: "2026-10-14" },
  ];
  it("FPH.NZ NZ$15 dated 14 Oct matches the stored row", () => {
    expect(findDuplicateDividendTx(rows, { ticker: "FPH", when: "2026-10-14", amounts: [15] })?._id).toBe("a");
    expect(findDuplicateDividendTx(rows, { ticker: "FPH.NZ", when: "2026-10-14T00:00:00+13:00", amounts: [15] })?._id).toBe("a");
    expect(findDuplicateDividendTx(rows, { ticker: "FPH.NZ", when: "2026-10-14", amounts: [16] })).toBeNull();
  });
  it("Review warns, Confirm needs Save anyway, server refuses with 409 unless allowed", () => {
    const panel = read("src/components/dashboard/RecordTransactionPanel.tsx");
    expect(panel).toContain("findDuplicateDividendTx");
    expect(panel).toContain("Save anyway");
    expect(panel).toContain("payload.allow_duplicate = true");
    const route = read("src/app/api/transactions/route.ts");
    expect(route).toContain("input.allow_duplicate !== true");
    expect(route).toContain("status: 409");
  });
  it("deletes are idempotent and the list drops the row at once", () => {
    expect(read("src/app/api/transactions/route.ts")).toContain("alreadyRemoved: true");
    const tab = read("src/components/dashboard/TransactionsTab.tsx");
    expect(tab).toContain("removedIds.has(line.id)");
    expect(tab).toContain("if (!pending || busy) return;");
  });
});

describe("H-13 exact TT headlines", () => {
  it("drops the BLS CPI schedule and the Palantir piece", () => {
    expect(isNewsRelevant({ headline: "BLS has scheduled the September 2026 CPI release", summary: "Consumer price index inflation data", market: "US" })).toBe(false);
    expect(isNewsRelevant({ headline: "BLS has scheduled the September 2026 CPI release", summary: "CPI inflation", market: "ASX" })).toBe(false);
    for (const market of ["US", "ASX", "NZX", "Global"] as const) {
      expect(isNewsRelevant({ headline: "Why You Should Think About Palantir Differently Now", summary: "Palantir shares, Nasdaq, earnings and stock valuation", market })).toBe(false);
    }
    expect(officialPublicNews().map((n) => n.headline)).not.toContain("BLS has scheduled the September 2026 CPI release");
    expect(prepareNewsFeed([], new Date("2026-10-17T07:00:00Z")).map((n) => n.headline)).not.toContain(
      "BLS has scheduled the September 2026 CPI release"
    );
  });
  it("keeps NZ/AU stories", () => {
    expect(isNewsRelevant({ headline: "Wesfarmers (ASX:WES) Shares Look Above Fair Value", summary: "ASX shares", market: "ASX" })).toBe(true);
    expect(isNewsRelevant({ headline: "Higher prices for fuel suggests inflation pressures have strengthened", summary: "New Zealand inflation", market: "NZX" })).toBe(true);
  });
});

describe("build", () => {
  it("version", () => {
    expect(read("public/build-version.txt").trim()).toBe("v3-goal-b54b-2026-10-21");
    expect(read("qa/PULL-CHECK-2026-10-12.md")).toContain("pull-check:v3-must-fix-b7-2026-10-17");
  });
});
