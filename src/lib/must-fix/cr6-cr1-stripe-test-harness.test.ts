/**
 * b64 CR-6 / CR-1: Stripe test-mode harness. Drives the real webhook route with signed events.
 *
 * Default run: an in-memory Stripe stands in for the API (no network).
 * STRIPE_HARNESS=1: the same steps against the Stripe TEST API with STRIPE_TEST_SECRET_KEY
 * (refused unless it is an sk_test_ key). Subscriptions use a 14-day trial, so no charge is
 * ever attempted; no checkout is completed; the test customer is deleted at the end.
 * The live key (STRIPE_SECRET_KEY) is never read here: it is stubbed to "" before any import.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";
vi.mock("server-only", () => ({}));

const WHSEC = "whsec_b64_harness_local_only";
const REAL = process.env.STRIPE_HARNESS === "1";
const TEST_KEY = String(process.env.STRIPE_TEST_SECRET_KEY || "");

const h = vi.hoisted(() => ({
  users: new Map<string, Record<string, unknown>>(),
  subs: new Map<string, Record<string, unknown>>(),
  real: null as unknown as import("stripe").default | null,
}));

vi.mock("@/lib/totalum", () => ({
  totalumSdk: {
    crud: {
      query: vi.fn(async (_t: string, q: { _filter?: Record<string, unknown> }) => ({
        data: [...h.users.values()].filter((u) => Object.entries(q?._filter || {}).every(([k, v]) => u[k] === v)),
      })),
      editRecordById: vi.fn(async (_t: string, id: string, patch: Record<string, unknown>) => {
        h.users.set(id, { ...(h.users.get(id) || { _id: id }), ...patch });
      }),
    },
  },
}));
vi.mock("@/lib/stripe-mode", () => ({ testSecretKey: () => null }));
vi.mock("@/lib/stripe", async () => {
  const S = (await import("stripe")).default;
  const reader = {
    subscriptions: {
      retrieve: async (id: string) => (h.real ? h.real.subscriptions.retrieve(id) : structuredClone(h.subs.get(id))),
      update: async (id: string, p: { metadata: Record<string, string> }) => {
        if (h.real) return h.real.subscriptions.update(id, p);
        const s = h.subs.get(id)!;
        s.metadata = { ...(s.metadata as object), ...p.metadata };
        return structuredClone(s);
      },
    },
    webhooks: S.webhooks,
  };
  return { stripe: reader, STRIPE_WEBHOOK_SECRETS: ["whsec_b64_harness_local_only"], STRIPE_TEST_WEBHOOK_SECRETS: [], cryptoProvider: S.createSubtleCryptoProvider() };
});

import { POST as webhook } from "@/app/api/stripe/webhook/route";
import { resetProcessedEvents } from "@/lib/stripe-entitlement";
import { publicCheckoutPriceIds, planByKey, FREE_PLAN } from "@/lib/plans";
import { planUnitAmount } from "@/lib/stripe-checkout";

let n = 0;
async function send(type: string, object: Record<string, unknown>, id = `evt_b64_${++n}`) {
  const payload = JSON.stringify({ id, object: "event", type, livemode: false, data: { object } });
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: WHSEC });
  const res = await webhook(new Request("https://x/api/stripe/webhook", { method: "POST", body: payload, headers: { "stripe-signature": header } }));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

const USER = "harness_user_b64";
let subId = "";
let customerId = "";

beforeAll(async () => {
  vi.stubEnv("STRIPE_SECRET_KEY", "");
  vi.stubEnv("NODE_ENV", "test");
  resetProcessedEvents();
  h.users.set(USER, { _id: USER, subscription_plan: "none", ticker_limit: FREE_PLAN.tickerLimit });
  const meta = { userId: USER, plan: "starter_monthly", ticker_limit: "25", bot_access: "stock", checkout_mode: "test" };
  if (REAL) {
    if (!/^sk_test_/.test(TEST_KEY)) throw new Error("STRIPE_HARNESS=1 needs an sk_test_ STRIPE_TEST_SECRET_KEY. Refusing.");
    h.real = new Stripe(TEST_KEY, { apiVersion: "2025-09-30.clover" as never });
    const customer = await h.real.customers.create({ email: "harness-b64@example.invalid", metadata: { harness: "b64" } });
    customerId = customer.id;
    const product = await h.real.products.create({ name: "AetherForge AI — Starter (b64 harness, test)", metadata: { harness: "b64" } });
    const price = await h.real.prices.create({ product: product.id, currency: "nzd", unit_amount: 1600, recurring: { interval: "month" } });
    const sub = await h.real.subscriptions.create({ customer: customerId, items: [{ price: price.id }], trial_period_days: 14, metadata: meta });
    expect(sub.livemode).toBe(false);
    subId = sub.id;
  } else {
    customerId = "cus_b64";
    subId = "sub_b64";
    h.subs.set(subId, {
      id: subId, object: "subscription", livemode: false, status: "trialing", customer: customerId, cancel_at_period_end: false, metadata: meta,
      items: { data: [{ price: { id: "price_inline_b64", unit_amount: 1600, currency: "nzd", metadata: {} }, current_period_start: 1_790_000_000, current_period_end: 1_791_209_600 }] },
    });
  }
}, 60_000);

afterAll(async () => {
  if (h.real && customerId) await h.real.customers.del(customerId).catch(() => undefined);
  vi.unstubAllEnvs();
});

const current = async () => (h.real ? h.real.subscriptions.retrieve(subId) : structuredClone(h.subs.get(subId)!)) as unknown as Record<string, unknown>;

describe(`CR-6 Stripe test-mode harness (${REAL ? "Stripe test API" : "in-memory"})`, () => {
  it("Starter checkout sets Starter with the 25-holding limit", async () => {
    const r = await send("customer.subscription.created", await current());
    expect(r.status).toBe(200);
    expect(h.users.get(USER)).toMatchObject({ subscription_plan: "starter_monthly", ticker_limit: 25, subscription_status: "active" });
  }, 30_000);

  it("a replayed event changes nothing", async () => {
    const before = JSON.stringify(h.users.get(USER));
    const r1 = await send("customer.subscription.created", await current(), "evt_b64_replay");
    const r2 = await send("customer.subscription.created", await current(), "evt_b64_replay");
    expect(r1.status).toBe(200);
    expect(r2.body.duplicate).toBe(true);
    expect(JSON.stringify(h.users.get(USER))).toBe(before);
  }, 30_000);

  it("cancel keeps Starter until the period ends, then downgrades to Free", async () => {
    if (h.real) await h.real.subscriptions.update(subId, { cancel_at_period_end: true });
    else (h.subs.get(subId)!.cancel_at_period_end = true);
    await send("customer.subscription.updated", await current());
    expect(h.users.get(USER)).toMatchObject({ subscription_plan: "starter_monthly", ticker_limit: 25 });
    if (h.real) await h.real.subscriptions.cancel(subId);
    else h.subs.get(subId)!.status = "canceled";
    await send("customer.subscription.deleted", await current());
    expect(h.users.get(USER)).toMatchObject({ subscription_plan: "none", ticker_limit: FREE_PLAN.tickerLimit, subscription_status: "canceled" });
  }, 30_000);

  it("an old 'created' event replayed after cancel does not re-grant Starter", async () => {
    const stale = { ...(await current()), status: "trialing" };
    await send("customer.subscription.created", stale, "evt_b64_stale");
    expect(h.users.get(USER)).toMatchObject({ subscription_plan: "none", ticker_limit: FREE_PLAN.tickerLimit });
  }, 30_000);
});

describe("CR-6 test-mode plans never unlock a real member in production", () => {
  it("production + not allow-listed → no plan from test metadata", async () => {
    const { testModePlan } = await import("@/lib/stripe-entitlement");
    const sub = { livemode: false, metadata: { checkout_mode: "test", plan: "starter_monthly" } };
    expect(testModePlan(sub, "u_real", { NODE_ENV: "production" })).toBeUndefined();
    expect(testModePlan(sub, "u_tt", { NODE_ENV: "production", GOAL_TEST_HOOKS: "1", GOAL_TEST_HOOK_USER_IDS: "u_tt" })?.key).toBe("starter_monthly");
    expect(testModePlan({ ...sub, livemode: true }, "u_tt", { NODE_ENV: "test" })).toBeUndefined();
    expect(testModePlan({ livemode: false, metadata: { plan: "starter_monthly" } }, "u_tt", { NODE_ENV: "test" })).toBeUndefined();
  });
});

describe("CR-1 prices", () => {
  it("public checkout lists at most 6 price ids, none Apex or NZ$29/69", () => {
    const ids = publicCheckoutPriceIds();
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.length).toBeLessThanOrEqual(6);
    for (const key of ["weekly", "monthly", "yearly", "dual_yearly"]) {
      const apex = planByKey(key);
      if (apex?.priceId) expect(ids).not.toContain(apex.priceId);
    }
    expect(ids).not.toContain("price_1TsjfH9sOmzarzYkYpuvCfuA");
    expect(ids).not.toContain("price_1TsjfI9sOmzarzYkiDEzedgi");
  });
  it("test-mode Starter checkout uses the NZ$16 price", () => {
    expect(planUnitAmount(planByKey("starter_monthly")!)).toBe(1600);
  });
});
