/**
 * FIX-B99-1, live crawl 11 Nov 2026, known items (b) and (c).
 * (c) "Manage billing" only when a Stripe customer makes the portal control real.
 * (b) /methodology stays unpublished: the repo has index levels, not the named share and coin history.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { billingPortalReady, paidPlanNextStep, pricingCtaFor } from "@/lib/billing-guard";

const read = (p: string) => readFileSync(p, "utf8");

const proCustomer = { status: "active" as const, plan: "pro_monthly", hasStripeCustomer: true };
const proHandSet = { status: "active" as const, plan: "pro_monthly", hasStripeCustomer: false };

describe("FIX-B99-1 (c) billing wording follows the portal", () => {
  it("a Stripe customer sees Manage billing on the current tier and on a change", () => {
    expect(billingPortalReady({ stripeConfigured: true, stripeCustomerId: "cus_qa" })).toBe(true);
    expect(pricingCtaFor("pro", proCustomer)).toEqual({
      kind: "current",
      label: "Current plan · Manage billing",
      href: "/settings/billing",
      portal: true,
    });
    expect(pricingCtaFor("starter", { status: "trialing", plan: "pro_yearly", hasStripeCustomer: true })).toEqual({
      kind: "manage",
      label: "Change plan in Manage billing",
      href: "/settings/billing",
      portal: true,
    });
    expect(pricingCtaFor("starter", { status: "past_due", plan: "pro_monthly", hasStripeCustomer: true }).label).toBe(
      "Change plan in Manage billing"
    );
    expect(paidPlanNextStep(true)).toMatchObject({
      portal: true,
      href: "/settings/billing",
      action: "Manage billing",
      heroLead: "You already have a plan. Change or cancel it in",
    });
  });

  it("a paid plan with no Stripe customer points to contact, and does not say Manage billing", () => {
    expect(billingPortalReady({ stripeConfigured: true, stripeCustomerId: null })).toBe(false);
    expect(billingPortalReady({ stripeConfigured: true, stripeCustomerId: "" })).toBe(false);
    expect(billingPortalReady({ stripeConfigured: false, stripeCustomerId: "cus_qa" })).toBe(false);
    const current = pricingCtaFor("pro", proHandSet);
    const change = pricingCtaFor("starter", { status: "active", plan: "pro_monthly" });
    expect(current).toEqual({
      kind: "current",
      label: "Current plan · Contact support",
      href: "/contact",
      portal: false,
    });
    expect(change).toEqual({
      kind: "manage",
      label: "Change plan via contact",
      href: "/contact",
      portal: false,
    });
    const step = paidPlanNextStep(false);
    expect(step).toMatchObject({
      portal: false,
      href: "/contact",
      action: "contact support",
      heroLead: "You already have a plan. To change or cancel it,",
      settingsLead: "This plan has no Stripe billing account. To change or cancel it,",
    });
    const spoken = JSON.stringify({ current, change, step });
    expect(spoken).not.toMatch(/Manage billing/);
    expect(spoken).not.toMatch(/\bbuy\b|\bsell\b/i);
    expect(pricingCtaFor("pro", { status: "canceled", plan: "none", hasStripeCustomer: false }).kind).toBe("checkout");
    expect(pricingCtaFor("pro", null).kind).toBe("checkout");
    expect(pricingCtaFor("pro", { status: "active", plan: "free", hasStripeCustomer: false }).kind).toBe("checkout");
  });

  it("keeps /pricing and /settings/billing on the same portal check", () => {
    const pricing = read("src/app/pricing/page.tsx");
    const billing = read("src/app/settings/billing/page.tsx");
    const cards = read("src/components/pricing/PricingCards.tsx");
    const gate = read("src/components/pricing/SubscriberGate.tsx");
    for (const src of [pricing, billing]) {
      expect(src).toContain("billingPortalReady(");
      expect(src).toContain("paidPlanNextStep(");
    }
    expect(pricing).toContain("hasStripeCustomer={hasStripeCustomer}");
    expect(pricing).toContain("data-billing-next={nextStep.portal ? \"portal\" : \"support\"}");
    expect(billing).toContain('{portal ? <BillingPortalButton /> : null}');
    expect(billing).toContain('{paid && !portal ? (');
    expect(billing).toContain('data-billing-next="support"');
    expect(billing).toContain("href={nextStep.href}");
    expect(cards).toContain("hasStripeCustomer");
    expect(cards).toContain("step.portal) void openBilling()");
    expect(cards).toContain("router.push(step.href)");
    expect(gate).toContain("paidPlanNextStep(hasStripeCustomer)");
    expect(pricing).not.toContain("Manage billing");
    expect(billing).not.toContain("Manage billing");
    expect(gate).not.toContain("Current plan · Manage billing");
    const portalCopy = JSON.stringify(paidPlanNextStep(true));
    expect(portalCopy).not.toMatch(/\bbuy\b|\bsell\b/i);
  });
});

describe("FIX-B99-1 (b) methodology results stay unpublished", () => {
  it("does not invent figures: stored history is two indexes, not the named share and coin universe", () => {
    const page = read("src/app/methodology/page.tsx");
    expect(page).toContain("Results not published yet.");
    expect(page).toContain("crypto collapse after FTX (Nov 2022)");
    expect(page).toContain("COVID crash (Feb to Mar 2020)");
    expect(page).toContain("2022 rate-rise sell-off");
    expect(page).not.toMatch(/hit rate of \d/i);
    const history = JSON.parse(read("src/data/benchmark-history.json")) as { series: Record<string, { points?: unknown[] }> };
    expect(Object.keys(history.series).sort()).toEqual(["nzx50", "sp500nzd"]);
    expect((history.series.nzx50.points || []).length).toBeGreaterThan(0);
    expect((history.series.sp500nzd.points || []).length).toBeGreaterThan(0);
  });
});
