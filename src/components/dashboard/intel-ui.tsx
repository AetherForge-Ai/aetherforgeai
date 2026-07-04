import { cn } from "@/lib/utils";
import type { SecurityIntel } from "@/lib/market-intel";

/** Colour class for a signed percentage. */
export function pctClass(v: number): string {
  return v > 0 ? "text-emerald-400" : v < 0 ? "text-rose-400" : "text-muted-foreground";
}

export function fmtPct(v: number): string {
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

const SIGNAL_STYLES: Record<SecurityIntel["signal"], string> = {
  "Strong Buy": "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  Buy: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  Hold: "bg-amber-500/12 text-amber-300 border-amber-500/25",
  Reduce: "bg-orange-500/12 text-orange-300 border-orange-500/25",
  Sell: "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

export function SignalBadge({ signal, className }: { signal: SecurityIntel["signal"]; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold",
        SIGNAL_STYLES[signal],
        className
      )}
    >
      {signal}
    </span>
  );
}

/** Market chip (NZX / ASX / US). */
export function MarketChip({ market }: { market: SecurityIntel["market"] }) {
  return (
    <span className="rounded bg-primary/12 px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-primary">
      {market}
    </span>
  );
}
