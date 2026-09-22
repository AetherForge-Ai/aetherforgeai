"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/currency";
import { Compass, Save } from "lucide-react";
import { toast } from "sonner";

export type AllocSlice = { key: string; label: string; valueNZD: number; targetPct: number };

const DEFAULT_TARGETS: { key: string; label: string; targetPct: number }[] = [
  { key: "stock", label: "Stocks", targetPct: 55 },
  { key: "crypto", label: "Crypto", targetPct: 20 },
  { key: "metals", label: "Metals", targetPct: 15 },
  { key: "cash", label: "Cash", targetPct: 10 },
];

/**
 * Live allocation vs Headmaster-style targets with advisory rebalance ideas.
 * Suggestions are never fills — "Save as idea" only.
 */
export function AllocationDriftCard({
  stockNZD,
  cryptoNZD,
  metalsNZD,
  cashNZD,
  targets,
  className,
}: {
  stockNZD: number;
  cryptoNZD: number;
  metalsNZD: number;
  cashNZD: number;
  /** Optional Headmaster targets; falls back to 55/20/15/10. */
  targets?: { key: string; targetPct: number; label?: string }[];
  className?: string;
}) {
  const [savedIdeas, setSavedIdeas] = useState<string[]>([]);

  const rows = useMemo(() => {
    const total = Math.max(0, stockNZD + cryptoNZD + metalsNZD + cashNZD);
    const vals: Record<string, number> = {
      stock: stockNZD,
      crypto: cryptoNZD,
      metals: metalsNZD,
      cash: cashNZD,
    };
    const tg = targets?.length
      ? targets.map((t) => ({
          key: t.key,
          label: t.label || DEFAULT_TARGETS.find((d) => d.key === t.key)?.label || t.key,
          targetPct: t.targetPct,
        }))
      : DEFAULT_TARGETS;
    return tg.map((t) => {
      const valueNZD = vals[t.key] ?? 0;
      const actualPct = total > 0 ? (valueNZD / total) * 100 : 0;
      const drift = actualPct - t.targetPct;
      const targetValue = total > 0 ? (total * t.targetPct) / 100 : 0;
      const deltaNZD = targetValue - valueNZD;
      return { ...t, valueNZD, actualPct, drift, deltaNZD, total };
    });
  }, [stockNZD, cryptoNZD, metalsNZD, cashNZD, targets]);

  const ideas = rows
    .filter((r) => Math.abs(r.deltaNZD) >= 25)
    .map((r) =>
      r.deltaNZD > 0
        ? `Add ~${formatMoney(r.deltaNZD, "NZD")} to ${r.label}`
        : `Trim ~${formatMoney(Math.abs(r.deltaNZD), "NZD")} from ${r.label}`
    );

  function saveIdeas() {
    if (!ideas.length) {
      toast.message("Book is already close to target — no rebalance idea needed.");
      return;
    }
    const line = ideas.join(" · ");
    setSavedIdeas((prev) => [line, ...prev].slice(0, 5));
    try {
      sessionStorage.setItem("af.rebalanceIdeas", JSON.stringify([line, ...savedIdeas].slice(0, 5)));
    } catch {
      /* ignore */
    }
    toast.success("Rebalance idea saved — advisory only, not a fill.");
  }

  const total = rows[0]?.total ?? 0;
  if (total <= 0) {
    return (
      <div className={cn("rounded-2xl border border-dashed border-border/60 p-5 text-sm text-muted-foreground", className)}>
        <p className="font-semibold text-foreground">Allocation vs strategy</p>
        <p className="mt-1">Deposit cash or add holdings to see live drift against Headmaster targets.</p>
      </div>
    );
  }

  return (
    <div className={cn("rounded-2xl border border-border/60 bg-card/50 p-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-display text-lg font-bold">
            <Compass className="size-4 text-primary" /> Allocation vs strategy
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Live drift vs {targets?.length ? "Headmaster" : "default 55/20/15/10"} targets · advisory only
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/headmaster">Open Headmaster</Link>
        </Button>
      </div>

      <ul className="mt-4 space-y-2.5">
        {rows.map((r) => (
          <li key={r.key}>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{r.label}</span>
              <span className="tnum text-xs text-muted-foreground">
                {r.actualPct.toFixed(0)}% vs {r.targetPct}% target
                <span
                  className={cn(
                    "ml-2 font-semibold",
                    Math.abs(r.drift) < 2 ? "text-emerald-600" : r.drift > 0 ? "text-amber-600" : "text-sky-600"
                  )}
                >
                  {r.drift >= 0 ? "+" : ""}
                  {r.drift.toFixed(1)}pp
                </span>
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted/60">
              <div
                className="h-full rounded-full bg-primary/80 transition-all"
                style={{ width: `${Math.min(100, Math.max(0, r.actualPct))}%` }}
              />
            </div>
          </li>
        ))}
      </ul>

      {ideas.length > 0 && (
        <div className="mt-4 rounded-xl border border-border/50 bg-background/40 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            One-click rebalance suggestions
          </p>
          <ul className="mt-1.5 space-y-1 text-sm">
            {ideas.map((idea) => (
              <li key={idea} className="text-foreground/90">
                · {idea}
              </li>
            ))}
          </ul>
          <Button size="sm" variant="secondary" className="mt-3" onClick={saveIdeas}>
            <Save className="mr-1.5 size-3.5" /> Save as idea
          </Button>
          <p className="mt-2 text-[0.65rem] text-muted-foreground">
            Ideas are not fills. Record broker fills in the Transaction Centre when you act.
          </p>
        </div>
      )}

      {savedIdeas.length > 0 && (
        <div className="mt-3 text-[0.7rem] text-muted-foreground">
          Saved: {savedIdeas[0]}
        </div>
      )}
    </div>
  );
}
