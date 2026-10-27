// b83 CR-6c: the signed-in user's own plan, status and the last 4 chars of their subscription id.
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { checkoutStripe } from "@/lib/stripe-mode";
import { displayStatus, trialEndsLine } from "@/lib/billing-guard";

export const dynamic = "force-dynamic";

const READ_TIMEOUT_MS = 8000;

function last4(id: string | null | undefined): string | null {
  return id ? id.slice(-4) : null;
}

type LatestSub = { id: string; status: string; trialEnd: number | null } | null;

async function latestSubscription(userId: string, customerId: string | null | undefined): Promise<LatestSub> {
  if (!customerId) return null;
  try {
    const { client } = checkoutStripe(userId);
    if (!client) return null;
    let t: ReturnType<typeof setTimeout> | undefined;
    const list = await Promise.race([
      client.subscriptions.list({ customer: customerId, status: "all", limit: 1 }),
      new Promise<never>((_, rej) => { t = setTimeout(() => rej(new Error("timeout")), READ_TIMEOUT_MS); }),
    ]).finally(() => t && clearTimeout(t));
    const sub = list.data[0];
    return sub ? { id: sub.id, status: String(sub.status), trialEnd: typeof sub.trial_end === "number" ? sub.trial_end : null } : null;
  } catch {
    return null;
  }
}

export async function GET() {
  const user = await getCurrentUser({ fresh: true });
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const sub = await latestSubscription(user._id, user.stripe_customer_id);
  const status = displayStatus(user.subscription_status ?? "none", sub?.status);
  return NextResponse.json(
    {
      plan: user.subscription_plan ?? "none",
      // b87 CR-1 F-3: trialing passes through from Stripe (the app stores it as active).
      status,
      trialEndsAt: status === "trialing" && sub?.trialEnd ? new Date(sub.trialEnd * 1000).toISOString() : null,
      trialLine: status === "trialing" ? trialEndsLine(sub?.trialEnd) : null,
      subscriptionIdLast4: last4(sub?.id),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
