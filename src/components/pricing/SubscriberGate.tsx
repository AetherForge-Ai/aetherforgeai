"use client";

/**
 * b88 (TT b87 P3): current subscribers (active, trialing, past_due) never see the trial
 * call to action on /pricing. Signed out or Free: children render as before.
 * Subscribers see Manage billing when a Stripe customer exists, and contact support otherwise.
 */
import * as React from "react";
import Link from "next/link";
import { hasLiveSubscription, paidPlanNextStep } from "@/lib/billing-guard";

export function SubscriberGate({
  children,
  initialSubscriber = false,
  hasStripeCustomer = false,
  subscriberView,
}: {
  children: React.ReactNode;
  /** b89: decided on the server from the session, so a subscriber never sees the trial copy flash. */
  initialSubscriber?: boolean;
  /** True only when this account has a Stripe customer, so Manage billing exists. */
  hasStripeCustomer?: boolean;
  /** What a subscriber sees instead. Defaults to the current-plan link (portal or contact). */
  subscriberView?: React.ReactNode;
}) {
  const [subscriber, setSubscriber] = React.useState(initialSubscriber);
  React.useEffect(() => {
    let alive = true;
    fetch("/api/account/plan", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ plan?: string; status?: string }>) : null))
      .then((j) => {
        if (alive && j && hasLiveSubscription(j)) setSubscriber(true);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  if (!subscriber) return <>{children}</>;
  if (subscriberView !== undefined) return <>{subscriberView}</>;
  const step = paidPlanNextStep(hasStripeCustomer);
  return (
    <div className="mt-8 flex justify-center" data-subscriber-gate>
      <Link href={step.href} data-billing-next={step.portal ? "portal" : "support"} className="inline-flex h-12 items-center rounded-md border border-border px-7 font-semibold">
        {step.currentLabel}
      </Link>
    </div>
  );
}
