/**
 * b86: G-19 / G-27 / G-28. pull-check:v3-b90-2026-10-29
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CHALLENGE_PROMPT, aiShowWorkingEnabled, showWorking } from "@/lib/ai-working";

const read = (p: string) => readFileSync(p, "utf8");

describe("b86 pins", () => {
  it("pins the build", () => {
    expect(read("public/build-version.txt").trim()).toBe("v3-b96-2026-11-02");
    expect(read("qa/PULL-CHECK-2026-10-12.md")).toContain("pull-check:v3-b90-2026-10-29");
  });
});

/** Deterministic sample (no randomness): 100 notes built only from figures in their own context. */
function sample(i: number) {
  const value = 1000 + i * 137.25;
  const gain = ((i * 7) % 40) - 10 + 0.5;
  const weight = 5 + (i % 30) + 0.1;
  const context = `AAPL value NZ$${value.toFixed(2)}; gain ${gain.toFixed(1)}%; weight ${weight.toFixed(1)}%`;
  const reply = `Your AAPL holding is worth NZ$${value.toFixed(2)}, up ${gain.toFixed(1)}% and ${weight.toFixed(1)}% of the portfolio.`;
  return { context, reply };
}

describe("b86 G-19 show your working", () => {
  it("100 sampled AI notes each have 1+ source and 0 unsupported numbers", () => {
    let unsupported = 0;
    for (let i = 0; i < 100; i++) {
      const { context, reply } = sample(i);
      const w = showWorking(reply, context, { asOf: "2026-10-28T06:00:00Z" });
      expect(w.sources.length).toBeGreaterThanOrEqual(1);
      expect(w.asOf).toBeTruthy();
      expect(w.checkedNumbers).toBeGreaterThanOrEqual(3);
      unsupported += w.unsupported.length;
    }
    expect(unsupported).toBe(0);
  });
  it("flags an invented figure and drops confidence", () => {
    const w = showWorking("Worth NZ$9,999.99 today.", "AAPL value NZ$1,000.00");
    expect(w.unsupported).toEqual(["NZ$9,999.99"]);
    expect(w.confidence).toBe("Low");
  });
  it("keeps AI_SHOW_WORKING off unless set to 1, and ships a challenge prompt", () => {
    expect(aiShowWorkingEnabled({})).toBe(false);
    expect(aiShowWorkingEnabled({ AI_SHOW_WORKING: "1" })).toBe(true);
    expect(CHALLENGE_PROMPT).toMatch(/^Challenge this/);
    const ui = read("src/components/chat/ChatAssistant.tsx");
    expect(ui).toMatch(/CHALLENGE_PROMPT|Challenge this/);
  });
});

describe("b86 G-27 sharing gated", () => {
  it("every share route is 404 with PORTFOLIO_SHARING off", () => {
    for (const p of ["src/app/api/share/route.ts", "src/app/api/share/[id]/route.ts"]) {
      expect(read(p)).toContain('featureOnFor("PORTFOLIO_SHARING"');
    }
    expect(read("src/app/api/share/route.ts")).toContain("canReadAuditLog");
  });
});

describe("b86 G-28 funnel", () => {
  it("admin summary is 404 when ONBOARDING_FUNNEL_SERVER is off", () => {
    const s = read("src/app/api/admin/onboarding-funnel/route.ts");
    expect(s).toMatch(/if \(!featureOnFor\("ONBOARDING_FUNNEL_SERVER", session as never\)\) \{\s*return new NextResponse\("Not found", \{ status: 404/);
    expect(s).not.toContain("enabled: false");
  });
  it("no gambling-style wording in onboarding copy", () => {
    const s = read("src/components/dashboard/Onboarding30Days.tsx");
    expect(s).not.toMatch(/jackpot|spin|win big|lucky|bet\b|streak/i);
  });
});

describe("b86 H-10 preview hook fixtures (same engine as /api/test-hooks/import-preview)", () => {
  it("each fixture detects its broker, maps its columns, and bad-rows gives 3 errors", async () => {
    const { previewImport } = await import("@/lib/import/plan");
    const m = await import("@/lib/fixtures/broker-import/preview-fixtures");
    const cases = [
      { text: m.SHARESIES_FIXTURE, broker: "sharesies", rows: 3, errors: [] as number[], cash: -380.8 },
      { text: m.HATCH_FIXTURE, broker: "hatch", rows: 2, errors: [], cash: -158.4 },
      { text: m.HATCH_COMMIT_FIXTURE, broker: "hatch", rows: 2, errors: [], cash: -160.5 },
      { text: m.BAD_ROWS_FIXTURE, broker: "sharesies", rows: 2, errors: [3, 4, 5], cash: -125 },
    ];
    for (const c of cases) {
      const p = await previewImport(c.text);
      expect(p.broker).toBe(c.broker);
      expect(p.needsMapping).toBe(false);
      expect(p.toWrite.length).toBe(c.rows);
      expect(p.toWrite.every((r) => r.ticker)).toBe(true);
      expect(p.errors.map((e) => e.line)).toEqual(c.errors);
      expect((p as unknown as { cashNzd: number }).cashNzd).toBeCloseTo(c.cash, 2);
    }
    for (const f of ["sharesies", "hatch", "hatch-commit", "bad-rows"]) {
      expect(read(`src/lib/import/fixtures/${f}.csv`)).toBe((m as Record<string, string>)[
        { sharesies: "SHARESIES_FIXTURE", hatch: "HATCH_FIXTURE", "hatch-commit": "HATCH_COMMIT_FIXTURE", "bad-rows": "BAD_ROWS_FIXTURE" }[f]!
      ]);
    }
    const route = read("src/app/api/test-hooks/import-preview/route.ts");
    expect(route).toContain('"hatch-commit": () => HATCH_COMMIT_FIXTURE');
    expect(route).toContain("runH10Import");
  });
  it("hatch-commit is labelled EXAMPLE DATA and its rates pass the unchanged 5% check", async () => {
    const { reviewedFxAllowed } = await import("@/lib/reviewed-book");
    const m = await import("@/lib/fixtures/broker-import/preview-fixtures");
    expect(m.HATCH_COMMIT_FIXTURE.startsWith("# EXAMPLE DATA.")).toBe(true);
    // ECB trade-date rates and the 27 Oct 2026 snapshot (1.7535): both must pass.
    for (const [rate, dated] of [[1.6848, 1.6848], [1.6964, 1.6964]]) {
      expect(reviewedFxAllowed({ currency: "USD", reviewed: rate, snapshot: 1.7535, historical: dated }).ok).toBe(true);
      expect(reviewedFxAllowed({ currency: "USD", reviewed: rate, snapshot: 1.7535, historical: null }).ok).toBe(true);
    }
    // The check is not loosened: the old 1.65 still fails against the 1.7535 snapshot.
    expect(reviewedFxAllowed({ currency: "USD", reviewed: 1.65, snapshot: 1.7535, historical: null }).ok).toBe(false);
  });
});
