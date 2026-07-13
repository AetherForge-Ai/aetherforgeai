import {
  getCurrentUser,
  isStripeConfigured,
  hasActiveSubscription,
} from "@/lib/session";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { MarketsPageContent } from "@/components/dashboard/MarketsPageContent";

export const dynamic = "force-dynamic";

/**
 * /markets — the full-page "Stock Markets" browser (linked prominently from the
 * sidebar nav). Shows every live ticker across NZX · ASX · Dow Jones · NASDAQ.
 * Logged-out visitors get a read-only preview; members can buy in one click.
 */
export default async function MarketsPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <AppShell guest user={{ name: "Guest", email: "Sign in to activate your account" }}>
        <MarketsPageContent preview />
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
      <MarketsPageContent />
    </AppShell>
  );
}
