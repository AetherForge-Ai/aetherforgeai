import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, hasPaidSubscription } from "@/lib/session";
import { SiteHeader } from "@/components/SiteHeader";
import { TrialExperience } from "@/components/trial/TrialExperience";
import { Sparkles, ArrowRight, CheckCircle2 } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * /free-trial — the ONE-TIME temporary "Zenith" dashboard.
 *
 * Server gate:
 *   · not signed in            → /register (carry plan + redirect back here)
 *   · active paid subscription → /dashboard (they have the full product)
 *   · trial already used       → friendly "already used" upsell state
 *   · otherwise                → render the one-time trial experience
 */
export default async function FreeTrialPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/register?plan=free&redirect=/free-trial");
  }

  // Paying members already have the full product — send them to the dashboard.
  if (hasPaidSubscription(user)) {
    redirect("/dashboard");
  }

  const alreadyUsed = user.trial_used === "yes";

  return (
    <div className="relative min-h-screen bg-background">
      {/* Atmospheric backdrop */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-40 top-0 size-[36rem] rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute -right-40 top-40 size-[32rem] rounded-full bg-violet-500/10 blur-3xl" />
      </div>

      <SiteHeader />

      {alreadyUsed ? (
        <div className="mx-auto max-w-2xl px-4 py-20 text-center sm:px-6">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-600 ring-1 ring-emerald-500/25">
            <CheckCircle2 className="size-3.5" /> Trial complete
          </span>
          <h1 className="mt-4 font-display text-3xl font-bold sm:text-4xl">You&apos;ve used your one-time ZENITH report</h1>
          <p className="mx-auto mt-3 max-w-lg text-sm text-muted-foreground">
            Your complimentary run has already been generated and emailed to{" "}
            <span className="font-medium text-foreground">{user.email}</span>. To keep running unlimited ULTRA ADVANCED
            reports across both bots — plus live price alerts and scheduled 9am briefings — pick a subscription.
          </p>
          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-glow transition-opacity hover:opacity-90"
            >
              <Sparkles className="size-4" /> View subscription plans
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-xl border border-border/70 px-5 py-3 text-sm font-semibold transition-colors hover:bg-card/60"
            >
              Go to dashboard <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      ) : (
        <TrialExperience userName={user.name} />
      )}
    </div>
  );
}
