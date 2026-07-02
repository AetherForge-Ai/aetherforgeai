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

/** True when the user has an active paid subscription. */
export function hasActiveSubscription(user: AppUser | null): boolean {
  return user?.subscription_status === "active";
}
