"use client";

import { useEffect, useState } from "react";
import { DashboardSessionSkeleton } from "@/components/dashboard/AccountOwnerGuard";
import { GuestDashboardGate } from "@/components/dashboard/GuestDashboardGate";
import { NzsxMarketBoard } from "@/components/markets/NzsxMarketBoard";
import { confirmDashboardSession } from "@/lib/auth-refresh";

/**
 * Member documents wait for this browser's session, then show the NZSX board.
 * Guest documents stay on the membership gate.
 */
export function NzsxMarketPage({ guestDocument }: { guestDocument: boolean }) {
  const [phase, setPhase] = useState<"pending" | "guest" | "ready">(guestDocument ? "guest" : "pending");

  useEffect(() => {
    if (guestDocument) {
      setPhase("guest");
      return;
    }
    let cancelled = false;
    setPhase("pending");
    confirmDashboardSession().then((next) => {
      if (cancelled) return;
      setPhase(next ? "ready" : "guest");
    });
    return () => {
      cancelled = true;
    };
  }, [guestDocument]);

  if (guestDocument || phase === "guest") return <GuestDashboardGate />;
  if (phase !== "ready") return <DashboardSessionSkeleton />;
  return <NzsxMarketBoard />;
}
