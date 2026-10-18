"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { TransactionsTab } from "@/components/dashboard/TransactionsTab";
import { FIXTURE_500_LABEL, fixture500Snapshot } from "@/lib/fixture-500";

/** Goal b18 H-4: dashboard ledger with 500 synthetic rows. Read-only; nothing is saved. */
export default function Fixture500Client() {
  const [t0] = useState(() => (typeof performance !== "undefined" ? performance.now() : 0));
  const snapshot = useMemo(() => fixture500Snapshot(), []);
  // b37 H-4: the build time is measured after hydration only. Rendering performance.now() on the
  // server and again on the client gave different text, which was React error #418.
  const [buildMs, setBuildMs] = useState<number | null>(null);
  useEffect(() => {
    setBuildMs(Math.round(performance.now() - t0));
  }, [t0]);
  const say = () => toast.message("Example data: nothing is saved.");
  return (
    <main className="mx-auto max-w-6xl space-y-4 p-6" data-fixture-500>
      <div role="note" className="rounded-md border border-amber-400 bg-amber-50 p-3 text-sm font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-100">
        {FIXTURE_500_LABEL}
      </div>
      <p className="text-sm text-muted-foreground">
        Net worth {snapshot.kpis.netWorth.display} · cash {snapshot.kpis.cash.display} · {snapshot.ledger.length} ledger rows ·
        built in <span data-build-ms>{buildMs ?? "…"}</span> ms
      </p>
      <TransactionsTab snapshot={snapshot} loading={false} onRecord={say} onEdit={say} onDeleteDividend={() => { say(); return false; }} />
    </main>
  );
}
