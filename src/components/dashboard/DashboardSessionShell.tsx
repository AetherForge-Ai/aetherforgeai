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
 * The server render is a skeleton or the signed-out gate — never another
 * member's name, cash, or holdings baked into the HTML.
 */
export function DashboardSessionShell({
  view,
  initialSignedOut,
}: {
  view: DashboardView;
  initialSignedOut: boolean;
}) {
  const [phase, setPhase] = useState<"pending" | "guest" | "ready">(
    initialSignedOut ? "guest" : "pending"
  );
  const [session, setSession] = useState<DashboardSessionUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!initialSignedOut) setPhase("pending");
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
  }, [view, initialSignedOut]);

  if (phase === "guest" || (phase !== "ready" && initialSignedOut && !session)) {
    return <GuestDashboardGate />;
  }
  if (phase !== "ready" || !session) return <DashboardSessionSkeleton />;
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
