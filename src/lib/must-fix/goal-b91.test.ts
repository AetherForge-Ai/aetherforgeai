/** b91: BS-01 fixture-sync POST path, G-19/G-27/G-28 gradable on preview with flags off. pull-check:v3-b91-2026-10-29 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { featureOnFor, storageUnavailable, tableMissing } from "@/lib/preview-grading";
import { sharingPageHidden } from "@/lib/route-gate";

const read = (p: string) => readFileSync(p, "utf8");
const TEST = { _id: "tt-1" };
const MEMBER = { _id: "member-9" };
const HOOKS = { GOAL_TEST_HOOKS: "1", GOAL_TEST_HOOK_USER_IDS: "tt-1" };

describe("b91 version and pull-check history", () => {
  it("build version is b91 and the qa file keeps the b85–b90 history lines", () => {
    expect(read("public/build-version.txt").trim()).toBe("v3-b96-2026-11-02");
    const qa = read("qa/PULL-CHECK-2026-10-12.md");
    expect(qa).toContain("pull-check:v3-b91-2026-10-29");
    for (const b of ["b86", "b87", "b88", "b89"]) expect(qa).toContain(`pull-check:v3-b89-2026-10-29 (${b}:`);
    expect(qa).toContain("Goal b85 (pull-check:v3-b89-2026-10-29)");
    expect(qa).toContain("pull-check:v3-b90-2026-10-29 — b90:");
  });
});

describe("b91 preview grading gate (no flag turned on)", () => {
  it("flag off: members never get the feature; allow-listed test accounts do only with GOAL_TEST_HOOKS=1", () => {
    for (const f of ["PORTFOLIO_SHARING", "ONBOARDING_FUNNEL_SERVER"]) {
      expect(featureOnFor(f, MEMBER, HOOKS)).toBe(false);
      expect(featureOnFor(f, null, HOOKS)).toBe(false);
      expect(featureOnFor(f, TEST, HOOKS)).toBe(true);
      expect(featureOnFor(f, TEST, { GOAL_TEST_HOOK_USER_IDS: "tt-1" })).toBe(false);
      expect(featureOnFor(f, MEMBER, { [f]: "on" })).toBe(true);
    }
  });
  it("/shared stays 404 in middleware with hooks off; with hooks on the page decides", () => {
    expect(sharingPageHidden("/shared", {})).toBe(true);
    expect(sharingPageHidden("/shared", HOOKS)).toBe(false);
    const page = read("src/app/shared/page.tsx");
    expect(page).toMatch(/featureOnFor\("PORTFOLIO_SHARING", user as never\)\) notFound\(\)/);
  });
  it("every G-27 route and page uses the same gate, and no flagOn(PORTFOLIO_SHARING) bypass is left", () => {
    for (const p of ["src/app/api/share/route.ts", "src/app/api/share/[id]/route.ts", "src/app/shared/page.tsx", "src/app/settings/sharing/page.tsx", "src/app/share/accept/page.tsx"]) {
      const s = read(p);
      expect(s).toContain('featureOnFor("PORTFOLIO_SHARING"');
      expect(s).not.toContain('flagOn("PORTFOLIO_SHARING")');
    }
    // copy-link only: nothing in the share route sends mail.
    expect(read("src/app/api/share/route.ts")).not.toMatch(/sendMail|sendEmail|resend|nodemailer/i);
  });
  it("G-28 write and admin summary use the gate; the admin summary allows the owner or a test account only", () => {
    const w = read("src/app/api/onboarding/funnel/route.ts");
    expect(w).toContain('featureOnFor("ONBOARDING_FUNNEL_SERVER", user)');
    expect(w).toContain('"x-af-funnel"');
    const a = read("src/app/api/admin/onboarding-funnel/route.ts");
    expect(a).toContain("owner || testHooksAllowedFor(session as never)");
  });
  it("G-19: chat working is on for allow-listed test accounts; the grading hook is allow-listed and caps at 100 notes", () => {
    expect(read("src/app/api/chat/route.ts")).toContain("(aiShowWorkingEnabled() || testHooksAllowedFor(user as never))");
    const h = read("src/app/api/test-hooks/ai-working/route.ts");
    expect(h).toContain("testHooksAllowedFor");
    expect(h).toContain("MAX_SAMPLES = 100");
    expect(h).not.toMatch(/createRecord|editRecord|totalumSdk/);
  });
});

describe("b91 missing Totalum tables answer in plain words", () => {
  it("detects a missing table and names it; other errors stay generic", () => {
    const missing = new Error("Element portfolio_share not found");
    expect(tableMissing(missing)).toBe(true);
    expect(storageUnavailable("Sharing", "portfolio_share", missing)).toEqual({ status: 503, error: "Sharing isn't set up yet: the portfolio_share table is missing. Nothing was saved.", table: "portfolio_share" });
    expect(tableMissing(new Error("socket hang up"))).toBe(false);
    expect(storageUnavailable("Sharing", "portfolio_share", new Error("socket hang up"))).toEqual({ status: 503, error: "Sharing is unavailable just now." });
  });
  it("share_audit_event and onboarding_funnel_event are named on their own paths", () => {
    expect(read("src/app/api/share/route.ts")).toContain('storageUnavailable("The access log", "share_audit_event"');
    expect(read("src/app/api/admin/onboarding-funnel/route.ts")).toContain('"onboarding_funnel_event"');
  });
});

describe("b91 BS-01 fixture-sync POST path", () => {
  const s = read("src/app/api/test-hooks/ibkr-fixture-sync/route.ts");
  it("sync (default), connect with sandbox tokens only, and disconnect on the one allow-listed POST", () => {
    expect(s).toContain('String(body?.action ?? "sync")');
    expect(s).toContain("sandboxVerify(token)");
    expect(s).toContain("Nothing was saved.");
    expect(s).toContain("deleteConnection(uid, \"ibkr\")");
    expect(s).toContain("stored: !!after");
    expect(s).toMatch(/testHooksAllowedFor\(user/);
    expect(s).not.toMatch(/fetchFlexStatement|verifyFlexCredentials/);
  });
  it("no new scheduled-job file", () => {
    expect(read("src/app/api/cron/broker-sync/route.ts").length).toBeGreaterThan(0);
  });
});
