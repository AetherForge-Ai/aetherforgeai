/**
 * b87 CR-1 F-1/F-2/F-3 (TT 28 Oct 2026). Pure rules shared by checkout, /pricing, /stripe/success
 * and /api/account/plan. No network.
 */
import { formatDisplayDate } from "@/lib/currency";
import { planByKey } from "@/lib/plans";

/** Statuses that mean the account already has a subscription (a second checkout would double-bill). */
const LIVE = new Set(["active", "trialing", "past_due"]);

/** Where a subscriber goes when this account can open the Stripe customer portal. */
export const MANAGE_BILLING_HREF = "/settings/billing";

/** Where a subscriber goes when no Manage billing control exists for them. */
export const BILLING_SUPPORT_HREF = "/contact";

/**
 * The Manage billing control on /settings/billing is the portal button.
 * It is rendered only when Stripe is configured and this user has a Stripe customer.
 */
export function billingPortalReady(input: { stripeConfigured: boolean; stripeCustomerId?: string | null }): boolean {
  return input.stripeConfigured && !!input.stripeCustomerId;
}

export interface PaidPlanNextStep {
  /** True only when Manage billing can actually be opened for this account. */
  portal: boolean;
  href: string;
  /** Link text used inside a sentence. */
  action: string;
  currentLabel: string;
  changeLabel: string;
  heroLead: string;
  settingsLead: string;
}

/**
 * Shared by /pricing and /settings/billing.
 * "Manage billing" is used only when a Stripe customer exists (the portal control).
 * Otherwise the same spots point at contact support.
 */
export function paidPlanNextStep(hasStripeCustomer: boolean): PaidPlanNextStep {
  if (hasStripeCustomer) {
    return {
      portal: true,
      href: MANAGE_BILLING_HREF,
      action: "Manage billing",
      currentLabel: "Current plan · Manage billing",
      changeLabel: "Change plan in Manage billing",
      heroLead: "You already have a plan. Change or cancel it in",
      settingsLead: "",
    };
  }
  return {
    portal: false,
    href: BILLING_SUPPORT_HREF,
    action: "contact support",
    currentLabel: "Current plan · Contact support",
    changeLabel: "Change plan via contact",
    heroLead: "You already have a plan. To change or cancel it,",
    settingsLead: "This plan has no Stripe billing account. To change or cancel it,",
  };
}

/**
 * Checkout 409 body. Shown by the checkout API (`error`) and toasted when a client
 * does not redirect. "Manage billing" only when this account can open the portal.
 */
export function alreadySubscribedMessage(hasStripeCustomer: boolean): string {
  if (paidPlanNextStep(hasStripeCustomer).portal) {
    return "You already have a subscription. Change or manage your plan in Manage billing. No new checkout was started.";
  }
  return "You already have a subscription. To change or cancel it, contact support. No new checkout was started.";
}

/** Portal-account wording. Prefer alreadySubscribedMessage for a specific account. */
export const ALREADY_SUBSCRIBED = alreadySubscribedMessage(true);

export function hasLiveSubscription(account: { status?: string | null; plan?: string | null } | null | undefined): boolean {
  if (!account) return false;
  const plan = String(account.plan || "none").toLowerCase();
  return LIVE.has(String(account.status || "").toLowerCase()) && plan !== "none" && plan !== "free" && plan !== "";
}

/** "starter" | "pro" | the legacy key prefix. */
export function planTier(planKey: string | null | undefined): string {
  return String(planKey || "").toLowerCase().split("_")[0];
}

export type PricingCta =
  | { kind: "checkout" }
  | { kind: "current" | "manage"; label: string; href: string; portal: boolean };

/** /pricing button for a paid tier, given the signed-in account (null when signed out or Free). */
export function pricingCtaFor(
  tierId: string,
  account: { status?: string | null; plan?: string | null; hasStripeCustomer?: boolean | null } | null | undefined
): PricingCta {
  if (!hasLiveSubscription(account)) return { kind: "checkout" };
  const step = paidPlanNextStep(account?.hasStripeCustomer === true);
  const kind = planTier(account?.plan) === String(tierId).toLowerCase() ? "current" : "manage";
  return {
    kind,
    label: kind === "current" ? step.currentLabel : step.changeLabel,
    href: step.href,
    portal: step.portal,
  };
}

export interface SuccessCopy {
  heading: string;
  body: string;
  showYearlyBox: boolean;
}

/** /stripe/success copy from the plan the checkout was for (server-set ?plan=). Unknown plan: neutral copy. */
export function successCopyFor(planKey: string | null | undefined): SuccessCopy {
  const plan = planByKey(String(planKey || "") as never);
  const tier = planTier(planKey);
  const name = tier === "starter" ? "Starter" : tier === "pro" ? "Pro" : null;
  if (!plan || !name) {
    return { heading: "Welcome to AetherForge AI", body: "Your subscription is set up. Your plan shows in Settings once Stripe confirms it.", showYearlyBox: false };
  }
  const body =
    name === "Pro"
      ? "Your Pro subscription is set up: Stox, Koins and the full Headmaster."
      : "Your Starter subscription is set up: your chosen bot and Starter limits.";
  return { heading: `Welcome to AetherForge ${name}`, body, showYearlyBox: plan.interval === "year" };
}

/** Status to show: Stripe's trialing passes through (the app stores trialing as active). */
export function displayStatus(appStatus: string | null | undefined, stripeStatus: string | null | undefined): string {
  const app = String(appStatus || "none");
  return app === "active" && stripeStatus === "trialing" ? "trialing" : app;
}

export function trialEndsLine(trialEndUnix: number | null | undefined): string | null {
  return typeof trialEndUnix === "number" && trialEndUnix > 0 ? `Trial ends ${formatDisplayDate(new Date(trialEndUnix * 1000))}` : null;
}
