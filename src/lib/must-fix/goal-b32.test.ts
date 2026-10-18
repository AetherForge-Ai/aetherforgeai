// pull-check:v3-goal-b32-2026-10-19
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { allPaidFeatureLines, paidFeatureSweep, PUBLIC_PAID_PLAN_KEYS, ruleFor } from "@/lib/paid-features";
import { fixture500Snapshot } from "@/lib/fixture-500";

const read = (p: string) => readFileSync(p, "utf8");

describe("b32 L-4: each paid feature on /pricing has a gate and the gate grants it", () => {
  it("every public paid feature line maps to a rule", () => {
    const unmapped = allPaidFeatureLines().filter((line) => !ruleFor(line));
    expect(unmapped).toEqual([]);
  });
  it.each(PUBLIC_PAID_PLAN_KEYS)("%s: every line is granted by the code", (key) => {
    const rows = paidFeatureSweep(key);
    expect(rows.length).toBeGreaterThan(3);
    expect(rows.filter((r) => !r.ok)).toEqual([]);
  });
  it("Starter is one bot, 25 holdings, 15 reports, 100 queries; Pro is both bots, 75, unlimited reports, 500", () => {
    const starter = Object.fromEntries(paidFeatureSweep("starter_monthly").map((r) => [r.feature, r.granted]));
    expect(starter["One of Stox or Koins"]).toBe("bot access single");
    expect(starter["Up to 25 holdings"]).toBe("25 holdings");
    expect(starter["15 AI research reports per month"]).toBe("15 reports/month");
    expect(starter["100 Market Assistant queries per month"]).toBe("100 queries/month");
    expect(starter["Basic Headmaster"]).toBe("headmaster basic");
    const pro = Object.fromEntries(paidFeatureSweep("pro_monthly").map((r) => [r.feature, r.granted]));
    expect(pro["Stox and Koins"]).toBe("bot access both");
    expect(pro["Up to 75 holdings"]).toBe("75 holdings");
    expect(pro["500 Market Assistant queries per month"]).toBe("500 queries/month");
    expect(pro["Risk & stress testing"]).toBe("headmaster full");
  });
  it("the allow-listed sweep page is gated like the other test hooks", () => {
    const page = read("src/app/test-hooks/paid-features/page.tsx");
    expect(page).toMatch(/currentUserMayUseTestHooks\(\)\)\) notFound\(\)/);
    expect(page).toMatch(/data-paid-feature/);
  });
});

describe("b32 H-4: 500-row ledger at /dashboard/transactions, quota within 1 s", () => {
  it("the fixture has 500 ledger rows and no Math.random", () => {
    expect(fixture500Snapshot().ledger.length).toBe(500);
    expect(read("src/lib/fixture-500.ts")).not.toMatch(/Math\.random/);
  });
  it("/dashboard/transactions?fixture=500 renders the fixture only for allow-listed accounts", () => {
    const page = read("src/app/dashboard/transactions/page.tsx");
    expect(page).toMatch(/fixture === "500"/);
    expect(page).toMatch(/currentUserMayUseTestHooks\(\)/);
    expect(page).toMatch(/permanentRedirect\(dashboardRedirectHref/);
  });
  it("the quota read on the 500-row page is bounded (b37: streamed in Suspense, 2 attempts)", () => {
    expect(read("src/components/dashboard/Fixture500Page.tsx")).toMatch(/readReportQuota\(FIXTURE_QUOTA_ATTEMPT_MS, 2\)/);
    expect(read("src/lib/dashboard-quota.server.ts")).toMatch(/attempts = 2/);
  });
  it("the 3-run LCP/CLS harness checks LCP < 2.5 s and CLS < 0.1", () => {
    const h = read("qa/local-harness/h4-500-lcp.cjs");
    expect(h).toMatch(/RUNS = 3/);
    expect(h).toMatch(/2500/);
    expect(h).toMatch(/0\.1/);
  });
});

// ---------------------------------------------------------------- P1 (TT b31 signed-in)
import { applyJournal, noteWrite, readJournal, correctFromJournal } from "@/lib/write-journal";
import { acknowledgedId } from "@/components/dashboard/RecordTransactionPanel";
import { signLastGoodSession, verifyLastGoodSession } from "@/lib/last-good-session";
import { coachStaticFactReply } from "@/lib/portfolio-coach-knowledge";
import { optimisticRealisedNzd, type PortfolioSnapshot } from "@/lib/portfolio-snapshot";
import { formatLedgerQtyPrice } from "@/lib/ledger-line-format";

function memStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}
function snap(ids: string[], cash: number): PortfolioSnapshot {
  const fig = (value: number) => ({ value, display: `NZ$${value.toFixed(2)}` });
  return {
    ledger: ids.map((id) => ({ id })),
    kpis: { cash: fig(cash), netWorth: fig(cash + 1000) },
    grand: fig(cash + 1000),
    groups: [],
  } as unknown as PortfolioSnapshot;
}

