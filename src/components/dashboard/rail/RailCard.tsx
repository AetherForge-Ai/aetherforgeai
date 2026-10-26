import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * One card system for the dashboard right column (TT D1): 16px radius, 20px padding,
 * a 16px semibold h2, and an optional control in the header (D4: no floating toggles).
 * Solid card background so light and dark themes read the same (D9), and scroll-mt so
 * the sticky header never covers a card reached by anchor (D8).
 */
/** Emerald-700 with white text: 5.5:1, so small text clears WCAG AA 4.5:1 (emerald-600 is 3.8:1). */
export const RAIL_ACCENT_CLASS = "bg-[#047857] text-white";

export const RAIL_CARD_CLASS =
  "shadow-soft relative scroll-mt-24 rounded-2xl border border-border/70 bg-card p-5 text-card-foreground max-sm:z-40";

export function RailCard({
  id,
  title,
  description,
  action,
  children,
  className,
}: {
  id?: string;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const headingId = id ? `${id}-heading` : undefined;
  return (
    <section id={id} aria-labelledby={headingId} className={cn(RAIL_CARD_CLASS, className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={headingId} className="text-base font-semibold leading-6">
            {title}
          </h2>
          {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}

/** Two-option segmented control used inside a card header (Shares / Crypto). */
export function RailTabs<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly { id: T; label: string }[];
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <div className="inline-flex rounded-lg border border-border/70 p-0.5" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "min-h-11 rounded-md px-2.5 text-xs md:min-h-8 font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
            value === o.id ? RAIL_ACCENT_CLASS : "text-foreground/80 hover:bg-muted"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
