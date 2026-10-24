// pull-check:v3-goal-b63-2026-10-24
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/totalum", () => ({ totalumSdk: { crud: {} } }));
import { futureValue, monthsUntil, validateGoal } from "@/lib/goal-math";
import { sessionCash } from "@/lib/transactions";

const read = (p: string) => readFileSync(p, "utf8");

describe("goal b26", () => {
  it("pins the build", () => expect(read("public/build-version.txt").trim()).toBe("v3-goal-b63-2026-10-24"));

  it("G-10: buy returns the holding; the session's fresh cash replaces a second user read", () => {
    expect(read("src/app/api/transactions/route.ts")).toContain("holding: result.holding ?? null");
    const now = 1_000_000;
    expect(sessionCash({ _id: "u", cash_balance: 50, cash_read_at: now - 100 } as never, now)).toBe(50);
    expect(sessionCash({ _id: "u", cash_balance: 50, cash_read_at: now - 5000 } as never, now)).toBeNull();
    expect(sessionCash({ _id: "u", cash_balance: 50 } as never, now)).toBeNull();
  });

  it("H-4: quota retries within 5 s and shows a retry; the session check is bounded", () => {
    const q = read("src/lib/dashboard-quota.server.ts");
    expect(q).toContain("readReportQuota");
    expect(q).toContain("console.error(\"[quota]");
    const hook = read("src/components/dashboard/Fixture500Page.tsx");
    expect(hook).not.toContain("— (could not be read)");
    expect(hook).toContain("Try again");
    expect(read("src/components/dashboard/AccountOwnerGuard.tsx")).toContain("SESSION_CHECK_TIMEOUT_MS = 5000");
    expect(read("src/lib/auth-refresh.ts")).toContain("SESSION_FETCH_TIMEOUT_MS");
    expect(read("src/components/dashboard/ReportCenter.tsx")).toContain("}, 5_000);");
  });

  it("G-20: the test page reads the stored scorecard and does not build one", () => {
    const page = read("src/app/test-hooks/track-record/page.tsx");
    expect(page).toContain("loadTrackRecordView");
    expect(page).not.toMatch(/runTrackRecord\(/); // b28: only the bounded fallback when nothing is stored
    expect(page).toContain("How to verify the hash");
    expect(page).toContain("misses included");
    expect(page).toContain("collected so far");
    expect(page).not.toMatch(/calls\.map\(/);
    expect(read("src/app/api/cron/track-record/route.ts")).toContain("persistTrackRun");
  });

  it("H-13 / H-15: RBNZ is NZ macro; /trust lists news sources and delays", () => {
    expect(read("src/lib/news-present.ts")).toContain('marketLabel: "NZ macro"');
    const trust = read("src/app/trust/page.tsx");
    // b29: the list moved to news-sources.ts, shared with /api/news.
    const sources = trust + readFileSync("src/lib/news-sources.ts", "utf8");
    for (const s of ["RNZ", "RBNZ", "BusinessDesk", "Yahoo Finance", "BBC Business", "Twelve Data"]) expect(sources).toContain(s);
  });

  it("deposit rows can be removed, never below zero cash; seed starts from a known book", () => {
    expect(read("src/app/api/transactions/route.ts")).toContain(`type === "deposit" || type === "withdraw"`);
    expect(read("src/lib/ledger-reversal-apply.ts")).toContain("cashAfter < -0.009");
    expect(read("qa/fixtures/seed-fixture-accounts.mjs")).toContain("not re-seeding");
  });

  it("L-4: counter, Pro upgrade hidden, alert copy", () => {
    expect(read("src/components/portfolio-coach/PortfolioCoachChat.tsx")).toContain("<AssistantQueryCounter");
    expect(read("src/components/settings/SettingsClient.tsx")).toContain("isProPlan(user.subscription_plan) ?");
    expect(read("src/components/dashboard/PriceAlerts.tsx")).toContain("holding && Number(holding.shares) > 0");
  });

  it("H-9: one tax pack download", () => {
    expect(read("src/components/tax/TaxPageContent.tsx")).toContain("/api/tax/pack/pdf?paper=all");
  });

  it("H-11: NZ$100k by 1 Jan 2031, NZ$500/mo from NZ$20k matches spreadsheet FV within NZ$1; past date errors", () => {
    const now = new Date("2026-10-18T00:00:00Z");
    const months = monthsUntil("2031-01-01", now);
    expect(months).toBe(51);
    // Spreadsheet: =FV(5%/12, 51, -500, -20000) = 53,070.83 (LibreOffice / Excel)
    expect(Math.abs(futureValue(20000, 500, months, 5) - 53070.83)).toBeLessThan(1);
    expect(validateGoal({ targetNzd: 100000, targetDate: "2026-01-01", monthlyNzd: 500, bookNzd: 20000, annualReturnPct: 5 }, now)).toBe("Choose a date in the future.");
    const ui = read("src/components/dashboard/GoalsWorkflow.tsx");
    expect(ui).toContain('aria-live="polite"');
    expect(ui).toContain('role="progressbar"');
  });
});
