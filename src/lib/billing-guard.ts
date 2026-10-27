/**
 * b87 CR-1 F-1/F-2/F-3 (TT 28 Oct 2026). Pure rules shared by checkout, /pricing, /stripe/success
 * and /api/account/plan. No network.
 */
import { formatDisplayDate } from "@/lib/currency";
import { planByKey } from "@/lib/plans";

/** Statuses that mean the account already has a subscription (a second checkout would double-bill). */
const LIVE = new Set(["active", "trialing", "past_due"]);

export const ALREADY_SUBSCRIBED =
  "You already have a subscription. Change or manage your plan in Manage billing. No new checkout was started.";

export function hasLiveSubscription(account: { status?: string | null; plan?: string | null } | null | undefined): boolean {
  if (!account) return false;
  const plan = String(account.plan || "none").toLowerCase();
  return LIVE.has(String(account.status || "").toLowerCase()) && plan !== "none" && plan !== "free" && plan !== "";
}

/** "starter" | "pro" | the legacy key prefix. */
export function planTier(planKey: string | null | undefined): string {
  return String(planKey || "").toLowerCase().split("_")[0];
}

export type PricingCta = { kind: "checkout" } | { kind: "current"; label: string } | { kind: "manage"; label: string };

/** /pricing button for a paid tier, given the signed-in account (null when signed out or Free). */
export function pricingCtaFor(tierId: string, account: { status?: string | null; plan?: string | null } | null | undefined): PricingCta {
  if (!hasLiveSubscription(account)) return { kind: "checkout" };
  if (planTier(account?.plan) === String(tierId).toLowerCase()) return { kind: "current", label: "Current plan · Manage billing" };
  return { kind: "manage", label: "Change plan in Manage billing" };
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
