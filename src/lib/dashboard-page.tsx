import {
  getCurrentUser,
  isStripeConfigured,
  hasPaidSubscription,
} from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { GuestDashboardGate } from "@/components/dashboard/GuestDashboardGate";
import {
  PortfolioDashboard,
  type DashboardView,
} from "@/components/dashboard/PortfolioDashboard";
import { resolveDisplayName, resolveGreetingName } from "@/lib/user-display";
import {
  AccountOwnerGuard,
  DashboardSessionRecovery,
} from "@/components/dashboard/AccountOwnerGuard";

// Greeting: live session name/email only — never cached/placeholder "Test".
// Page reads skip cookie refresh and the session_data cache so a shared
// browser cannot paint the other paper book during metals/transactions nav.

export async function renderDashboardView(view: DashboardView) {
  const user = await getCurrentUser({ refreshSession: false, disableCookieCache: true });

  if (!user) {
    return (
      <AppShell guest user={{ name: "Guest", email: "Sign in to activate your account" }}>
        <DashboardSessionRecovery>
          <GuestDashboardGate />
        </DashboardSessionRecovery>
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
      <AccountOwnerGuard key={user.id} userId={user.id}>
        <PortfolioDashboard
          view={view}
          userId={user.id}
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
      </AccountOwnerGuard>
    </AppShell>
  );
}