describe("b32 G-10 P1: delete then reload never brings the row or old cash back", () => {
  it("a lagging read after a reload is corrected from the journal, then the journal clears", () => {
    const s = memStore();
    const t0 = 1_000_000;
    noteWrite("u1", { deletedId: "buy-1", cashAfter: 1000 }, s, t0);
    // Reload 7 s later: a fresh journal read from storage (no React state survives).
    const lagging = snap(["buy-1", "dep-1"], 513.9);
    const fixed = correctFromJournal("u1", lagging, s, t0 + 7_000);
    expect(fixed.ledger.map((r) => r.id)).toEqual(["dep-1"]);
    expect(fixed.kpis.cash.value).toBe(1000);
    expect(fixed.kpis.netWorth.value).toBe(2000);
    // Server catches up at 17 s: no correction, journal emptied.
    const caught = snap(["dep-1"], 1000);
    expect(correctFromJournal("u1", caught, s, t0 + 17_000)).toBe(caught);
    expect(Object.keys(readJournal("u1", s, t0 + 17_000).deleted)).toEqual([]);
  });
  it("a created row the read is missing keeps the acknowledged cash; entries expire after the window", () => {
    const s = memStore();
    noteWrite("u1", { createdId: "dep-9", cashAfter: 1000 }, s, 0);
    const out = applyJournal(snap([], 0), readJournal("u1", s, 5_000), 5_000);
    expect(out.snapshot.kpis.cash.value).toBe(1000);
    expect(applyJournal(snap([], 0), readJournal("u1", s, 60_000), 60_000).corrected).toBe(false);
  });
  it("the journal is per user", () => {
    const s = memStore();
    noteWrite("u1", { deletedId: "x" }, s, 0);
    expect(readJournal("u2", s, 1).deleted).toEqual({});
  });
});

describe("b32 G-10 P1: a failed or unacknowledged write is never shown as saved", () => {
  it("acknowledgedId needs ok and the saved row id", () => {
    expect(acknowledgedId({ ok: false, data: { lastTransaction: { _id: "a" } } })).toBeNull();
    expect(acknowledgedId({ ok: true, data: {} })).toBeNull();
    expect(acknowledgedId({ ok: true, data: { lastTransaction: { _id: "optimistic-1" } } })).toBeNull();
    expect(acknowledgedId({ ok: true, data: { lastTransaction: { _id: "rec_1" } } })).toBe("rec_1");
  });
  it("the panel: no success toast before acknowledgement, loading toast on the slow path, rollback on failure", () => {
    const src = read("src/components/dashboard/RecordTransactionPanel.tsx");
    // b37 G-10 P1: the early close / background slow path is gone; the dialog waits (timeout-bounded) for the row id.
    expect(src).toMatch(/withWriteTimeout\(api\.post\("\/api\/transactions", payload\), WRITE_TIMEOUT_MS\)/);
    expect(src).not.toContain('early === "slow"');
    const fast = src.slice(src.indexOf("const res = await pending;"));
    expect(fast.indexOf("if (!savedId) {")).toBeLessThan(fast.indexOf('toast.success("Transaction recorded")'));
  });
  it("the buy path skips the dry-run round trip below the smallest plan cap", () => {
    expect(read("src/components/dashboard/RecordTransactionPanel.tsx")).toMatch(/newSleeve && distinctHeld >= MIN_PLAN_HOLDING_CAP - 1/);
  });
  it("the cash-below-zero check waits for the book (cashKnown)", () => {
    expect(read("src/lib/transaction-rules.ts")).toMatch(/input\.cashKnown && input\.cashAfterNzd < -1e-6/);
  });
  it("an optimistic sell shows realised at once; a cash row has no 'no price' note", () => {
    const s = { ...snap([], 0), groups: [{ positions: [{ ticker: "FPH.NZ", quantity: 10, costBase: { value: 486.1 } }] }] } as unknown as PortfolioSnapshot;
    expect(optimisticRealisedNzd(s, "fph.nz", 4, 200 - 0)).toBeCloseTo(200 - 194.44, 2);
    expect(formatLedgerQtyPrice({ quantity: null, price: null, currency: "NZD" }).reason).toBeNull();
  });
});

