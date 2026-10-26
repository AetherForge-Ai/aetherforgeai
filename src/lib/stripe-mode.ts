/**
 * Goal b11 CR-1: Stripe checkout runs in TEST mode unless the explicit live
 * flag STRIPE_CHECKOUT_MODE=live is set. Test mode never falls back to a live
 * key: it uses STRIPE_TEST_SECRET_KEY, or STRIPE_SECRET_KEY only when that is
 * itself a test key. Key values are never returned or logged, only their type.
 */
import "server-only";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { testHooksAllowedFor } from "@/lib/test-hooks";

export type CheckoutMode = "test" | "live";
export type StripeKeyType = "live" | "test" | "unset" | "unknown";

export function checkoutMode(env: Record<string, string | undefined> = process.env): CheckoutMode {
  return String(env.STRIPE_CHECKOUT_MODE || "").trim().toLowerCase() === "live" ? "live" : "test";
}

export function stripeKeyType(key: string | undefined | null): StripeKeyType {
  if (!key) return "unset";
  if (/^(sk|rk)_live_/.test(key)) return "live";
  if (/^(sk|rk)_test_/.test(key)) return "test";
  return "unknown";
}

/** The test key to use, or null when none is configured. Never a live key. */
export function testSecretKey(env: Record<string, string | undefined> = process.env): string | null {
  if (stripeKeyType(env.STRIPE_TEST_SECRET_KEY) === "test") return env.STRIPE_TEST_SECRET_KEY as string;
  if (stripeKeyType(env.STRIPE_SECRET_KEY) === "test") return env.STRIPE_SECRET_KEY as string;
  return null;
}

/**
 * b78 CR-6 / STRIPE-TEST (Lukas approved 27 Oct 2026): with live checkout on, an allow-listed test account
 * (GOAL_TEST_HOOKS=1 and its id in GOAL_TEST_HOOK_USER_IDS) checks out in Stripe TEST mode, but only when
 * STRIPE_TEST_SECRET_KEY holds a real sk_test_/rk_test_ key. Everyone else, and an allow-listed account
 * without that key, stays on the unchanged live path. Server-side only; the key is never returned or logged.
 */
export function checkoutModeFor(
  userId: string | null | undefined,
  env: Record<string, string | undefined> = process.env
): CheckoutMode {
  const base = checkoutMode(env);
  if (base !== "live") return base;
  if (!userId || !testHooksAllowedFor({ _id: userId }, env)) return "live";
  return stripeKeyType(env.STRIPE_TEST_SECRET_KEY) === "test" ? "test" : "live";
}

/**
 * b80 CR-6b (safety): with STRIPE_CHECKOUT_MODE absent the site is in TEST mode. Then ONLY an allow-listed
 * test account (GOAL_TEST_HOOKS=1 + id in GOAL_TEST_HOOK_USER_IDS) may create a checkout session; everyone
 * else is refused before any Stripe call, so a 4242 card can never buy a plan. Live mode is unchanged.
 */
export function checkoutAllowedFor(
  userId: string | null | undefined,
  env: Record<string, string | undefined> = process.env
): boolean {
  if (checkoutMode(env) === "live") return true;
  return Boolean(userId) && testHooksAllowedFor({ _id: userId }, env);
}

let testClient: Stripe | null = null;

/** Stripe client for checkout in the current mode, or null when test mode has no test key. */
export function checkoutStripe(userId?: string | null): { mode: CheckoutMode; client: Stripe | null; blocked?: true } {
  const mode = checkoutModeFor(userId);
  if (!checkoutAllowedFor(userId)) return { mode, client: null, blocked: true };
  if (mode === "live") return { mode, client: getStripe() };
  const key = testSecretKey();
  if (!key) return { mode, client: null };
  if (!testClient) {
    testClient = new Stripe(key, { apiVersion: "2025-09-30.clover", typescript: true, httpClient: Stripe.createFetchHttpClient() });
  }
  return { mode, client: testClient };
}

/** Safe summary for /api/stripe/mode and the batch report. No key material. */
export function stripeModeSummary(env: Record<string, string | undefined> = process.env, userId?: string | null) {
  return {
    /** b78: true only for an allow-listed test account whose checkout runs in Stripe test mode. */
    userTestCheckout: checkoutMode(env) === "live" && checkoutModeFor(userId, env) === "test",
    checkoutMode: checkoutMode(env),
    defaultKeyType: stripeKeyType(env.STRIPE_SECRET_KEY),
    testKeyConfigured: testSecretKey(env) != null,
  };
}
