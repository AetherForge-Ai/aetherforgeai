import {
  getCurrentUser,
  isStripeConfigured,
  hasPaidSubscription,
} from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import {
  PortfolioDashboard,
  type DashboardView,
} from "@/components/dashboard/PortfolioDashboard";
import { resolveDisplayName, resolveGreetingName } from "@/lib/user-display";

export async function renderDashboardView(view: DashboardView) {
  const user = await getCurrentUser();

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

  // Free members and testers keep Dashboard + Transactions. Headmaster / metals
  // stay paid-entitled (soft upsell in-console) — never trap them on /pricing.
  const metalsEntitled = !isStripeConfigured() || hasPaidSubscription(user);

  return (
    <AppShell
      user={{
        name: resolveDisplayName(user),
        email: user.email,
        image: user.image,
        subscription_status: user.subscription_status,
        subscription_plan: user.subscription_plan,
      }}
    >
      <PortfolioDashboard
        view={view}
        userName={resolveGreetingName(user)}
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
