import { SiteHeader } from "@/components/SiteHeader";
import { PricingPlans } from "@/components/PricingPlans";
import { DisclaimerNotice } from "@/components/legal/DisclaimerNotice";

export const metadata = {
  title: "Pricing — AetherForge AI",
  description: "Simple, transparent pricing. One plan, full access. Monthly or yearly.",
};

export default function PricingPage() {
  return (
    <div className="relative min-h-screen bg-grid">
      <div className="pointer-events-none absolute inset-0 bg-aurora" />
      <div className="relative">
        <SiteHeader />
        <section className="mx-auto max-w-7xl px-4 pb-24 pt-16 sm:px-6 sm:pt-24 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">Pricing</p>
            <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
              One plan. <span className="text-gradient">Full access.</span>
            </h1>
            <p className="mt-4 text-muted-foreground">
              Unlock the entire AetherForge AI platform — analytics, AI research, and your market assistant.
              Choose monthly flexibility or save with yearly.
            </p>
          </div>

          <div className="mt-14">
            <PricingPlans />
          </div>

          <div className="mx-auto mt-14 max-w-3xl">
            <DisclaimerNotice variant="full" />
          </div>
        </section>
      </div>
    </div>
  );
}
