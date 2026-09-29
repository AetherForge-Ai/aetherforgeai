"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { OnboardingChecklist } from "@/components/dashboard/OnboardingChecklist";

/**
 * /onboarding — same checklist as the dashboard, always visible so a deep
 * link can be checked after login (including a finished book).
 */
export function OnboardingPageClient() {
  const [ready, setReady] = useState(false);
  const [hasCash, setHasCash] = useState(false);
  const [hasHoldings, setHasHoldings] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [stocks, ledger] = await Promise.all([
        api.get<unknown[]>("/api/stocks"),
        api.get<{ cashBalance?: number }>("/api/transactions"),
      ]);
      if (cancelled) return;
      setHasHoldings(!!(stocks.ok && Array.isArray(stocks.data) && stocks.data.length > 0));
      setHasCash(typeof ledger.data?.cashBalance === "number" && ledger.data.cashBalance > 0);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-2 py-6 sm:px-4">
      <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Onboarding</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Three steps for a new paper book. The Headmaster visit is optional and is not part of the count.
      </p>
      <div className="mt-6">
        {ready ? (
          <OnboardingChecklist hasCash={hasCash} hasHoldings={hasHoldings} alwaysShow />
        ) : (
          <p className="text-sm text-muted-foreground">Loading your checklist…</p>
        )}
      </div>
    </div>
  );
}
