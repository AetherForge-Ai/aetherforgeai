"use client";

import Link from "next/link";
import { CheckCircle2, Circle, Crown, Bell, LineChart, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Lightweight onboarding for new NZ$10k (or any) paper books — Headmaster →
 * first buys → alerts → Stox/Koins. Advisory only; never executes trades.
 */
export function OnboardingChecklist({
  hasCash,
  hasHoldings,
  hasAlerts,
  hasReport,
  className,
}: {
  hasCash: boolean;
  hasHoldings: boolean;
  hasAlerts?: boolean;
  hasReport?: boolean;
  className?: string;
}) {
  const steps = [
    {
      id: "headmaster",
      title: "Meet The Headmaster",
      body: "Set a target allocation for stocks, crypto, metals and cash.",
      href: "/headmaster",
      done: false, // soft — visiting is enough; we don't gate on API
      icon: Crown,
      optional: true,
    },
    {
      id: "buy",
      title: "Record your first buys",
      body: "Deposit cash if needed, then buy via the Transaction Centre — fill prices must match your broker.",
      href: "/dashboard/transactions",
      done: hasCash && hasHoldings,
      icon: ShoppingCart,
    },
    {
      id: "alerts",
      title: "Set a price alert",
      body: "Protect a holding with a hard sell-out or trim rule.",
      href: "/dashboard/stocks",
      done: !!hasAlerts,
      icon: Bell,
    },
    {
      id: "report",
      title: "Run Stox or Koins",
      body: "Generate a full market report (daily unlock at NZ midnight on paid plans).",
      href: "/dashboard/bots",
      done: !!hasReport,
      icon: LineChart,
    },
  ];

  const completed = steps.filter((s) => s.done).length;
  // Hide once the book is clearly underway.
  if (hasHoldings && hasCash && completed >= 2) return null;

  return (
    <div
      className={cn(
        "rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 via-card/60 to-transparent p-5",
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
          {completed}/{steps.length} done
        </span>
      </div>
      <ul className="mt-4 space-y-2.5">
        {steps.map((s) => {
          const Icon = s.icon;
          return (
            <li key={s.id}>
              <Link
                href={s.href}
                className={cn(
                  "flex items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors",
                  s.done
                    ? "border-emerald-500/30 bg-emerald-500/8"
                    : "border-border/60 bg-background/40 hover:border-primary/40"
                )}
              >
                {s.done ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                ) : (
                  <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                    <Icon className="size-3.5 text-primary" />
                    {s.title}
                    {s.optional && (
                      <span className="text-[0.6rem] font-medium uppercase tracking-wide text-muted-foreground">
                        optional
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{s.body}</p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
