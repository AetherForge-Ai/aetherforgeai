import { redirect } from "next/navigation";
import {
  getCurrentUser,
  isStripeConfigured,
  hasActiveSubscription,
  hasPaidSubscription,
} from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { TotalumConsole } from "@/components/totalum/TotalumConsole";

export const dynamic = "force-dynamic";

/**
 * The Headmaster — Portfolio Planning and Strategies.
 * Canonical console route. The legacy /totalum path redirects here.
 */
export default async function HeadmasterPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=/headmaster");

  // Any active member can reach the page; the console itself renders a polished
  // Pro upsell for non-paying members (in demo mode — no Stripe key — it's open).
  if (isStripeConfigured() && !hasActiveSubscription(user)) {
    redirect("/pricing");
  }

  const entitled = !isStripeConfigured() || hasPaidSubscription(user);
  console.log(`[headmaster] Rendering console for user ${user._id} (entitled=${entitled})`);

  return (
    <AppShell
      user={{
        name: user.name,
        email: user.email,
        image: user.image,
        subscription_status: user.subscription_status,
        subscription_plan: user.subscription_plan,
      }}
    >
      <div className="p-4 md:p-8">
        <TotalumConsole entitled={entitled} memberName={user.name} plan={user.subscription_plan} />
      </div>
    </AppShell>
  );
}