describe("b32 REG-1 P1: the session lookup never blocks render", () => {
  it("the signed last-good session verifies only for the same token and secret, and expires", async () => {
    const v = await signLastGoodSession("sec", "tok-1", { id: "u1", email: "a@b.c" }, 0);
    expect((await verifyLastGoodSession("sec", "tok-1", v, 1000))?.uid).toBe("u1");
    expect(await verifyLastGoodSession("sec", "tok-2", v, 1000)).toBeNull();
    expect(await verifyLastGoodSession("other", "tok-1", v, 1000)).toBeNull();
    expect(await verifyLastGoodSession("sec", "tok-1", v, 31 * 60_000)).toBeNull();
    expect(await verifyLastGoodSession("sec", "tok-1", v.replace(/.$/, v.endsWith("a") ? "b" : "a"), 1000)).toBeNull();
  });

  describe("load test: auth store hangs, cold isolate", () => {
    const findSession = vi.fn();
    const getRecordById = vi.fn();
    let cookie = "tok=signed";
    beforeEach(() => {
      vi.resetModules();
      vi.doMock("next/headers", () => ({ headers: async () => new Headers({ cookie }) }));
      vi.doMock("@/lib/auth", () => ({
        auth: { $context: Promise.resolve({ authCookies: { sessionToken: { name: "tok" } }, secret: "s", internalAdapter: { findSession } }) },
      }));
      vi.doMock("@/lib/totalum", () => ({ totalumSdk: { crud: { getRecordById } } }));
      vi.doMock("@/lib/session-token", async (orig) => ({
        ...(await orig<typeof import("@/lib/session-token")>()),
        verifySignedSessionToken: async () => "raw-token",
      }));
      findSession.mockImplementation(() => new Promise(() => {})); // hangs forever
      getRecordById.mockImplementation(() => new Promise(() => {}));
    });
    afterEach(() => vi.doUnmock("next/headers"));

    it("20 concurrent renders with a hung store each resolve the user from the signed last-good session in under 3 s", async () => {
      const value = await signLastGoodSession("s", "raw-token", { id: "u1", email: "a@b.c", name: "A" });
      cookie = `tok=signed; af_ls=${value}`;
      const { getCurrentUser, SESSION_LOOKUP_TIMEOUT_MS } = await import("@/lib/session");
      expect(SESSION_LOOKUP_TIMEOUT_MS).toBe(1500);
      const t0 = Date.now();
      const users = await Promise.all(Array.from({ length: 20 }, () => getCurrentUser()));
      const ms = Date.now() - t0;
      expect(users.every((u) => u?._id === "u1")).toBe(true);
      expect(ms).toBeLessThan(3_000);
    }, 10_000);

    it("without a last-good cookie the hung store gives 'unavailable' in under 2 s, not a 25 s hang", async () => {
      cookie = "tok=signed";
      const { getSessionState } = await import("@/lib/session");
      const t0 = Date.now();
      const state = await getSessionState();
      expect(state.unavailable).toBeTruthy();
      expect(Date.now() - t0).toBeLessThan(2_000);
    }, 10_000);
  });
});

