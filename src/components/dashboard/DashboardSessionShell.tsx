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
 * The paper book mounts only after GET /api/session for this browser.
 * A guest document server-renders the membership gate. A member document
 * server-renders a skeleton. Neither one includes a name or a holding.
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
    let cancelled = false;
    if (!guestDocument) {
      setPhase("pending");
      setSession(null);
    }
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

  if (phase !== "ready" || !session) {
    if (phase === "guest") return <GuestDashboardGate />;
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
