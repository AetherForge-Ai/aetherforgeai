import "server-only";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { totalumSdk } from "@/lib/totalum";

export type BotAccessValue = "stock" | "crypto" | "both" | "none";

export interface AppUser {
  _id: string;
  id: string;
  email: string;
  name: string;
  image?: string | null;
  stripe_customer_id?: string | null;
  subscription_status?: "active" | "canceled" | "past_due" | "none" | null;
  subscription_plan?: "free" | "weekly" | "monthly" | "yearly" | "dual_yearly" | "none" | null;
  subscription_started_at?: string | null;
  subscription_expires_at?: string | null;
  ticker_limit?: number | null;
  bot_access?: BotAccessValue | null;
  /** "yes" once the user has consumed their one-time free-trial Zenith report. */
  trial_used?: "yes" | "no" | null;
  trial_used_at?: string | null;
  /** Investable cash balance in NZD, adjusted by buy/sell/deposit/withdraw. */
  cash_balance?: number | null;
  first_name?: string | null;
  last_name?: string | null;
  country?: string | null;
  phone?: string | null;
  secondary_email?: string | null;
}

/**
 * Returns the current session user merged with the full Totalum user record
 * (so subscription/billing fields are always present). Returns null if there
 * is no valid session.
 */
export async function getCurrentUser(): Promise<AppUser | null> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) return null;

    const userId = session.user.id;
    let record: any = null;
    try {
      const res = await totalumSdk.crud.getRecordById("user", userId);
      record = (res as any)?.data ?? null;
    } catch (err) {
      console.error("[session] Failed to load full user record:", err);
    }

    return {
      _id: userId,
      id: userId,
      email: session.user.email,
      name: session.user.name,
      image: session.user.image ?? record?.image ?? null,
      stripe_customer_id: record?.stripe_customer_id ?? null,
      subscription_status: record?.subscription_status ?? "none",
      subscription_plan: record?.subscription_plan ?? "none",
      subscription_started_at: record?.subscription_started_at ?? null,
      subscription_expires_at: record?.subscription_expires_at ?? null,
      ticker_limit: typeof record?.ticker_limit === "number" ? record.ticker_limit : null,
      bot_access: record?.bot_access ?? "none",
      trial_used: record?.trial_used ?? "no",
      trial_used_at: record?.trial_used_at ?? null,
      cash_balance: typeof record?.cash_balance === "number" ? record.cash_balance : 0,
      first_name: record?.first_name ?? (session.user as any).first_name ?? null,
      last_name: record?.last_name ?? (session.user as any).last_name ?? null,
      country: record?.country ?? (session.user as any).country ?? null,
      phone: record?.phone ?? (session.user as any).phone ?? null,
      secondary_email: record?.secondary_email ?? (session.user as any).secondary_email ?? null,
    };
  } catch (err) {
    console.error("[session] getCurrentUser error:", err);
    return null;
  }
}

/** Whether Stripe billing is configured in this environment. */
export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

/** True when the user has an active subscription of ANY tier (incl. legacy free). */
export function hasActiveSubscription(user: AppUser | null): boolean {
  return user?.subscription_status === "active";
}

/** The paid (non-free) subscription tiers. */
const PAID_PLANS = ["weekly", "monthly", "yearly", "dual_yearly"];

/**
 * True only for an active PAID subscription (excludes the free tier).
 * This is the gate that separates the permanent dashboard (paying members) from
 * the one-time free-trial experience (signed-up but not yet paying).
 */
export function hasPaidSubscription(user: AppUser | null): boolean {
  return user?.subscription_status === "active" && PAID_PLANS.includes(user?.subscription_plan || "");
}

/**
 * Eligibility for the ONE-TIME free-trial "Zenith" report: the user must be
 * signed in, NOT on an active PAID subscription, and must NOT have already
 * consumed their single trial run.
 */
export function isTrialEligible(user: AppUser | null): boolean {
  if (!user) return false;
  if (hasPaidSubscription(user)) return false;
  return user.trial_used !== "yes";
}
