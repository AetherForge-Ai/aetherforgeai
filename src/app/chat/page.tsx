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

export default async function DashboardPage() {
  const user = await getCurrentUser();

  // Logged-out visitors get a live, read-only PREVIEW of the dashboard: every
  // section is visible so they can see what they’d get, but the member sections
  // (overview, holdings, transaction centre, alerts, report centre) are locked.
  if (!user) {
    return (
      <AppShell guest user={{ name: "Guest", email: "Sign in to activate your account" }}>
        <PortfolioDashboard
          preview
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

  // Subscription gate — only enforced when billing is actually configured,
  // so the app remains fully usable in demo mode without a Stripe key.
  if (isStripeConfigured() && !hasActiveSubscription(user)) {
    redirect("/pricing");
  }

  // Precious-metals bonus: free for active PAYING members (in demo mode — no
  // Stripe key — it's open to everyone so testers aren't locked out).
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

