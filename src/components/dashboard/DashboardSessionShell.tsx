"use client";

import { useEffect, useState } from "react";
import { DashboardSessionSkeleton } from "@/components/dashboard/AccountOwnerGuard";
import { GuestDashboardGate } from "@/components/dashboard/GuestDashboardGate";
import {
  PortfolioDashboard,
  type DashboardView,
} from "@/components/dashboard/PortfolioDashboard";
import { confirmDashboardSession } from "@/lib/auth-refresh";
import { prefetchDashboardBook } from "@/lib/dashboard-book-prefetch";
import { warmPublicFeeds } from "@/lib/public-feed-cache";
import type { DashboardSessionUser } from "@/lib/dashboard-session";

/**
 * The paper book mounts only after GET /api/session for a member document.
 * A guest document is the membership gate for the whole page view. It must
 * not call the session probe and then swap in a book: that probe can see a
 * cookie planted on this response, or a cached session body, and would paint
 * another member. A signed-in browser is a member document because the
 * cookie was already on the request.
 */
export function DashboardSessionShell({
  view,
  guestDocument,
  initialQuota = null,
}: {
  view: DashboardView;
  guestDocument: boolean;
  /** Goal b13 H-4: server-read report allowance, so Plan usage paints with the dashboard. */
  initialQuota?: { used: number; limit: number } | null;
}) {
  const [phase, setPhase] = useState<"pending" | "guest" | "ready">(
    guestDocument ? "guest" : "pending",
  );
  const [session, setSession] = useState<DashboardSessionUser | null>(null);

  useEffect(() => {
    if (guestDocument) {
      setSession(null);
      setPhase("guest");
      return;
    }
    let cancelled = false;
    setPhase("pending");
    setSession(null);
    warmPublicFeeds();
    prefetchDashboardBook();
    confirmDashboardSession().then((next) => {
      if (cancelled) return;
      if (!next) {
        setSession(null);
        setPhase("guest");
        return;
      }
      setSession(next);
      setPhase("ready");
    });
    return () => {
      cancelled = true;
    };
  }, [view, guestDocument]);

  if (guestDocument || phase === "guest" || !session || phase !== "ready") {
    if (guestDocument || phase === "guest") return <GuestDashboardGate />;
    // Goal b14 H-4: the server-read allowance is in the first HTML, before any client fetch.
    return (
      <>
        {initialQuota ? <ServerQuotaStrip quota={initialQuota} /> : null}
        <DashboardSessionSkeleton />
      </>
    );
  }
  return (
    <PortfolioDashboard
      view={view}
      initialQuota={initialQuota}
      userId={session.id}
      userName={session.name && !session.name.includes("@") ? session.name : session.greetingName}
      subscription={session.subscription}
      metalsEntitled={session.metalsEntitled}
    />
  );
}

/** Goal b14 H-4: Plan usage and the reports-left banner painted from the server read. */
function ServerQuotaStrip({ quota }: { quota: { used: number; limit: number } }) {
  const left = Math.max(0, quota.limit - quota.used);
  return (
    <div data-server-quota className="mx-auto mt-4 flex max-w-7xl flex-wrap gap-x-4 gap-y-1 px-4 text-sm text-foreground">
      <span data-plan-usage>Plan usage: {quota.used} of {quota.limit} AI reports used this month</span>
      <span data-reports-left-banner>{left} of {quota.limit} AI reports left</span>
    </div>
  );
}
