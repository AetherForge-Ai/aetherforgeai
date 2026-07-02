import { redirect } from "next/navigation";
import { getCurrentUser, isStripeConfigured, hasActiveSubscription } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { PortfolioDashboard } from "@/components/dashboard/PortfolioDashboard";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=/dashboard");

  // Subscription gate — only enforced when billing is actually configured,
  // so the app remains fully usable in demo mode without a Stripe key.
  if (isStripeConfigured() && !hasActiveSubscription(user)) {
    redirect("/pricing");
  }

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
      <PortfolioDashboard
        userName={user.name}
        subscription={{
          status: user.subscription_status,
          plan: user.subscription_plan,
          startedAt: user.subscription_started_at,
          expiresAt: user.subscription_expires_at,
          tickerLimit: user.ticker_limit,
          botAccess: user.bot_access ?? "none",
        }}
      />
    </AppShell>
  );
}
