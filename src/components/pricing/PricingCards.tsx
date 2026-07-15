"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  PRICING_TIERS,
  planByKey,
  buildPaymentLinkUrl,
  SALES_EMAIL,
  ANNUAL_SAVINGS_PCT,
  type PricingTier,
  type PlanKey,
} from "@/lib/plans";
import {
  Check,
  Loader2,
  Sparkles,
  ArrowRight,
  LineChart,
  Bitcoin,
  Crown,
} from "lucide-react";

type BillingPeriod = "monthly" | "annual";
type BotChoice = "stock" | "crypto";

/** $1,990 → "1,990" */
function money(n: number): string {
  return n.toLocaleString("en-US");
}

/** Whole-dollar monthly equivalent of an annual price. */
function monthlyEquivalent(yearly: number): string {
  return (yearly / 12).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function PricingCards() {
  const router = useRouter();
  const { data: session } = useSession();
  const [period, setPeriod] = useState<BillingPeriod>("monthly");
  const [bot, setBot] = useState<BotChoice>("stock");
  const [loadingTier, setLoadingTier] = useState<string | null>(null);

  const annual = period === "annual";

  async function startCheckout(tier: PricingTier) {
    const planKey: PlanKey | null = annual ? tier.yearlyPlanKey : tier.monthlyPlanKey;
    if (!planKey) return;
    const plan = planByKey(planKey);
    if (!plan) {
      toast.error("This plan is not available right now.");
      return;
    }

    // Not signed in → send to register, then bounce back to pricing to finish.
    if (!session?.user) {
      router.push(`/register?redirect=/pricing`);
      return;
    }

    setLoadingTier(tier.id);

    // Preferred path: the owner's shareable Stripe Payment Link. We tag it with
    // the signed-in user's id (client_reference_id) + email so the webhook can
    // attach the subscription to their account. Bot choice matters only for the
    // single-bot Starter tier.
    const paymentUrl = buildPaymentLinkUrl(plan, {
      userId: session.user.id,
      email: session.user.email,
      bot: plan.botAccess === "both" ? undefined : bot,
    });
    if (paymentUrl) {
      console.log(`[pricing] Payment Link → ${tier.id} (${period})`, { plan: plan.key, bot });
      window.location.href = paymentUrl;
      return;
    }

    // Fallback: dynamic Checkout Session (used if a plan has no payment link).
    console.log(`[pricing] Checkout session ${tier.id} (${period})`, { priceId: plan.priceId, bot });
    const res = await api.post<{ url: string }>("/api/stripe/checkout", {
      priceId: plan.priceId,
      // Bot choice only matters for single-bot tiers (Starter); ignored otherwise.
      bot: plan.botAccess === "both" ? undefined : bot,
    });
    if (res.ok && res.data?.url) {
      window.location.href = res.data.url;
    } else {
      const msg =
        typeof res.error === "string" ? res.error : res.error?.message || "Could not start checkout.";
      console.error("[pricing] checkout failed:", res.error);
      toast.error(msg);
      setLoadingTier(null);
    }
  }

  function handleCta(tier: PricingTier) {
    if (tier.cta.kind === "register") {
      router.push("/register");
    } else if (tier.cta.kind === "sales") {
      // Ultimate enquiries use the subject "Ultimate"; any other sales CTA uses
      // "Sale <plan name>" so the inbox can be triaged at a glance.
      const subject = tier.id === "ultimate" ? "Ultimate" : `Sale ${tier.name}`;
      window.location.href = `mailto:${SALES_EMAIL}?subject=${encodeURIComponent(subject)}`;
    } else {
      void startCheckout(tier);
    }
  }

  return (
    <div>
      {/* Billing toggle */}
      <div className="flex flex-col items-center gap-3">
        <div className="inline-flex items-center rounded-full border border-border/70 bg-card/60 p-1 shadow-sm">
          <button
            onClick={() => setPeriod("monthly")}
            className={cn(
              "rounded-full px-6 py-2 text-sm font-semibold transition-colors",
              !annual ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
            )}
            aria-pressed={!annual}
          >
            Monthly
          </button>
          <button
            onClick={() => setPeriod("annual")}
            className={cn(
              "flex items-center gap-2 rounded-full px-6 py-2 text-sm font-semibold transition-colors",
              annual ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
            )}
            aria-pressed={annual}
          >
            Annual
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[0.62rem] font-bold",
                annual ? "bg-primary-foreground/20 text-primary-foreground" : "bg-emerald-500/15 text-emerald-600"
              )}
            >
              Save ~{ANNUAL_SAVINGS_PCT}%
            </span>
          </button>
        </div>

        {/* Single-bot selector — applies to Starter checkout only */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="hidden sm:inline">Single-bot plan (Starter) uses:</span>
          <div className="inline-flex items-center rounded-full border border-border/60 bg-card/50 p-0.5">
            <button
              onClick={() => setBot("stock")}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1 font-medium transition-colors",
                bot === "stock" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <LineChart className="size-3.5" /> Stox
            </button>
            <button
              onClick={() => setBot("crypto")}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1 font-medium transition-colors",
                bot === "crypto" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Bitcoin className="size-3.5" /> Koins
            </button>
          </div>
        </div>
      </div>

      {/* Cards */}
      <div className="mt-10 grid items-start gap-5 lg:grid-cols-4">
        {PRICING_TIERS.map((tier) => {
          const isFree = tier.id === "free";
          const price = annual ? tier.yearlyPrice : tier.monthlyPrice;
          const loading = loadingTier === tier.id;
          return (
            <div
              key={tier.id}
              className={cn(
                "relative flex h-full flex-col rounded-3xl border p-6 transition-all duration-200",
                tier.featured
                  ? "border-primary/50 bg-gradient-to-b from-primary/12 via-card/60 to-card/50 shadow-glow lg:-mt-3 lg:mb-3 lg:pb-9 hover:border-primary/70"
                  : "border-border/70 bg-card/40 hover:border-primary/40 hover:bg-card/60"
              )}
            >
              {tier.badge && (
                <div
                  className={cn(
                    "absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-3 py-1 text-[0.68rem] font-bold uppercase tracking-wide shadow",
                    tier.featured
                      ? "bg-primary text-primary-foreground ring-1 ring-primary/40"
                      : "bg-gold/15 text-gold ring-1 ring-gold/30"
                  )}
                >
                  {tier.featured ? (
                    <span className="inline-flex items-center gap-1">
                      <Sparkles className="size-3" /> {tier.badge}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <Crown className="size-3" /> {tier.badge}
                    </span>
                  )}
                </div>
              )}

              <h3 className="font-display text-xl font-bold">{tier.name}</h3>
              <p className="mt-1 min-h-[2.5rem] text-sm text-muted-foreground">{tier.subtitle}</p>

              {/* Price */}
              <div className="mt-5">
                {isFree ? (
                  <div className="flex items-end gap-1">
                    <span className="font-display text-4xl font-extrabold leading-none">$0</span>
                    <span className="mb-0.5 text-sm text-muted-foreground">forever</span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-end gap-1">
                      <span className="text-lg font-semibold text-muted-foreground">$</span>
                      <span className="tnum font-display text-4xl font-extrabold leading-none">
                        {money(price ?? 0)}
                      </span>
                      <span className="mb-0.5 text-sm text-muted-foreground">/{annual ? "yr" : "mo"}</span>
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {annual ? (
                        <>
                          Billed annually · Save ~{ANNUAL_SAVINGS_PCT}% ·{" "}
                          <span className="font-medium text-foreground/80">
                            ~${monthlyEquivalent(price ?? 0)}/mo
                          </span>
                        </>
                      ) : (
                        <>or ${money(tier.yearlyPrice ?? 0)}/yr · Save ~{ANNUAL_SAVINGS_PCT}% annually</>
                      )}
                    </p>
                  </>
                )}
              </div>

              {/* CTA */}
              <Button
                onClick={() => handleCta(tier)}
                disabled={loading}
                variant={tier.featured ? "default" : "outline"}
                className="mt-6 h-11 w-full font-semibold"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" /> Redirecting…
                  </>
                ) : (
                  <>
                    {tier.cta.label}
                    <ArrowRight className="ml-1.5 size-4" />
                  </>
                )}
              </Button>

              {/* Highlights */}
              <ul className="mt-6 space-y-2.5">
                {tier.highlights.map((h) => (
                  <li key={h} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                    <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
                      <Check className="size-2.5" />
                    </span>
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <p className="mt-8 text-center text-xs text-muted-foreground">
        All prices in NZD · Secure Stripe checkout · Cancel anytime · Paid plans include a 14-day Pro trial
      </p>
    </div>
  );
}
