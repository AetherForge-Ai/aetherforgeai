import { redirect } from "next/navigation";
import {
  getCurrentUser,
  isStripeConfigured,
  hasActiveSubscription,
  hasPaidSubscription,
} from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { PortfolioDashboard } from "@/components/dashboard/PortfolioDashboard";

export const dynamic = "force-dynamic";

/** /dashboard/metals — full portfolio hub for Metals Portfolio Overview. */
export default async function DashboardHubPage() {
  const user = await getCurrentUser();
  const view = "metals" as const;

  if (!user) {
    return (
      <AppShell guest user={{ name: "Guest", email: "Sign in to activate your account" }}>
        <PortfolioDashboard
          preview
          view={view}
          userName="Guest"
          subscription={{
            status: null,
            plan: null,
            startedAt: null,
            expiresAt: null,
            tickerLimit: null,
            botAccess: "none",
          }}
          metalsEntitled={false}
        />
      </AppShell>
    );
  }

  if (isStripeConfigured() && !hasActiveSubscription(user)) {
    redirect("/pricing");
  }

  const metalsEntitled = !isStripeConfigured() || hasPaidSubscription(user);

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
        view={view}
        userName={user.name}
        subscription={{
          status: user.subscription_status,
          plan: user.subscription_plan,
          startedAt: user.subscription_started_at,
          expiresAt: user.subscription_expires_at,
          tickerLimit: user.ticker_limit,
          botAccess: user.bot_access ?? "none",
        }}
        metalsEntitled={metalsEntitled}
      />
    </AppShell>
  );
}
