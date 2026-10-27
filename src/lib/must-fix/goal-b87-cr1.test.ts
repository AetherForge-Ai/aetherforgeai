/** b87 CR-1 F-1/F-2/F-3 (TT 28 Oct 2026). Mocked Stripe only: no network, no charges. */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const s = vi.hoisted(() => ({ mode: "test" as "test" | "live", subs: [] as { status: string }[], created: 0, portal: 0 }));
const client = {
  subscriptions: { list: vi.fn(async () => ({ data: s.subs })) },
  billingPortal: { sessions: { create: vi.fn(async () => { s.portal += 1; return { url: "https://billing.stripe.com/p/session/test_x" }; }) } },
  checkout: { sessions: { create: vi.fn(async () => { s.created += 1; return { id: "cs_test_x", url: "https://checkout.stripe.com/c/pay/cs_test_x" }; }) } },
  customers: { create: vi.fn(async () => ({ id: "cus_new" })) },
};
vi.mock("@/lib/stripe-mode", () => ({ checkoutStripe: () => ({ mode: s.mode, client }) }));
vi.mock("@/lib/totalum", () => ({ totalumSdk: { crud: { editRecordById: vi.fn(async () => ({})) } } }));
vi.mock("@/lib/ensure-public-price", () => ({ ensurePublicPrice: vi.fn(async () => "price_live_x") }));

import { createPlanCheckout } from "@/lib/stripe-checkout";
import { planByKey } from "@/lib/plans";
import { displayStatus, hasLiveSubscription, pricingCtaFor, successCopyFor, trialEndsLine } from "@/lib/billing-guard";

const user = (over: Record<string, unknown>) => ({ _id: "u1", email: "t@example.test", name: "T", ...over }) as never;
const pro = planByKey("pro_monthly" as never)!;
const base = "https://preview.example";

beforeEach(() => {
  s.subs = [];
  s.created = 0;
  s.portal = 0;
});

describe("F-1 no second subscription", () => {
  for (const mode of ["test", "live"] as const) {
    it(`${mode}: active Pro user gets 409 + portal URL, no session created`, async () => {
      s.mode = mode;
      const r = await createPlanCheckout({ user: user({ subscription_status: "active", subscription_plan: "pro_monthly", stripe_customer_id: "cus_1" }), plan: pro, baseUrl: base });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.status).toBe(409);
        expect(r.portalUrl).toBe("https://billing.stripe.com/p/session/test_x");
      }
      expect(s.created).toBe(0);
    });
    it(`${mode}: app says none but Stripe has a trialing sub → 409`, async () => {
      s.mode = mode;
      s.subs = [{ status: "trialing" }];
      const r = await createPlanCheckout({ user: user({ subscription_status: "none", subscription_plan: "none", stripe_customer_id: "cus_1" }), plan: pro, baseUrl: base });
      expect(r.ok === false && r.status).toBe(409);
      expect(s.created).toBe(0);
    });
    it(`${mode}: seeded Pro with no customer → 409, portal falls back to /settings/billing`, async () => {
      s.mode = mode;
      const r = await createPlanCheckout({ user: user({ subscription_status: "active", subscription_plan: "pro_monthly" }), plan: pro, baseUrl: base });
      expect(r.ok === false && r.portalUrl).toBe(`${base}/settings/billing`);
      expect(s.created).toBe(0);
    });
    it(`${mode}: Free / canceled user still checks out, success URL carries the plan`, async () => {
      s.mode = mode;
      s.subs = [{ status: "canceled" }];
      const r = await createPlanCheckout({ user: user({ subscription_status: "canceled", subscription_plan: "none", stripe_customer_id: "cus_1" }), plan: pro, baseUrl: base });
      expect(r.ok).toBe(true);
      expect(s.created).toBe(1);
      const arg = (client.checkout.sessions.create.mock.calls.at(-1) as unknown as [{ success_url: string }])[0];
      expect(arg.success_url).toBe(`${base}/stripe/success?session_id={CHECKOUT_SESSION_ID}&plan=pro_monthly`);
    });
  }
  it("both checkout routes return the portal URL with the 409", () => {
    for (const p of ["src/app/api/stripe/checkout/route.ts", "src/app/api/stripe/create-checkout-session/route.ts"]) {
      expect(readFileSync(p, "utf8")).toContain("data: { portalUrl: result.portalUrl }");
    }
  });
  it("/pricing shows Current plan / Manage billing for the account's own tier", () => {
    expect(pricingCtaFor("pro", { status: "active", plan: "pro_monthly" })).toEqual({ kind: "current", label: "Current plan · Manage billing" });
    expect(pricingCtaFor("starter", { status: "trialing", plan: "pro_yearly" }).kind).toBe("manage");
    expect(pricingCtaFor("pro", { status: "canceled", plan: "none" }).kind).toBe("checkout");
    expect(pricingCtaFor("pro", null).kind).toBe("checkout");
    expect(hasLiveSubscription({ status: "past_due", plan: "starter_monthly" })).toBe(true);
    const ui = readFileSync("src/components/pricing/PricingCards.tsx", "utf8");
    expect(ui.indexOf('pricingCtaFor(tier.id, account).kind !== "checkout"')).toBeLessThan(ui.indexOf("buildPaymentLinkUrl(plan"));
  });
});

describe("F-2 success copy from the plan bought", () => {
  it("Starter monthly: Starter heading, no yearly box", () => {
    expect(successCopyFor("starter_monthly")).toMatchObject({ heading: "Welcome to AetherForge Starter", showYearlyBox: false });
  });
  it("Pro yearly: Pro heading, yearly box", () => {
    expect(successCopyFor("pro_yearly")).toMatchObject({ heading: "Welcome to AetherForge Pro", showYearlyBox: true });
  });
  it("unknown plan: neutral, no yearly box", () => {
    expect(successCopyFor(null)).toMatchObject({ heading: "Welcome to AetherForge AI", showYearlyBox: false });
    const page = readFileSync("src/app/stripe/success/page.tsx", "utf8");
    expect(page).not.toContain("Welcome to AetherForge Pro");
    expect(page).toContain("copy.showYearlyBox ?");
  });
});

describe("F-3 trialing", () => {
  it("passes trialing through and dates the trial end", () => {
    expect(displayStatus("active", "trialing")).toBe("trialing");
    expect(displayStatus("active", "active")).toBe("active");
    expect(displayStatus("canceled", "trialing")).toBe("canceled");
    expect(trialEndsLine(Date.UTC(2026, 10, 11, 0, 0, 0) / 1000)).toBe("Trial ends 11 Nov 2026");
  });
  it("products endpoint untouched", () => {
    expect(readFileSync("src/app/api/stripe/products/route.ts", "utf8")).not.toMatch(/b87|billing-guard/);
  });
});
