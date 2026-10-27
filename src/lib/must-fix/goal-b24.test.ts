// pull-check:v3-goal-b24-2026-10-18
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const all = { ...pkg.dependencies, ...pkg.devDependencies } as Record<string, string>;

describe("goal b24 hotfix: exact deploy toolchain pins", () => {
  it("pins the build", () => expect(readFileSync("public/build-version.txt", "utf8").trim()).toMatch(/^v3-(?:(?:goal|h1|g24|dedupe|g10|del404|fix|m7|cr6|g18|cr6b|dashclean|dashclean-d|dashclean-e)-)?b\d+[a-z]?-2026-10-\d\d$/));
  it("next, opennext and wrangler are exact (no ^ or ~) and match the lockfile", () => {
    for (const [name, want] of [["next", "16.4.2"], ["eslint-config-next", "16.4.2"], ["@opennextjs/cloudflare", "1.20.12"], ["wrangler", "4.151.0"]]) {
      expect(all[name]).toBe(want);
      expect(lock.packages[`node_modules/${name}`].version).toBe(want);
    }
  });
  it("opennext's next peer range is satisfied by the pinned next", () => {
    const peer = lock.packages["node_modules/@opennextjs/cloudflare"].peerDependencies?.next ?? "";
    expect(peer).toContain(">=16.4.1");
  });
});

import { execSync } from "node:child_process";
import { testHooksAllowedFor } from "@/lib/test-hooks";
import { COMPARISONS } from "@/data/learn-content";

describe("goal b24 SECURITY", () => {
  it("no fixture password is committed anywhere in tracked files", () => {
    const hits = execSync("git ls-files -z | xargs -0 grep -l 'Harness-[P]ass' || true", { encoding: "utf8" }).trim();
    expect(hits).toBe("");
    const seed = readFileSync("qa/fixtures/seed-fixture-accounts.mjs", "utf8");
    expect(seed).toContain("randomBytes");
    expect(seed).toContain("0o600");
    expect(seed).toContain(".fixtures-local.md");
    expect(seed).toContain("Refusing to write fixture passwords outside qa/local-harness/");
    expect(seed).not.toContain("aetherforge-qa");
    expect(readFileSync(".gitignore", "utf8")).toContain("qa/local-harness/.fixtures-local.md");
    expect(seed).not.toMatch(/PASSWORD\s*\|\|\s*"/);
  });
  it("test hooks: account ids only, no email-domain allow-list", () => {
    const on = { GOAL_TEST_HOOKS: "1" };
    expect(testHooksAllowedFor({ _id: "u1", email: "a@example.invalid" }, on)).toBe(false);
    expect(testHooksAllowedFor({ _id: "u1", email: "a@example.invalid" }, { ...on, GOAL_TEST_HOOK_EMAIL_DOMAINS: "example.invalid" })).toBe(false);
    expect(testHooksAllowedFor({ _id: "u1", email: "x@gmail.com" }, { ...on, GOAL_TEST_HOOK_USER_IDS: "u1" })).toBe(true);
    expect(readFileSync("src/lib/test-hooks.ts", "utf8")).not.toMatch(/EMAIL_DOMAINS|example\.invalid"/);
  });
  it("track-record page and cron show totals only", () => {
    const page = readFileSync("src/app/test-hooks/track-record/page.tsx", "utf8");
    expect(page).not.toMatch(/c\.ticker|c\.signal|calls\.map|reportId/);
    const cron = readFileSync("src/app/api/cron/track-record/route.ts", "utf8");
    expect(cron).not.toMatch(/data: run\.card[,\s]/);
    expect(cron).toContain("scorecardHash: run.card.scorecardHash");
  });
  it("G-05: the list's own path (/api/crypto/markets → loadTop400Markets) keeps the refresh alive and flushes the attempt", () => {
    const src = readFileSync("src/lib/crypto-source.ts", "utf8");
    expect(src).toMatch(/keepAlive\(cryptoRequestRefresh/);
    expect(src).toMatch(/await flushCryptoAttempt\(\)/);
    expect(readFileSync("src/lib/keep-alive.server.ts", "utf8")).toContain("waitUntil");
  });
  it("G-23: compare pages have a source on every fact and no GST wording", () => {
    for (const c of COMPARISONS) for (const r of c.rows) {
      expect(r.them.source, `${c.slug} ${r.label} them`).toBeTruthy();
      expect(r.us.source, `${c.slug} ${r.label} us`).toBeTruthy();
      expect(`${r.them.text} ${r.us.text}`).not.toMatch(/GST/);
    }
  });
});

describe("b24 G-05 refresh can replace a slightly shorter list", () => {
  it("keeps the 90% rule in the source", () => {
    expect(readFileSync("src/lib/crypto-snapshot.ts", "utf8")).toContain("CRYPTO_REPLACE_MIN_SHARE = 0.9");
    expect(readFileSync("src/lib/crypto-snapshot.ts", "utf8")).not.toContain("existing.coins.length > tagged.length) return;");
  });
});
