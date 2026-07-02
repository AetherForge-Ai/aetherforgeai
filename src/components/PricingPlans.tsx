"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Check, Loader2, Sparkles, LineChart, Bitcoin } from "lucide-react";
import { toast } from "sonner";
import { PLANS, type Plan, type PlanKey } from "@/lib/plans";

type BotChoice = "stock" | "crypto";

function priceParts(price: number): { dollars: string; cents: string } {
  const dollars = Math.floor(price);
  const cents = Math.round((price - dollars) * 100)
    .toString()
    .padStart(2, "0");
  return { dollars: dollars.toString(), cents };
}

export function PricingPlans() {
  const router = useRouter();
  const { data: session } = useSession();
  const [bot, setBot] = useState<BotChoice>("stock");
  const [checkoutKey, setCheckoutKey] = useState<PlanKey | null>(null);

  async function handleSubscribe(plan: Plan) {
    if (!session?.user) {
      router.push("/register?redirect=/pricing");
      return;
    }
    setCheckoutKey(plan.key);
    console.log(`[pricing] Starting checkout for ${plan.key}`, { bot });
    const res = await api.post<{ url: string }>("/api/stripe/checkout", {
      priceId: plan.priceId,
      plan: plan.key,
      bot: plan.botAccess === "both" ? undefined : bot,
    });
    if (res.ok && res.data?.url) {
      window.location.href = res.data.url;
    } else {
      const msg = typeof res.error === "string" ? res.error : res.error?.message || "Could not start checkout.";
      console.error("[pricing] checkout failed:", res.error);
      toast.error(msg);
      setCheckoutKey(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      {/* Bot selector — applies to the single-bot plans */}
      <div className="flex flex-col items-center gap-3">
        <p className="text-sm text-muted-foreground">
          Choose which monitor to activate on the single-bot plans:
        </p>
        <div className="inline-flex items-center rounded-full border border-border/70 bg-card/60 p-1">
          <button
            onClick={() => setBot("stock")}
            className={`flex items-center gap-2 rounded-full px-5 py-2 text-sm font-medium transition-colors ${
              bot === "stock" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LineChart className="size-4" /> Stock bot
          </button>
          <button
            onClick={() => setBot("crypto")}
            className={`flex items-center gap-2 rounded-full px-5 py-2 text-sm font-medium transition-colors ${
              bot === "crypto" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Bitcoin className="size-4" /> Crypto bot
          </button>
        </div>
      </div>

      <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        {PLANS.map((plan) => {
          const { dollars, cents } = priceParts(plan.price);
          const loading = checkoutKey === plan.key;
          const isDual = plan.botAccess === "both";
          return (
            <div
              key={plan.key}
              className={`relative flex flex-col overflow-hidden rounded-3xl border p-6 ${
                plan.featured
                  ? "border-primary/40 bg-gradient-to-b from-primary/12 to-card/60 shadow-glow"
                  : "border-border/70 bg-card/40"
              }`}
            >
              {plan.featured && (
                <div className="absolute right-5 top-5 inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-[11px] font-semibold text-primary ring-1 ring-primary/25">
                  <Sparkles className="size-3" /> Popular
                </div>
              )}

              <h3 className="font-display text-lg font-bold">{plan.name}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{plan.tagline}</p>

              <div className="mt-5 flex items-end gap-1">
                <span className="text-lg font-semibold text-muted-foreground">$</span>
                <span className="tnum font-display text-4xl font-extrabold leading-none">{dollars}</span>
                <span className="tnum text-lg font-semibold">.{cents}</span>
                <span className="mb-0.5 text-xs text-muted-foreground">/ {plan.intervalLabel}</span>
              </div>

              <div className="mt-2 text-xs font-medium text-primary">
                {isDual ? "Stock + Crypto bots included" : `Applies to your ${bot} bot`}
              </div>

              <ul className="mt-5 flex-1 space-y-2.5">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
                      <Check className="size-2.5" />
                    </span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <Button
                onClick={() => handleSubscribe(plan)}
                disabled={loading}
                className="mt-6 w-full font-semibold"
                variant={plan.featured ? "default" : "outline"}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" /> Redirecting…
                  </>
                ) : session?.user ? (
                  "Subscribe"
                ) : (
                  "Get started"
                )}
              </Button>
            </div>
          );
        })}
      </div>

      <p className="mt-8 text-center text-xs text-muted-foreground">
        Every plan includes SuperGrok 4.3 ULTRA ADVANCED Zenith-State reports · Secure checkout via Stripe · Cancel
        anytime · Test card <span className="font-mono">4242 4242 4242 4242</span>
      </p>
    </div>
  );
}
