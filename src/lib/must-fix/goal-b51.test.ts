// pull-check:v3-goal-b51a-2026-10-20
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

describe("b51 TAX-IRD-LINK-01 (G-13): Inland Revenue link", () => {
  it("the dead foreign-tax-credits page is gone; /tax links IRD's Overseas income page (200 on 20 Oct 2026)", () => {
    const all = execSync("git grep -l 'foreign-income/foreign-tax-credits' -- src ':!src/lib/must-fix/goal-b51.test.ts' || true").toString().trim();
    expect(all).toBe("");
    expect(read("src/components/tax/TaxPageContent.tsx")).toContain(
      "https://www.ird.govt.nz/income-tax/income-tax-for-individuals/types-of-individual-income/overseas-income"
    );
  });
});

describe("b51 M-2: /status fallbacks start together", () => {
  const s = read("src/lib/status-feeds.server.ts");
  it("crypto: all fallbacks start before the probes; a succeeded shared attempt time is the last fallback but one", () => {
    expect(s.indexOf("const attemptP = within(readSharedCryptoAttempt(), 1_600);")).toBeLessThan(s.indexOf("const [fx, metals, tape] = await Promise.all(["));
    expect(s).toMatch(/att\?\.ok && att\.at \? remember\("crypto", att\.at\)/);
    expect(s).toMatch(/cryptoAttemptRow\(attemptP\)/);
    expect(s).not.toMatch(/^let sharedAttemptP/m); // no promise shared across requests
  });
  it("equities: a late tape (same request) supplies the quote time before 'no saved quote time yet'", () => {
    expect(s).toMatch(/const tapeLate = loadPublicTickerBounded\(STATUS_TAPE_LATE_MS\);/);
    expect(s).toMatch(/latestSavedEquityAt\(\) \?\? \(await lateTape\(\)\)/);
  });
});

describe("b51 BS-01: cron watchdog", () => {
  const wf = read(".github/workflows/cron-fallback.yml"); // BS-01: restored (Totalum has Workflows read/write)
  it("hourly; dispatches cron.yml only when overdue; no secrets, no app calls", () => {
    // b53b: slot-aware watchdog in scripts/cron-watchdog.mjs (see cron-watchdog.test.ts)
    expect(wf).toMatch(/cron: "10,40,55 \* \* \* \*"/);
    expect(wf).toContain("node scripts/cron-watchdog.mjs");
    expect(wf).not.toMatch(/secrets\./);
    expect(wf).not.toMatch(/aetherforgeai\.co\.nz/);
  });
  it("cron.yml, h4-playwright.yml and signout-race.yml are untouched by b51", () => {
    const changed = execSync("git diff --name-only origin/develop -- .github/workflows/cron.yml .github/workflows/h4-playwright.yml .github/workflows/signout-race.yml || true").toString().trim();
    expect(changed).toBe("");
  });
});

describe("b51 build marker", () => {
  it("pins the build", () => {
    expect(read("public/build-version.txt")).toContain("v3-b89-2026-10-29");
  });
});
