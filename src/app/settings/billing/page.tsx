import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { RedirectSignedOut } from "@/components/auth/RedirectSignedOut";
import { BillingPortalButton } from "@/components/settings/BillingPortalButton";
import { SettingsSectionNav } from "@/components/settings/SettingsSectionNav";
import { Button } from "@/components/ui/button";
import { loadAccountPlan } from "@/lib/account-plan";
import { publicPageMetadata } from "@/lib/reviewed-book";
import { getCurrentUser, isStripeConfigured } from "@/lib/session";
import { resolveDisplayName } from "@/lib/user-display";

export const dynamic = "force-dynamic";

export const metadata = publicPageMetadata("/settings/billing", {
  title: "Plan & billing · AetherForge AI",
  description: "Your current AetherForge AI plan, renewal date, and usage against the published limits.",
});

export default async function BillingSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=/settings/billing");
  const snapshot = await loadAccountPlan(user);
  const portal = isStripeConfigured() && !!user.stripe_customer_id;

  return (
    <RedirectSignedOut redirectTo="/settings/billing">
      <AppShell
        user={{
          name: resolveDisplayName(user) || user.name,
          email: user.email,
          image: user.image,
          subscription_status: user.subscription_status,
          subscription_plan: user.subscription_plan,
        }}
      >
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
          <h1 className="font-display text-3xl font-bold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">Plan, usage and billing for your paper book.</p>
          <SettingsSectionNav current="billing" />

          <section className="mt-8 rounded-3xl border border-border/70 bg-card/50 p-6">
            <h2 className="font-display text-lg font-bold">Plan & billing</h2>
            <dl className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-border/60 px-4 py-3">
                <dt className="text-xs text-muted-foreground">Current plan</dt>
                <dd className="mt-1 text-sm font-semibold">{snapshot.planName}</dd>
              </div>
              <div className="rounded-2xl border border-border/60 px-4 py-3">
                <dt className="text-xs text-muted-foreground">Renewal date</dt>
                <dd className="mt-1 text-sm font-semibold">{snapshot.renewal}</dd>
              </div>
              <div className="rounded-2xl border border-border/60 px-4 py-3">
                <dt className="text-xs text-muted-foreground">Holdings</dt>
                <dd className="mt-1 text-sm font-semibold">{snapshot.holdings}</dd>
              </div>
              <div className="rounded-2xl border border-border/60 px-4 py-3">
                <dt className="text-xs text-muted-foreground">Reports this month</dt>
                <dd className="mt-1 text-sm font-semibold">{snapshot.reports}</dd>
              </div>
              <div className="rounded-2xl border border-border/60 px-4 py-3 sm:col-span-2">
                <dt className="text-xs text-muted-foreground">Market Assistant questions this month</dt>
                <dd className="mt-1 text-sm font-semibold">{snapshot.assistant}</dd>
                <p className="mt-1 text-xs text-muted-foreground">
                  Counts questions asked on the Market Assistant page. The Assistant Guide on the dashboard is not counted.
                </p>
              </div>
            </dl>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{snapshot.scopeNote}</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{snapshot.ladder}</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{snapshot.prices}</p>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{snapshot.apexNote}</p>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Annual and monthly cancellation rules are on the{" "}
              <Link href="/refunds" className="font-medium text-primary hover:underline">
                Refunds & Cancellations
              </Link>{" "}
              page.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              {snapshot.planName === "Apex Dual" ? (
                <p className="text-sm text-muted-foreground">This account is on Apex Dual.</p>
              ) : (
              <Button asChild>
                <Link href={snapshot.upgradeHref}>Compare plans</Link>
              </Button>
              )}
              {portal ? <BillingPortalButton /> : null}
            </div>
          </section>
        </div>
      </AppShell>
    </RedirectSignedOut>
  );
}
