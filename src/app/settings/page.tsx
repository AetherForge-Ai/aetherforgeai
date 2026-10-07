import { redirect } from "next/navigation";
import { getCurrentUser, isStripeConfigured } from "@/lib/session";
import { publicPageMetadata } from "@/lib/reviewed-book";
import { AppShell } from "@/components/AppShell";
import { SettingsClient } from "@/components/settings/SettingsClient";
import { RedirectSignedOut } from "@/components/auth/RedirectSignedOut";
import { resolveDisplayName } from "@/lib/user-display";

export const dynamic = "force-dynamic";

export const metadata = publicPageMetadata("/settings", {
  title: "Settings · AetherForge AI",
  description: "Account settings for your AetherForge paper book.",
});

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=/settings");

  return (
    <RedirectSignedOut redirectTo="/settings">
      <AppShell
        user={{
          name: resolveDisplayName(user) || user.name,
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
            first_name: user.first_name ?? "",
            last_name: user.last_name ?? "",
            country: user.country ?? "",
            phone: user.phone ?? "",
            secondary_email: user.secondary_email ?? "",
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
    </RedirectSignedOut>
  );
}
