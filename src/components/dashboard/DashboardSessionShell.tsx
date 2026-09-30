"use client";

import { useEffect, useState } from "react";
import { DashboardSessionSkeleton } from "@/components/dashboard/AccountOwnerGuard";
import { GuestDashboardGate } from "@/components/dashboard/GuestDashboardGate";
import {
  PortfolioDashboard,
  type DashboardView,
} from "@/components/dashboard/PortfolioDashboard";
import { confirmDashboardSession } from "@/lib/auth-refresh";
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
}: {
  view: DashboardView;
  guestDocument: boolean;
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
    return <DashboardSessionSkeleton />;
  }
  return (
    <PortfolioDashboard
      view={view}
      userId={session.id}
      userName={session.greetingName}
      subscription={session.subscription}
      metalsEntitled={session.metalsEntitled}
    />
  );
}
