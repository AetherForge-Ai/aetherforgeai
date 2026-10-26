// pull-check:v3-cr6b-b80-2026-10-27
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
vi.mock("server-only", () => ({}));
import { checkoutAllowedFor, checkoutModeFor } from "@/lib/stripe-mode";
import { testEventUserAllowed } from "@/lib/stripe-entitlement";

const testMode = { GOAL_TEST_HOOKS: "1", GOAL_TEST_HOOK_USER_IDS: "tt1,tt2", STRIPE_TEST_SECRET_KEY: "sk_test_x" };
const live = { ...testMode, STRIPE_CHECKOUT_MODE: "live" };

describe("b80 CR-6b: test-mode checkout is allow-list only", () => {
  it("flag absent: anonymous and ordinary members are refused", () => {
    expect(checkoutAllowedFor(null, testMode)).toBe(false);
    expect(checkoutAllowedFor("member1", testMode)).toBe(false);
  });
  it("flag absent: an allow-listed test account may check out (test mode)", () => {
    expect(checkoutAllowedFor("tt1", testMode)).toBe(true);
    expect(checkoutModeFor("tt1", testMode)).toBe("test");
  });
  it("flag absent with hooks off: nobody, not even a listed id", () => {
    expect(checkoutAllowedFor("tt1", { ...testMode, GOAL_TEST_HOOKS: "0" })).toBe(false);
  });
  it("STRIPE_CHECKOUT_MODE=live: everyone allowed, live path unchanged", () => {
    expect(checkoutAllowedFor("member1", live)).toBe(true);
    expect(checkoutAllowedFor(null, live)).toBe(true);
    expect(checkoutModeFor("member1", live)).toBe("live");
    expect(checkoutModeFor("tt1", live)).toBe("test");
  });
  it("checkout refuses before any Stripe call with the friendly message", () => {
    const src = readFileSync("src/lib/stripe-checkout.ts", "utf8");
    const blocked = src.indexOf("if (blocked) return { ok: false, status: 503, error: CHECKOUT_UNAVAILABLE }");
    expect(blocked).toBeGreaterThan(0);
    expect(src.indexOf("client.")).toBeGreaterThan(blocked);
    expect(readFileSync("src/lib/stripe-mode.ts", "utf8")).toMatch(/if \(!checkoutAllowedFor\(userId\)\) return \{ mode, client: null, blocked: true \}/);
  });
});

describe("b80 CR-6b: webhook test events", () => {
  it("livemode false for a non-listed or unknown user is ignored", () => {
    expect(testEventUserAllowed(false, "member1", testMode)).toBe(false);
    expect(testEventUserAllowed(false, null, testMode)).toBe(false);
    expect(testEventUserAllowed(false, "tt2", { ...testMode, GOAL_TEST_HOOKS: "0" })).toBe(false);
  });
  it("livemode false for a listed test account is processed", () => {
    expect(testEventUserAllowed(false, "tt2", testMode)).toBe(true);
  });
  it("live events are never affected", () => {
    expect(testEventUserAllowed(true, "member1", testMode)).toBe(true);
    expect(testEventUserAllowed(undefined, null, {})).toBe(true);
  });
  it("route acknowledges with 200 and returns before any handler", () => {
    const src = readFileSync("src/app/api/stripe/webhook/route.ts", "utf8");
    const gate = src.indexOf("if (!testEventUserAllowed(false, testUserId))");
    expect(gate).toBeGreaterThan(0);
    expect(src.slice(gate, gate + 300)).toMatch(/NextResponse\.json\(\{ received: true, ignored: "test_mode_not_allowed" \}\)/);
    expect(src.indexOf("switch (event.type)")).toBeGreaterThan(gate);
  });
});
