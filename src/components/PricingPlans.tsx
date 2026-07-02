"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Check, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

interface StripePrice {
  id: string;
  amount: number;
  currency: string;
  interval: string | null;
  nickname: string | null;
}
interface StripeProduct {
  id: string;
  name: string;
  description: string | null;
  prices: StripePrice[];
}

const PERKS = [
  "Unlimited portfolio holdings",
  "Real-time gains & losses tracking",
  "Sector allocation & risk breakdown",
  "One-click AI research reports",
  "Unlimited AI market assistant chat",
  "Private, per-user data isolation",
  "Manage billing anytime",
];

export function PricingPlans() {
  const router = useRouter();
  const { data: session } = useSession();
  const [interval, setInterval] = useState<"month" | "year">("month");
  const [product, setProduct] = useState<StripeProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [billingReady, setBillingReady] = useState(true);

  useEffect(() => {
    (async () => {
      const res = await api.get<StripeProduct[]>("/api/stripe/products");
      if (res.ok && res.data && res.data.length > 0) {
        // Prefer the subscription product with both intervals
        const withRecurring = res.data.find((p) => p.prices.some((pr) => pr.interval));
        setProduct(withRecurring || res.data[0]);
        setBillingReady(true);
      } else {
        console.warn("[pricing] Stripe products unavailable:", res.error);
        setBillingReady(false);
      }
      setLoading(false);
    })();
  }, []);

  const monthly = product?.prices.find((p) => p.interval === "month");
  const yearly = product?.prices.find((p) => p.interval === "year");
  const active = interval === "month" ? monthly : yearly;

  const displayPrice = active ? (active.amount / 100).toFixed(active.amount % 100 === 0 ? 0 : 2) : interval === "month" ? "19" : "180";
  const perMonthYearly = yearly ? (yearly.amount / 1200).toFixed(2) : "15.00";

  async function handleSubscribe() {
    if (!session?.user) {
      router.push("/register?redirect=/pricing");
      return;
    }
    if (!active?.id) {
      toast.error("Billing isn't configured yet. Please add a Stripe key to enable checkout.");
      return;
    }
    setCheckoutLoading(true);
    const res = await api.post<{ url: string }>("/api/stripe/checkout", {
      priceId: active.id,
      plan: interval === "month" ? "monthly" : "yearly",
    });
    if (res.ok && res.data?.url) {
      window.location.href = res.data.url;
    } else {
      console.error("[pricing] checkout failed:", res.error);
      toast.error("Could not start checkout. Please try again.");
      setCheckoutLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      {/* Interval toggle */}
      <div className="flex justify-center">
        <div className="inline-flex items-center rounded-full border border-border/70 bg-card/60 p-1">
          <button
            onClick={() => setInterval("month")}
            className={`rounded-full px-5 py-2 text-sm font-medium transition-colors ${
              interval === "month" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setInterval("year")}
            className={`flex items-center gap-2 rounded-full px-5 py-2 text-sm font-medium transition-colors ${
              interval === "year" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Yearly
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-400">
              Save 21%
            </span>
          </button>
        </div>
      </div>

      <div className="mt-10 grid gap-6 md:grid-cols-[1fr_1.15fr]">
        {/* Free / starter context card */}
        <div className="rounded-3xl border border-border/70 bg-card/40 p-8">
          <h3 className="font-display text-xl font-semibold">Why Aurum Pro?</h3>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Aurum is a single, focused plan — no tiers, no upsells. One subscription unlocks the entire
            platform: the analytics dashboard, AI research, and your personal market assistant.
          </p>
          <div className="mt-6 space-y-3">
            {PERKS.map((perk) => (
              <div key={perk} className="flex items-start gap-3 text-sm">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
                  <Check className="size-3" />
                </span>
                {perk}
              </div>
            ))}
          </div>
        </div>

        {/* Pro plan card */}
        <div className="relative overflow-hidden rounded-3xl border border-primary/35 bg-gradient-to-b from-primary/12 to-card/60 p-8 shadow-glow">
          <div className="absolute right-6 top-6 inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary ring-1 ring-primary/25">
            <Sparkles className="size-3" /> Full access
          </div>

          <h3 className="font-display text-2xl font-bold">Aurum Pro</h3>
          <p className="mt-1.5 text-sm text-muted-foreground">Everything, for serious investors.</p>

          <div className="mt-6 flex items-end gap-2">
            {loading ? (
              <div className="h-12 w-40 animate-pulse rounded-lg bg-muted/50" />
            ) : (
              <>
                <span className="tnum font-display text-5xl font-extrabold">${displayPrice}</span>
                <span className="mb-1.5 text-muted-foreground">/ {interval === "month" ? "month" : "year"}</span>
              </>
            )}
          </div>
          {interval === "year" && !loading && (
            <p className="mt-1 text-xs text-emerald-400">
              Just ${perMonthYearly}/mo billed annually — 2 months free
            </p>
          )}

          <Button
            onClick={handleSubscribe}
            disabled={checkoutLoading || loading}
            size="lg"
            className="mt-7 h-12 w-full text-base font-semibold shadow-glow"
          >
            {checkoutLoading ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" /> Redirecting…
              </>
            ) : session?.user ? (
              "Subscribe now"
            ) : (
              "Get started"
            )}
          </Button>

          {!billingReady && (
            <p className="mt-3 text-center text-xs text-amber-400/90">
              Checkout activates once a Stripe key is added to the project.
            </p>
          )}
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Secure checkout via Stripe · Cancel anytime
          </p>
        </div>
      </div>
    </div>
  );
}
