"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, Crown, Bell, LineChart, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { onboardingProgress, type OnboardingStepId } from "@/lib/onboarding-steps";
import { isStoxOrKoinsRun } from "@/lib/report-body";
import { Wallet } from "lucide-react";

/**
 * Lightweight onboarding for new NZ$10k (or any) paper books — Headmaster →
 * first buys → alerts → Stox/Koins. Advisory only; never executes trades.
 *
 * The fraction matches the steps on the card. A buy tick needs a buy on the
 * ledger. A Stox or Koins run ticks the report step. The card stays up until
 * the required steps are done, unless `alwaysShow` (the /onboarding page).
 */
const COPY: Record<
  OnboardingStepId,
  { title: string; body: string; href: string; icon: typeof Crown }
> = {
  headmaster: {
    title: "Meet The Headmaster",
    body: "Set a target allocation for stocks, crypto, metals and cash. Record paper gold or silver from Add.",
    href: "/headmaster",
    icon: Crown,
  },
  holding: {
    title: "Add your first holding",
    body: "Add your holdings or cash.",
    href: "/dashboard/transactions",
    icon: Wallet,
  },
  buy: {
    title: "Record your first buys",
    body: "A buy on the ledger ticks this. A deposit is cash, not a buy.",
    href: "/dashboard/transactions",
    icon: ShoppingCart,
  },
  alerts: {
    title: "Set a price alert",
    body: "Protect a holding with a full-exit level or trim rule.",
    href: "/dashboard/stocks",
    icon: Bell,
  },
  report: {
    title: "Run Stox or Koins",
    body: "Generate a full market report (paid plans can refresh every 4 hours).",
    href: "/dashboard/bots",
    icon: LineChart,
  },
};

export function OnboardingChecklist({
  hasCash,
  hasHoldings,
  hasBuy = false,
  hasAlerts,
  hasReport,
  alwaysShow = false,
  className,
  plan = null,
  deferProbe = false,
  probeError = false,
  onProbeRetry,
}: {
  hasCash: boolean;
  hasHoldings: boolean;
  /** True only when the ledger has a buy. */
  hasBuy?: boolean;
  hasAlerts?: boolean;
  hasReport?: boolean;
  /** Dedicated /onboarding route — keep the list even after the book is finished. */
  alwaysShow?: boolean;
  className?: string;
  plan?: string | null;
  /** The dashboard already asked for alerts and reports. Do not fetch them again. */
  deferProbe?: boolean;
  probeError?: boolean;
  onProbeRetry?: () => void;
}) {
  const [alertsDone, setAlertsDone] = useState<boolean | null>(
    hasAlerts === undefined ? null : !!hasAlerts
  );
  const [reportDone, setReportDone] = useState<boolean | null>(
    hasReport === undefined ? null : !!hasReport
  );
  const [probeFailed, setProbeFailed] = useState(false);
  const [probeNonce, setProbeNonce] = useState(0);

  useEffect(() => {
    if (hasAlerts !== undefined) setAlertsDone(!!hasAlerts);
  }, [hasAlerts]);

  useEffect(() => {
    if (hasReport !== undefined) setReportDone(!!hasReport);
  }, [hasReport]);

  useEffect(() => {
    if (deferProbe) return;
    if (hasAlerts !== undefined && hasReport !== undefined) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!cancelled) setProbeFailed(true);
    }, 8_000);
    (async () => {
      let alertsOk = hasAlerts !== undefined;
      let reportsOk = hasReport !== undefined;
      if (hasAlerts === undefined) {
        const res = await api.get<unknown[]>("/api/alerts");
        alertsOk = !!(res.ok && Array.isArray(res.data));
        if (!cancelled && alertsOk) setAlertsDone(res.data!.length > 0);
      }
      if (hasReport === undefined) {
        const res = await api.get<{ reports?: { bot?: string; executiveSummary?: string; textBody?: string; payload?: unknown }[] }>("/api/reports");
        const reports = res.data?.reports;
        reportsOk = !!(res.ok && Array.isArray(reports));
        const ran = Array.isArray(reports) && reports.some((row) => isStoxOrKoinsRun(row));
        if (!cancelled && reportsOk) setReportDone(ran);
      }
      window.clearTimeout(timer);
      if (!cancelled && (!alertsOk || !reportsOk)) setProbeFailed(true);
      if (!cancelled && alertsOk && reportsOk) setProbeFailed(false);
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [hasAlerts, hasReport, deferProbe, probeNonce]);

  const failed = probeError || probeFailed;
  const probing = !failed && (alertsDone === null || reportDone === null);
  const progress = onboardingProgress({
    hasHoldings,
    hasCash,
    hasBuy,
    hasAlerts: !!alertsDone,
    hasReport: !!reportDone,
    plan,
  });

  if (failed) {
    return (
      <div
        id="onboarding"
        className={cn(
          "scroll-mt-24 rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 via-card/60 to-transparent p-5",
          className
        )}
      >
        <h3 className="font-display text-lg font-bold">Get started · NZ paper book</h3>
        <p className="mt-1 text-xs text-muted-foreground">Alerts and reports could not be checked.</p>
        <button
          type="button"
          className="mt-3 rounded-lg border border-border/70 px-3 py-1.5 text-xs font-semibold"
          onClick={() => {
            setProbeFailed(false);
            setProbeNonce((n) => n + 1);
            onProbeRetry?.();
          }}
        >
          Try again
        </button>
      </div>
    );
  }

  if (probing) {
    return (
      <div
        id="onboarding"
        aria-busy="true"
        className={cn(
          "scroll-mt-24 rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 via-card/60 to-transparent p-5",
          className
        )}
      >
        <h3 className="font-display text-lg font-bold">Get started · NZ paper book</h3>
        <div className="mt-3 space-y-2" aria-hidden>
          <div className="h-12 animate-pulse rounded-xl bg-muted/50 motion-reduce:animate-none" />
          <div className="h-12 animate-pulse rounded-xl bg-muted/40 motion-reduce:animate-none" />
          <div className="h-12 animate-pulse rounded-xl bg-muted/40 motion-reduce:animate-none" />
        </div>
      </div>
    );
  }

  if (!alwaysShow && progress.finished) return null;

  return (
    <div
      id="onboarding"
      className={cn(
        "scroll-mt-24 rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 via-card/60 to-transparent p-5",
        className
      )}
    >
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="font-display text-lg font-bold">Get started · NZ paper book</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            A short path for new desks — educational only, not personalised advice.
          </p>
        </div>
        <span className="rounded-full border border-border/60 bg-background/50 px-2.5 py-1 text-[0.65rem] font-semibold text-muted-foreground">
          {progress.completed}/{progress.total} done
        </span>
      </div>
      <ul className="mt-4 space-y-2.5">
        {progress.steps.map((step) => {
          const copy = COPY[step.id];
          const Icon = copy.icon;
          const done = step.done;
          return (
            <li key={step.id}>
              <Link
                href={copy.href}
                className={cn(
                  "flex items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors",
                  done
                    ? "border-emerald-500/30 bg-emerald-500/8"
                    : "border-border/60 bg-background/40 hover:border-primary/40"
                )}
              >
                {done ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                ) : (
                  <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                    <Icon className="size-3.5 text-primary" />
                    {copy.title}
                    {step.optional && (
                      <span className="text-[0.6rem] font-medium uppercase tracking-wide text-muted-foreground">
                        optional
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{copy.body}</p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
