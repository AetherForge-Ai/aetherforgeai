import {
  getCurrentUser,
  isStripeConfigured,
  hasActiveSubscription,
} from "@/lib/session";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { MarketNewsPageContent } from "@/components/dashboard/MarketNewsPageContent";

export const dynamic = "force-dynamic";

/**
 * /market-news — dedicated Market News page (same header/footer chrome as other app pages).
 * Extracted from the Dashboard Market News section.
 */
export default async function MarketNewsPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <AppShell guest user={{ name: "Guest", email: "Sign in to activate your account" }}>
        <MarketNewsPageContent preview />
      </AppShell>
    );
  }

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
      <MarketNewsPageContent />
    </AppShell>
  );
}
