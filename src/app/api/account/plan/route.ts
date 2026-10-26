// b83 CR-6c: the signed-in user's own plan, status and the last 4 chars of their subscription id.
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { checkoutStripe } from "@/lib/stripe-mode";

export const dynamic = "force-dynamic";

const READ_TIMEOUT_MS = 8000;

function last4(id: string | null | undefined): string | null {
  return id ? id.slice(-4) : null;
}

async function latestSubscriptionId(userId: string, customerId: string | null | undefined): Promise<string | null> {
  if (!customerId) return null;
  try {
    const { client } = checkoutStripe(userId);
    if (!client) return null;
    let t: ReturnType<typeof setTimeout> | undefined;
    const list = await Promise.race([
      client.subscriptions.list({ customer: customerId, status: "all", limit: 1 }),
      new Promise<never>((_, rej) => { t = setTimeout(() => rej(new Error("timeout")), READ_TIMEOUT_MS); }),
    ]).finally(() => t && clearTimeout(t));
    return list.data[0]?.id ?? null;
  } catch {
    return null;
  }
}

export async function GET() {
  const user = await getCurrentUser({ fresh: true });
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const subId = await latestSubscriptionId(user._id, user.stripe_customer_id);
  return NextResponse.json(
    {
      plan: user.subscription_plan ?? "none",
      status: user.subscription_status ?? "none",
      subscriptionIdLast4: last4(subId),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
