import type { PriceBadge } from "@/lib/price-confidence";

const DOT = {
  green: "bg-emerald-400",
  amber: "bg-amber-300",
  red: "bg-rose-400",
} as const;

/** Source, delay and last update. The why sentence shows when the print is not current. */
export function PriceConfidenceBadge({ badge }: { badge: PriceBadge }) {
  const detail = [badge.source, badge.delay, badge.updated === "unavailable" ? "last updated unavailable" : `last updated ${badge.updated}`]
    .filter(Boolean)
    .join(". ");
  return (
    <span className="inline-flex items-center gap-1" title={badge.why || detail}>
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${DOT[badge.tone]}`} aria-hidden="true" />
      <span className="sr-only">
        {badge.tone}. {detail}
        {badge.why ? ` ${badge.why}` : ""}
      </span>
    </span>
  );
}
