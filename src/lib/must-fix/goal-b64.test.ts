// pull-check:v3-goal-b64-2026-10-24
/** Goal b64 (CR-6, CR-1, M-2, M-7, BS-01). Detailed tests: cr6-cr1-stripe-test-harness, m2-docs-linkcheck, broker-sync/bs01-sandbox. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

describe("b64 pins", () => {
  it("build version", () => {
    expect(read("public/build-version.txt").trim()).toMatch(/^v3-(goal|h1|g24|dedupe|g10|del404|fix)-b(6[4-9]|7[0-2])-2026-10-2\d$/);
  });
  it("M-7: one text-green token, no #059669 text", () => {
    const css = read("src/app/globals.css");
    expect(css).toContain("--color-gain: var(--text-green)");
    expect(read("src/components/about/AboutContent.tsx")).not.toMatch(/text-\[#059669\]|bg-\[#059669\][\s"]/);
  });
  it("BS-01 sandbox route is gated by the test-hook allow-list", () => {
    const src = read("src/app/api/test-hooks/ibkr-sandbox/route.ts");
    expect(src).toContain("testHooksAllowedFor");
    expect(src).toContain('GOAL_TEST_HOOKS !== "1"');
  });
  it("CR-6 webhook re-reads test-mode objects with the test key, never live", () => {
    const src = read("src/app/api/stripe/webhook/route.ts");
    expect(src).toContain("readerFor(subscription.livemode)");
    expect(src).toContain("testModePlan(subscription, userId)");
  });
});
