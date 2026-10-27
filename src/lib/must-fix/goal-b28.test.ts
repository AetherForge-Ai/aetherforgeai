// pull-check:v3-goal-b28-2026-10-19
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");

describe("b28 version bump", () => {
  it("pins the build everywhere", () => {
    expect(read("public/build-version.txt").trim()).toMatch(/^v3-(?:goal|h1|g24|dedupe|g10|del404|fix|m7|cr6|g18|cr6b|dashclean|dashclean-d|dashclean-e)-b(2[89]|[3-9]\d)[a-z]?-/);
    expect(read("qa/PULL-CHECK-2026-10-12.md")).toContain("pull-check:v3-goal-b28-2026-10-19");
  });
});

describe("b28 G-20 stored scorecard", () => {
  it("cron still needs the secret and stores the card; the page only reads it", () => {
    const cron = read("src/app/api/cron/track-record/route.ts");
    expect(cron).toContain('status: 401');
    expect(cron).toMatch(/persistTrackRun\(run[,)]/);
    const page = read("src/app/test-hooks/track-record/page.tsx");
    expect(page).toContain("loadTrackRecordView");
    expect(page).not.toMatch(/runTrackRecord\(/);
    expect(page).toContain("runTrackRecordBounded("); // b29: bounded at TRACK_LIVE_WAIT_MS
    expect(page).not.toMatch(/\.ticker|\.signal|reportId/);
  });
  it("the AF-TRS slot is hidden from members and only the ownerless row is read", () => {
    const wl = read("src/app/api/watchlist/route.ts");
    expect(wl.match(/isTrackScorecardTicker\(ticker\)/g)?.length).toBe(2);
    expect(read("src/lib/track-record-store.server.ts")).toContain("!item.user &&");
  });
});

import { reconcileLedger, RECONCILE_WINDOW_MS } from "@/lib/ledger-reconcile";
import { readBookCache, writeBookCache, __resetBookCacheForTests } from "@/lib/book-cache";
import { normalizeGoalRow, formatGoalDate, goalMissingField, encodeGoalLabel } from "@/lib/goal-record";
import { futureValue, monthsUntil } from "@/lib/goal-math";
import { fifThresholdText, fifThresholdSentence } from "@/lib/fif-working-paper";
import { formatAlertRuleLine } from "@/lib/alert-labels";

describe("b28 H-4 member document never drops to the guest gate on a store hiccup", () => {
  it("dashboard shell uses the strict check, shows the slow notice, and rechecks a null once", () => {
    const shell = read("src/components/dashboard/DashboardSessionShell.tsx");
    expect(shell).toContain("confirmDashboardSessionStrict()");
    expect(shell).toContain('setPhase("slow")');
    expect(shell).toContain("SESSION_RECHECK_MS");
    expect(shell).not.toMatch(/confirmDashboardSession\(\)/);
  });
});

describe("b28 G-10 read-after-write", () => {
  const now = 1_000_000;
  const rows = (...ids: string[]) => ids.map((id) => ({ id }));
  it("a lagging read cannot bring back a deleted row or drop a new one", () => {
    const deleted = new Map([["dep1", now - 500]]);
    const out = reconcileLedger(rows("dep1", "b1"), rows("b1", "sell9"), deleted, now - 400, now);
    expect(out.map((r) => r.id).sort()).toEqual(["b1", "sell9"]);
  });
  it("an empty read just after a delete keeps the other rows (never 0)", () => {
    const out = reconcileLedger([], rows("a", "b"), new Map([["c", now]]), now, now);
    expect(out.length).toBe(2);
  });
  it("outside the window the server wins", () => {
    expect(reconcileLedger(rows("x"), rows("y"), new Map(), now - RECONCILE_WINDOW_MS - 1, now)).toEqual(rows("x"));
  });
  it("superseded in b29: reuse is back, but never across this browser's write (af_bw stamp)", () => {
    __resetBookCacheForTests();
    writeBookCache("u1:snapshot", { cash: 51.39 }, undefined, Date.now() - 1);
    expect(readBookCache("u1:snapshot", 15_000, Date.now() + 1)).toBeNull();
  });
  it("the refused-fill text no longer says Confirm overrides", () => {
    const src = read("src/lib/fill-integrity.ts");
    expect(src).not.toContain("Confirm to override");
    expect(src).toContain("Correct the fill price or quantity.");
  });
});

describe("b28 H-11 goals survive a reload", () => {
  const golden = { label: "House", target_nzd: 100000, target_date: "2031-01-01", monthly_nzd: 500, annual_return_pct: 5, start_nzd: 20000 };
  it("an ISO timestamp row with the JSON label reads back as the created goal", () => {
    const stored = { _id: "g1", label: encodeGoalLabel(golden), target_nzd: "100000", target_date: "2031-01-01T00:00:00.000Z", monthly_nzd: 500, annual_return_pct: 5 };
    const g = normalizeGoalRow(stored);
    expect(g).toEqual({ _id: "g1", ...golden });
    expect(formatGoalDate(g.target_date)).toBe("1 Jan 2031");
    const now = new Date("2026-10-18T00:00:00Z");
    const months = monthsUntil(g.target_date, now);
    expect(months).toBe(51);
    expect(Math.round(futureValue(g.start_nzd!, g.monthly_nzd, months, g.annual_return_pct) * 100) / 100).toBeCloseTo(53070.83, 0);
  });
  it("an old row with no start amount is not projected (no NaN)", () => {
    const g = normalizeGoalRow({ _id: "g2", label: "Old", target_nzd: 1000, target_date: "2030-12-31T11:00:00.000Z" });
    expect(g.target_date).toBe("2031-01-01");
    expect(goalMissingField(g)).toBe("starting amount");
  });
  it("the card renders the formatted date and a can't-project line", () => {
    const ui = read("src/components/dashboard/GoalsWorkflow.tsx");
    expect(ui).toContain("formatGoalDate(rec.target_date)");
    expect(ui).toContain("Can&apos;t project");
    expect(ui).not.toContain("Starting amount not stored");
  });
});

describe("b28 H-9 threshold text from the setting", () => {
  it("50k default; any other value is labelled jointly held and printed in the sentence", () => {
    expect(fifThresholdText(50000)).toBe("NZ$50,000.00");
    expect(fifThresholdText(100000)).toBe("NZ$100,000.00 (2 equal owners, no other FIF holdings)");
    const s = fifThresholdSentence({ peakCostNzd: 24000, threshold: "under", attributing: [{} as never], peakCostDay: "2025-05-01", thresholdNzd: 100000 });
    expect(s).toContain("NZ$100,000.00 (2 equal owners, no other FIF holdings)");
    expect(s).toContain("reached 2025-05-01");
  });
});

describe("b28 L-4", () => {
  it("nothing-held alert wording has no price paid", () => {
    const line = formatAlertRuleLine({ trimPct: 25, trimTriggerDipPct: 4 }, { held: false });
    expect(line).not.toContain("price paid");
    expect(formatAlertRuleLine({ trimPct: 25, trimTriggerDipPct: 4 })).toContain("price paid");
  });
  it("Plan usage has a live price-alert counter with no invented limit", () => {
    const rail = read("src/components/dashboard/rail/DashboardRail.tsx");
    expect(rail).toContain('label: "Price alerts"');
    expect(rail).toContain("limit: null");
    expect(read("src/components/dashboard/PriceAlerts.tsx").match(/af:alerts-delta/g)?.length).toBe(2);
  });
});

describe("b28 G-05 attempt row", () => {
  it("attempts are stored durably in the hidden ownerless AF-CAT row and /status reads it", () => {
    expect(read("src/lib/crypto-snapshot.ts")).toContain('CRYPTO_ATTEMPT_TICKER = "AF-CAT"');
    expect(read("src/lib/crypto-snapshot.ts")).toContain("registerDurableAttemptStore(");
    expect(read("src/lib/status-feeds.server.ts")).toContain('import "@/lib/crypto-snapshot"');
  });
});
