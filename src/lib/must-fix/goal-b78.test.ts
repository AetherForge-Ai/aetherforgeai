// pull-check:v3-b90-2026-10-29
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { checkoutModeFor, stripeModeSummary } from "@/lib/stripe-mode";
import { testSecretEventAllowed } from "@/lib/stripe-entitlement";

const TEST_KEY = "sk_test_" + "x".repeat(24);
const LIVE_KEY = "sk_live_" + "y".repeat(24);
const base = { NODE_ENV: "production", STRIPE_CHECKOUT_MODE: "live", STRIPE_SECRET_KEY: LIVE_KEY, GOAL_TEST_HOOKS: "1", GOAL_TEST_HOOK_USER_IDS: "fixture-1, fixture-2" };

describe("b78 CR-6 / STRIPE-TEST: per-account test checkout", () => {
  it("a user not on the allow-list always gets live", () => {
    expect(checkoutModeFor("member-9", { ...base, STRIPE_TEST_SECRET_KEY: TEST_KEY })).toBe("live");
    expect(checkoutModeFor(null, { ...base, STRIPE_TEST_SECRET_KEY: TEST_KEY })).toBe("live");
  });
  it("an allow-listed user without a test key gets live", () => {
    expect(checkoutModeFor("fixture-1", base)).toBe("live");
    // A live key in the test slot is never used as a test key.
    expect(checkoutModeFor("fixture-1", { ...base, STRIPE_TEST_SECRET_KEY: LIVE_KEY })).toBe("live");
  });
  it("an allow-listed user with the test key gets test", () => {
    expect(checkoutModeFor("fixture-2", { ...base, STRIPE_TEST_SECRET_KEY: TEST_KEY })).toBe("test");
  });
  it("the allow-list needs the GOAL_TEST_HOOKS switch", () => {
    expect(checkoutModeFor("fixture-1", { ...base, GOAL_TEST_HOOKS: "0", STRIPE_TEST_SECRET_KEY: TEST_KEY })).toBe("live");
  });
  it("the mode summary flags the account but carries no key material", () => {
    const env = { ...base, STRIPE_TEST_SECRET_KEY: TEST_KEY };
    expect(stripeModeSummary(env, "fixture-1").userTestCheckout).toBe(true);
    expect(stripeModeSummary(env, "member-9").userTestCheckout).toBe(false);
    expect(JSON.stringify(stripeModeSummary(env, "fixture-1"))).not.toMatch(/sk_(test|live)_/);
  });
  it("the test webhook secret only verifies test-mode events", () => {
    expect(testSecretEventAllowed(true, false)).toBe(true);
    expect(testSecretEventAllowed(true, true)).toBe(false);
    expect(testSecretEventAllowed(true, undefined)).toBe(false);
    expect(testSecretEventAllowed(false, true)).toBe(true);
  });
  it("checkout picks the client per user; pricing skips live payment links and shows a badge for test accounts", () => {
    expect(readFileSync("src/lib/stripe-checkout.ts", "utf8")).toContain("checkoutStripe(user._id)");
    const cards = readFileSync("src/components/pricing/PricingCards.tsx", "utf8");
    expect(cards).toContain("if (linked && !testCheckout)");
    expect(cards).toContain("Test mode: checkout uses Stripe test cards. No real charge.");
    expect(cards).not.toMatch(/STRIPE_TEST_SECRET_KEY|sk_test/);
    const hook = readFileSync("src/app/api/stripe/webhook/route.ts", "utf8");
    expect(hook).toContain("STRIPE_TEST_WEBHOOK_SECRETS");
  });
});
