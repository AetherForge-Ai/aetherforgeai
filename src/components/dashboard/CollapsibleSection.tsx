"use client";

import { ReactNode, useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

/**
 * A modular dashboard "window" — a titled panel that expands/collapses with a
 * smooth height+fade animation. Used to keep the dashboard compact and scannable
 * by default: secondary/exploratory groups start collapsed and reveal their full
 * content inline on click. The category title lives here, so grouped child
 * sections keep their own specific sub-titles without duplication.
 */
export function CollapsibleSection({
  title,
  subtitle,
  icon: Icon,
  defaultOpen = false,
  badge,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ComponentType<{ className?: string }>;
  defaultOpen?: boolean;
  badge?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border border-border/60 bg-card/40 transition-colors",
        open && "border-border/80",
        className
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-card/70 sm:px-5"
      >
        {Icon && (
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
            <Icon className="size-5" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-base font-bold tracking-tight sm:text-lg">{title}</h2>
            {badge}
          </div>
          {subtitle && <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <span className="shrink-0 text-xs font-medium text-muted-foreground">
          {open ? "Hide" : "View"}
        </span>
        <ChevronDown
          className={cn(
            "size-5 shrink-0 text-muted-foreground transition-transform duration-300",
            open && "rotate-180"
          )}
        />
      </button>

      {/* Smooth height + fade animation that works with dynamic content. */}
      <div
        className={cn(
          "grid transition-all duration-300 ease-out",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="overflow-hidden">
          <div className="border-t border-border/60 p-4 sm:p-5">{children}</div>
        </div>
      </div>
    </section>
  );
}
