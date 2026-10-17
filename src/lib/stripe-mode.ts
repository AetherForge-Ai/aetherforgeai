/**
 * Goal b11 CR-1: Stripe checkout runs in TEST mode unless the explicit live
 * flag STRIPE_CHECKOUT_MODE=live is set. Test mode never falls back to a live
 * key: it uses STRIPE_TEST_SECRET_KEY, or STRIPE_SECRET_KEY only when that is
 * itself a test key. Key values are never returned or logged, only their type.
 */
import "server-only";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";

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

let testClient: Stripe | null = null;

/** Stripe client for checkout in the current mode, or null when test mode has no test key. */
export function checkoutStripe(): { mode: CheckoutMode; client: Stripe | null } {
  const mode = checkoutMode();
  if (mode === "live") return { mode, client: getStripe() };
  const key = testSecretKey();
  if (!key) return { mode, client: null };
  if (!testClient) {
    testClient = new Stripe(key, { apiVersion: "2025-09-30.clover", typescript: true, httpClient: Stripe.createFetchHttpClient() });
  }
  return { mode, client: testClient };
}

/** Safe summary for /api/stripe/mode and the batch report. No key material. */
export function stripeModeSummary(env: Record<string, string | undefined> = process.env) {
  return {
    checkoutMode: checkoutMode(env),
    defaultKeyType: stripeKeyType(env.STRIPE_SECRET_KEY),
    testKeyConfigured: testSecretKey(env) != null,
  };
}