describe("b32 CR-2 P1: refusals and fixed facts answer before any network or model call", () => {
  it("broker questions get plain examples, no ranking or speed/accuracy claims", () => {
    const r = coachStaticFactReply("Which broker should I use in NZ?") || "";
    expect(r).toMatch(/examples only, in no particular order/);
    expect(r).not.toMatch(/\b(best|fastest|cheapest|most accurate|top)\b/i);
    expect(coachStaticFactReply("Is this a paper book?")).toMatch(/paper book/);
  });
  it("the route answers refusals and static facts before the quota read, under a 9 s total deadline", () => {
    const src = read("src/app/api/portfolio-coach/route.ts");
    const refusal = src.indexOf("if (isSharePickRequest(userMessage))");
    const quota = src.indexOf("boundedRead(readAssistantQuota(user)");
    expect(refusal).toBeGreaterThan(0);
    expect(refusal).toBeLessThan(quota);
    expect(src.indexOf("coachStaticFactReply(userMessage)")).toBeLessThan(quota);
    expect(src).toMatch(/COACH_TOTAL_DEADLINE_MS = 9_000/);
  });
});

describe("b32 CR-2: FIF de minimis line follows the IRD test", () => {
  it("total cost of FIF interests more than NZ$50,000 at any time, not a sum over the year", () => {
    const g = read("src/lib/guide-facts.ts");
    expect(g).toMatch(/total cost of your FIF interests is more than NZ\$50,000 at any time in the income year/);
    expect(g).not.toMatch(/add up the cost of attributing overseas shares held at any time/);
  });
});

describe("b32 addendum: CR-2 FIF facts and BS-01 error mapping", () => {
  it("FIF static reply: cost incl. fees, any time, NZ/ASX excluded, NZ$100k only 2 equal owners, indicative", () => {
    const r = coachStaticFactReply("What is the FIF de minimis threshold?") || "";
    expect(r).toMatch(/including fees/);
    expect(r).toMatch(/at any time in the income year/);
    expect(r).toMatch(/New Zealand shares and most ASX-listed shares/);
    expect(r).toContain("NZ$50,000 per natural person"); // b37 CR-2 (Chief): per-person rule
    expect(r).toMatch(/Indicative, not tax advice/);
  });
  it("IBKR: User-Agent sent; XML ErrorCode on a non-200 is parsed; bare 403 is not a token error", () => {
    const src = read("src/lib/broker-sync/ibkr-sync.server.ts");
    expect(src).toMatch(/"User-Agent": IBKR_USER_AGENT/);
    expect(src).toMatch(/!res\.ok && \/<ErrorCode>/);
    expect(src).toMatch(/Check your Flex token and Query ID in Client Portal/);
    expect(read("src/lib/broker-sync/ibkr-flex.ts")).toMatch(/"1015":/);
  });
});

import { fdrIncome, comparativeValue, fifTotals } from "@/lib/fif-working-paper";
describe("b32 G-12 golden: 5-holding FIF fixture sums to the printed total (per line, then sum)", () => {
  // Opening values chosen so 5% lands on half-cents and sub-cents.
  const holdings = [
    { costNzd: 12_345.67, opening: 10_000.1, closing: 11_234.57, gains: 0, costs: 0 },
    { costNzd: 9_876.54, opening: 9_999.99, closing: 9_500.05, gains: 120.33, costs: 0 },
    { costNzd: 15_000.01, opening: 14_321.09, closing: 15_678.91, gains: 0, costs: 2_000 },
    { costNzd: 7_777.77, opening: 7_000.03, closing: 6_543.21, gains: 55.55, costs: 0 },
    { costNzd: 5_555.55, opening: 5_432.11, closing: 5_999.99, gains: 0, costs: 0 },
  ];
  const lines = holdings.map((h) => ({
    costNzd: h.costNzd,
    fdrNzd: fdrIncome(h.opening),
    cvNzd: comparativeValue({ openingNzd: h.opening, closingNzd: h.closing, gainsNzd: h.gains, costsNzd: h.costs }),
  }));
  it("per-line FDR values are rounded to the cent", () => {
    expect(lines.map((l) => l.fdrNzd)).toEqual([500.01, 500, 716.05, 350, 271.61]);
  });
  it("printed totals equal the sum of the printed lines, to the cent", () => {
    const t = fifTotals(lines);
    expect(t.fdrNzd).toBe(2337.67);
    expect(t.costNzd).toBe(50_555.54);
    const cvSum = lines.reduce((c, l) => c + Math.round((l.cvNzd as number) * 100), 0) / 100;
    expect(t.cvNzd).toBe(cvSum);
  });
});
