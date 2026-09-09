import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { PricingCards } from "@/components/pricing/PricingCards";
import { FeatureComparison } from "@/components/pricing/FeatureComparison";
import { PricingFAQ } from "@/components/pricing/PricingFAQ";
import { DisclaimerNotice } from "@/components/legal/DisclaimerNotice";
import { PRICING_TIERS } from "@/lib/plans";
import { Button } from "@/components/ui/button";
import {
  ShieldCheck,
  RefreshCcw,
  Lock,
  Fingerprint,
  MapPin,
  ArrowRight,
  Sparkles,
} from "lucide-react";

export const metadata = {
  title: "Pricing — AetherForge AI | Simple, powerful market intelligence",
  description:
    "Start free and upgrade when you need more power. Institutional-grade NZX, ASX and crypto insights from $0. Free, Starter, Pro and Ultimate plans — cancel anytime, secure Stripe checkout.",
  alternates: { canonical: "/pricing" },
};

const TRUST_ITEMS = [
  { icon: ShieldCheck, label: "14-day Pro trial on paid plans" },
  { icon: RefreshCcw, label: "Cancel or downgrade anytime" },
  { icon: Lock, label: "Secure payments via Stripe" },
  { icon: Fingerprint, label: "Your data stays private — bank-grade security" },
  { icon: MapPin, label: "Built in New Zealand for NZ investors" },
];

/** JSON-LD structured data so the paid tiers are eligible for rich pricing results. */
function PricingSchema() {
  const offers = PRICING_TIERS.map((t) => ({
    "@type": "Offer",
    name: `AetherForge AI — ${t.name}`,
    price: (t.monthlyPrice ?? 0).toFixed(2),
    priceCurrency: "NZD",
    category: t.subtitle,
    ...(t.monthlyPlanKey ? { availability: "https://schema.org/InStock" } : {}),
  }));

  const json = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "AetherForge AI",
    description:
      "Institutional-grade market intelligence for NZX, ASX and crypto investors — portfolio analytics, AI research reports and The Headmaster for Portfolio Planning and Strategies.",
    brand: { "@type": "Brand", name: "AetherForge AI" },
    offers: {
      "@type": "AggregateOffer",
      lowPrice: "0.00",
      highPrice: "199.00",
      priceCurrency: "NZD",
      offerCount: offers.length,
      offers,
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }}
    />
  );
}

export default function PricingPage() {
  return (
    <div className="relative min-h-screen bg-grid">
      <div className="pointer-events-none absolute inset-0 bg-aurora" />
      <PricingSchema />
      <div className="relative">
        <SiteHeader />

        {/* 1 · Hero */}
        <section className="mx-auto max-w-3xl px-4 pt-16 text-center sm:px-6 sm:pt-24 lg:px-8">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <Sparkles className="size-3.5" /> Pricing
          </div>
          <h1 className="mt-4 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
            Simple pricing. <span className="text-gradient">Powerful market intelligence.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
            Start free and upgrade when you need more power. Built for serious NZX, ASX, and crypto
            investors who want institutional-grade insights without the institutional price.
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            Cancel anytime <span className="text-primary">•</span> Secure Stripe checkout{" "}
            <span className="text-primary">•</span> No hidden fees
          </p>
        </section>

        {/* 2 + 3 · Billing toggle + pricing cards */}
        <section id="plans" className="mx-auto max-w-6xl scroll-mt-24 px-4 pt-12 sm:px-6 lg:px-8">
          <PricingCards />
        </section>

        {/* 4 · Feature comparison */}
        <section className="mx-auto max-w-6xl px-4 pt-24 sm:px-6 lg:px-8">
          <FeatureComparison />
        </section>

        {/* 5 · Trust & guarantee bar */}
        <section className="mx-auto max-w-6xl px-4 pt-20 sm:px-6 lg:px-8">
          <div className="grid gap-3 rounded-3xl border border-border/70 bg-card/40 p-6 sm:grid-cols-2 lg:grid-cols-5">
            {TRUST_ITEMS.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-3 lg:flex-col lg:text-center">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
                  <Icon className="size-5" />
                </span>
                <span className="text-sm font-medium text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* 6 · FAQ */}
        <section className="mx-auto max-w-6xl px-4 pt-24 sm:px-6 lg:px-8">
          <PricingFAQ />
        </section>

        {/* 7 · Final CTA */}
        <section className="mx-auto max-w-6xl px-4 pt-24 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl border border-primary/40 bg-gradient-to-br from-primary/15 via-card/60 to-gold/10 px-6 py-14 text-center shadow-glow sm:px-12">
            <h2 className="mx-auto max-w-2xl font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
              Ready to get institutional-grade clarity on your portfolio?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
              Join serious NZX, ASX and crypto investors using AetherForge AI. Start free in seconds —
              upgrade the moment you need more power.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-12 px-7 font-semibold">
                <Link href="/register">
                  Start Free <ArrowRight className="ml-1.5 size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 px-7 font-semibold">
                <a href="#plans">Start Pro Trial</a>
              </Button>
            </div>
          </div>
        </section>

        <div className="mx-auto mt-20 max-w-3xl px-4 pb-24 sm:px-6 lg:px-8">
          <DisclaimerNotice variant="full" />
        </div>
      </div>
    </div>
  );
}
