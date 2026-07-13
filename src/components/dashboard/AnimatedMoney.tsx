"use client";

import { useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/currency";
import type { CurrencyCode } from "@/lib/currency";
import { cn } from "@/lib/utils";

/**
 * A money figure that smoothly tweens from its previous value to the new one
 * whenever `value` changes — giving portfolio totals a live, "fluctuating"
 * feel as prices update. Purely presentational; respects reduced-motion.
 */
export function AnimatedMoney({
  value,
  currency = "NZD",
  className,
  durationMs = 650,
  compact = false,
}: {
  value: number;
  currency?: CurrencyCode;
  className?: string;
  durationMs?: number;
  compact?: boolean;
}) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;

    // Honour reduced-motion — snap straight to the value.
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      fromRef.current = to;
      setDisplay(to);
      return;
    }

    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // easeOutCubic for a natural settle
      const eased = 1 - Math.pow(1 - t, 3);
      const current = from + (to - from) * eased;
      setDisplay(current);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      fromRef.current = to; // ensure next change tweens from the latest target
    };
  }, [value, durationMs]);

  return <span className={cn("tnum tabular-nums", className)}>{formatMoney(display, currency, { compact })}</span>;
}
