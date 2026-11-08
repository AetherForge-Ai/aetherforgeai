"use client";

/**
 * b88 (TT b87 P3): current subscribers (active, trialing, past_due) never see trial or buy buttons
 * on /pricing. Signed out or Free: children render as before. Subscribers see Manage billing instead.
 */
import * as React from "react";
import Link from "next/link";
import { hasLiveSubscription } from "@/lib/billing-guard";

export function SubscriberGate({
  children,
  initialSubscriber = false,
  subscriberView,
}: {
  children: React.ReactNode;
  /** b89: decided on the server from the session, so a subscriber never sees the trial copy flash. */
  initialSubscriber?: boolean;
  /** What a subscriber sees instead. Defaults to the Manage billing link. */
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
  return (
    <div className="mt-8 flex justify-center" data-subscriber-gate>
      <Link href="/settings/billing" className="inline-flex h-12 items-center rounded-md border border-border px-7 font-semibold">
        Current plan · Manage billing
      </Link>
    </div>
  );
}
