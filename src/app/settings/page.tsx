import { redirect } from "next/navigation";
import { getCurrentUser, isStripeConfigured, hasActiveSubscription } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { SettingsClient } from "@/components/settings/SettingsClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=/settings");

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
      <SettingsClient
        user={{
          name: user.name,
          email: user.email,
          image: user.image,
          subscription_status: user.subscription_status,
          subscription_plan: user.subscription_plan,
          subscription_started_at: user.subscription_started_at,
          subscription_expires_at: user.subscription_expires_at,
          ticker_limit: user.ticker_limit,
          bot_access: user.bot_access ?? "none",
          hasCustomer: !!user.stripe_customer_id,
          stripeConfigured: isStripeConfigured(),
        }}
      />
    </AppShell>
  );
}
