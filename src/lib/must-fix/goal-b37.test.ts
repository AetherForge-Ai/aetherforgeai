// pull-check:v3-goal-b55-2026-10-22
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("server-only", () => ({}));
const read = (p: string) => readFileSync(p, "utf8");

describe("b37 item 1 (BS-01/G-20): cron.yml schedule", () => {
  it("schedules sit off :00/:15 and each job's if-condition matches its schedule string", () => {
    const y = read(".github/workflows/cron.yml");
    expect(y).toContain('- cron: "7 16 * * *"');
    expect(y).toContain('- cron: "23 */6 * * *"');
    expect(y).toContain("github.event.schedule == '7 16 * * *'");
    expect(y).toContain("github.event.schedule == '23 */6 * * *'");
    expect(y).not.toMatch(/'0 16 \* \* \*'|'15 \*\/6/);
    expect(y).toContain("workflow_dispatch");
  });
});

describe("b37 item 2 (CR-2): joint FIF answer", () => {
  const joint = [
    "What is the FIF threshold?",
    "Does the FIF limit double for jointly held shares?",
    "My partner and I hold US shares, what is our FIF limit?",
    "Is the threshold NZ$100,000 for a joint portfolio?",
    "de minimis for overseas shares",
    "is it 100k for couples?",
  ];
  it("every FIF / joint / partner / NZ$100k intent gets the static answer", async () => {
    const { fifStaticReply } = await import("@/lib/guide-facts");
    for (const q of joint) {
      const r = fifStaticReply(q);
      expect(r, q).not.toBeNull();
      expect(r!).toMatch(/Indicative, not tax advice\.$/);
      expect(r!).toContain("including fees");
      expect(r!).toContain("New Zealand shares and most ASX-listed shares");
      expect(r!).toContain("The NZ$50,000 threshold applies per person") /* b38 CR-2 exact wording */;
      expect(r!).toContain("joint holdings are split between the owners, so 2 equal owners can together hold up to NZ$100,000 in cost with no other FIF holdings; it's not a doubled threshold for the portfolio.");
      expect(r!).toContain("Trusts and companies don't get the NZ$50,000 exemption");
      expect(r!).not.toMatch(/doubles to|\bYes\b|indicative only|quickly/i);
    }
    expect(fifStaticReply("What does Starter cost?")).toBeNull();
    expect(fifStaticReply("What does FIF mean?")).toBeNull(); // a definition still goes to the model
  });
  it("Chief regression set: a joint/partner/100k question gets 'No' to a doubled threshold plus the per-person rule", async () => {
    const { fifStaticReply, FIF_JOINT_NO } = await import("@/lib/guide-facts");
    for (const q of [
      "my partner and I jointly own the portfolio, is my threshold NZ$100k?",
      "Does the FIF threshold double to NZ$100,000 for a joint portfolio?",
      "We hold US shares together as a couple, is the limit 100k?",
      "Does my family trust get the NZ$50,000 FIF exemption?",
    ]) {
      const r = fifStaticReply(q)!;
      expect(r, q).toMatch(/^No, a jointly held portfolio does not get a doubled NZ\$100,000 threshold\./);
      expect(r).toContain(FIF_JOINT_NO);
      expect(r).toContain("The NZ$50,000 threshold applies per person") /* b38 CR-2 exact wording */;
      expect(r).toMatch(/Indicative, not tax advice\.$/);
    }
    expect(fifStaticReply("What is the FIF threshold?")!).not.toMatch(/^No,/);
  });
  it("the public guide answers FIF before the model, and the coach uses the same text", async () => {
    const route = read("src/app/api/personal-guide/route.ts");
    expect(route.indexOf("fifStaticReply(userMessage)")).toBeGreaterThan(-1);
    expect(route.indexOf("fifStaticReply(userMessage)")).toBeLessThan(route.indexOf("isGrokConfigured()"));
    const { coachStaticFactReply } = await import("@/lib/portfolio-coach-knowledge");
    const { FIF_STATIC_ANSWER } = await import("@/lib/guide-facts");
    expect(coachStaticFactReply("my partner and I, joint FIF threshold?")).toContain(FIF_STATIC_ANSWER);
  });
  it("the model prompt no longer says the limit doubles when jointly held", async () => {
    const { guideFactsBlock } = await import("@/lib/guide-facts");
    const b = guideFactsBlock();
    expect(b).not.toMatch(/when the portfolio is set to jointly held/);
    expect(b).toContain("applies per person");
    expect(b).toContain("it's not a doubled threshold for the portfolio");
    expect(b).toContain("Trusts and companies don't get the exemption");
    expect(b).toContain("Indicative, not tax advice");
  });
  it("the knowledge base (/learn FIF page) and the /tax/fif setting use the per-person rule", () => {
    expect(read("src/data/learn-content.ts")).toContain("The NZ$50,000 threshold applies per person");
    expect(read("src/components/tax/FifThresholdSetting.tsx")).toContain("NZ$100,000 (2 equal owners, no other FIF holdings)");
  });
  it("model replies lose soft speed words", async () => {
    const { sanitizeGuideReply } = await import("@/lib/guide-safety");
    expect(sanitizeGuideReply("Our imports pull data from your broker files quickly.")).not.toMatch(/quickly/);
  });
});

describe("b37 item 3 (H-4): quota, hydration", () => {
  it("the quota streams in a Suspense boundary with two bounded reads; the ledger doesn't wait", () => {
    const p = read("src/components/dashboard/Fixture500Page.tsx");
    expect(p).toContain("<Suspense");
    expect(p).toMatch(/readReportQuota\(FIXTURE_QUOTA_ATTEMPT_MS, 2\)/);
    expect(p).not.toContain("longer than 1 second");
    expect(p).toContain("Try again");
  });
  it("no performance.now() in rendered text (React #418)", () => {
    const c = read("src/components/dashboard/Fixture500Client.tsx");
    expect(c).toContain("useEffect(");
    expect(c).toContain("{buildMs ?? \"…\"}");
    expect(c).not.toMatch(/<span data-build-ms>\{Math\.round/);
  });
});

describe("b37 item 4: /trust email isn't obfuscated", () => {
  it("the breach line renders the address via EmailAddress, never as one user@host string", async () => {
    const { trustBreachParts, trustBreachLine } = await import("@/lib/trust-facts");
    const p = trustBreachParts();
    expect(p.email).toBe("admin@aetherforgeai.co.nz");
    expect(p.before + p.email + p.after).toBe(trustBreachLine());
    expect(p.before).not.toContain("@");
    expect(p.after).not.toContain("@");
    const page = read("src/app/trust/page.tsx");
    expect(page).toContain("<EmailAddress email={trustBreachParts().email} />");
    expect(page).not.toContain("{trustBreachLine()}");
  });
  it("the CSP is unchanged (no cdn-cgi email decoder allowed)", () => {
    for (const f of ["next.config.ts", "src/middleware.ts"]) {
      try {
        expect(read(f)).not.toContain("email-decode");
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
    }
  });
});

describe("b37 item 5 (M-2): one crypto clock, no equity 'unavailable'", () => {
  it("crypto Last OK reads the shared snapshot first; equity falls back to the saved time or a plain line", () => {
    const s = read("src/lib/status-feeds.server.ts");
    const snapAt = s.indexOf('remember("crypto", snap?.at');
    const tapeAt = s.indexOf("tape?.rows.crypto");
    expect(snapAt).toBeGreaterThan(-1);
    expect(snapAt).toBeLessThan(tapeAt);
    expect(s).toContain("EQUITY_NO_TIME_TEXT");
    expect(s).toMatch(/: \{ \.\.\.row, tone: "amber", text: EQUITY_NO_TIME_TEXT \}/);
  });
});

describe("b37 items 6–7: CoinPaprika on /trust; /learn label", () => {
  it("CoinPaprika is a listed processor and in the delay table", async () => {
    expect(read("src/lib/public-copy.ts")).toContain('{ name: "CoinPaprika", role: "crypto prices" }');
    const { QUOTE_DELAY_TABLE } = await import("@/lib/market-freshness");
    expect(QUOTE_DELAY_TABLE.find((r) => r.market === "Crypto")!.source).toContain("CoinPaprika");
  });
  it("every /learn guide says Indicative, not tax advice", () => {
    expect(read("src/app/learn/[slug]/page.tsx")).toContain("Indicative, not tax advice.");
  });
});

describe("b37 item 8 (G-20): public schedule card", () => {
  it("built by schedule only for scheduled runs; manual runs are labelled manual", async () => {
    const { shapePublicScheduleRuns, scheduleHeadline } = await import("@/lib/schedule-runs");
    const gh = shapePublicScheduleRuns(
      [
        { at: "2026-10-19T00:23:05Z", conclusion: "success", event: "schedule" },
        { at: "2026-10-18T18:07:03Z", conclusion: "success", event: "workflow_dispatch" },
      ],
      []
    );
    expect(gh.source).toBe("github-actions");
    expect(gh.runs.map((r) => r.trigger)).toEqual(["schedule", "manual"]);
    expect(scheduleHeadline(gh)).toBe("2026-10-19T00:23:05Z");
    const manualOnly = shapePublicScheduleRuns([{ at: "2026-10-18T18:07:03Z", conclusion: "success", event: "workflow_dispatch" }], []);
    expect(scheduleHeadline(manualOnly)).toBeNull();
  });
  it("without a token: the stored rows' own times, schedule rows only, at most 3", async () => {
    const { shapePublicScheduleRuns } = await import("@/lib/schedule-runs");
    const v = shapePublicScheduleRuns(null, [
      { at: "4", builtBy: "schedule" },
      { at: "3", builtBy: "seed" },
      { at: "2", builtBy: "schedule" },
      { at: "1", builtBy: "schedule" },
      { at: "0", builtBy: "schedule" },
    ]);
    expect(v.source).toBe("track-record-rows");
    expect(v.runs.map((r) => r.at)).toEqual(["4", "2", "1"]);
  });
  it("the public payload has no token, hash or results", () => {
    const route = read("src/app/api/track-record/schedule/route.ts");
    expect(route).not.toMatch(/GITHUB_ACTIONS_READ_TOKEN|scorecardHash|hits|misses/);
    const lib = read("src/lib/schedule-runs.ts");
    expect(lib).not.toMatch(/scorecardHash:|token:/);
    expect(read("src/app/methodology/page.tsx")).toContain("<ScheduleRunsCard />");
  });
});

describe("b37 H-4: quota under 1 s with a per-user cache", () => {
  it("a slow count after a good read serves that same user's cached figure; another user never gets it", async () => {
    vi.resetModules();
    let who: { _id: string; subscription_plan: string } | null = { _id: "u1", subscription_plan: "free" };
    let slow = false;
    vi.doMock("@/lib/session", () => ({ getCurrentUser: async () => who }));
    vi.doMock("@/lib/report-month-count.server", () => ({
      countFreeReportsThisMonth: async () => {
        if (slow) await new Promise((r) => setTimeout(r, 400));
        return { count: 1 };
      },
    }));
    const q = await import("@/lib/dashboard-quota.server");
    const good = await q.readReportQuota(200, 1);
    expect(good.ok).toBe(true);
    slow = true;
    const t0 = Date.now();
    const cached = await q.readReportQuota(200, 1);
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(cached).toEqual(good);
    who = { _id: "u2", subscription_plan: "free" };
    const other = await q.readReportQuota(200, 1);
    expect(other).toEqual({ ok: false, reason: "timeout" });
    await new Promise((r) => setTimeout(r, 500)); // let the earlier slow reads finish (they refresh the cache)
    who = { _id: "u1", subscription_plan: "free" };
    q.forgetReportQuota("u1");
    expect(await q.readReportQuota(200, 1)).toEqual({ ok: false, reason: "timeout" });
    vi.doUnmock("@/lib/session");
    vi.doUnmock("@/lib/report-month-count.server");
  });
  it("the reports route clears the member's cached quota on generate", () => {
    expect(read("src/app/api/reports/route.ts")).toContain("forgetReportQuota(String(user._id))");
    expect(read("src/components/dashboard/Fixture500Page.tsx")).toContain("FIXTURE_QUOTA_ATTEMPT_MS = 900");
  });
});

describe("b37 G-10 (P1, investigation guard): a write after a session switch is refused, not misfiled", () => {
  it("POST /api/transactions checks x-af-user-id against the session before reading the body", () => {
    const r = read("src/app/api/transactions/route.ts");
    const post = r.slice(r.indexOf("export async function POST"));
    const guard = post.indexOf("requestClaimsOtherUser(req, user._id)");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(post.indexOf("await req.json()"));
    expect(post.slice(guard, guard + 400)).toContain("accountMismatchResponse(user._id)");
  });
  it("requestClaimsOtherUser: other account → refuse; same or absent → allow", async () => {
    const { requestClaimsOtherUser } = await import("@/lib/account-guard");
    const req = (v: string | null) => ({ headers: { get: (n: string) => (n === "x-af-user-id" ? v : null) } });
    expect(requestClaimsOtherUser(req("user-A"), "user-B")).toBe(true);
    expect(requestClaimsOtherUser(req("user-B"), "user-B")).toBe(false);
    expect(requestClaimsOtherUser(req(null), "user-B")).toBe(false);
  });
  it("the client shows a clear error for 409 account-mismatch, in the dialog and in the background toast", () => {
    const p = read("src/components/dashboard/RecordTransactionPanel.tsx");
    expect(p).toContain("SESSION_SWITCHED_ERROR");
    expect(p).toContain('failSave(writeError(res.error, "Could not record that transaction."))');
  });
});

describe("b37 P2: CR-6 hook plan name, M-2 dashboard label, G-14 focus", () => {
  it("CR-6: the hook names the plan the way the UI does", async () => {
    expect(read("src/app/api/test-hooks/plan-limits/route.ts")).toContain("currentPlanName(user.subscription_plan, user.subscription_status)");
    const { currentPlanName } = await import("@/lib/plan-usage");
    expect(currentPlanName("starter_monthly", "active")).not.toBe("Free");
  });
  it("M-2: the signed-in strip shows one 'Prices last updated' line", async () => {
    expect(read("src/components/MarketTicker.tsx")).toContain("data-prices-last-updated");
    const { savedSnapshotLabel } = await import("@/lib/status-feeds");
    expect(savedSnapshotLabel("2026-10-18T18:30:00Z", Date.parse("2026-10-18T19:00:00Z"))).toMatch(/^Prices last updated 7:30 am NZT$/);
  });
  it("G-14: stray focus goes to the field after the last one focused, not to the first field", () => {
    const d = read("src/components/dashboard/TransactionDialog.tsx");
    expect(d).toContain("lastInside");
    expect(d).toMatch(/items\.indexOf\(lastInside\)/);
    expect(d).toMatch(/document\.addEventListener\("focusin", onFocusIn\)/);
  });
});
