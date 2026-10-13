import { formatDisplayDateTime } from "@/lib/currency";
import type { PriceBadge } from "@/lib/price-confidence";

/** Auckland wall clock. A stamp that is already a sentence is left as written. */
export function priceUpdatedPhrase(updated: string): string {
  if (!updated || updated === "unavailable") return "last updated unavailable";
  if (updated.startsWith("Close ") || updated.startsWith("last updated ")) return updated;
  if (/^\d{4}-\d{2}-\d{2}/.test(updated)) {
    const wall = formatDisplayDateTime(updated);
    return wall === "—" ? "last updated unavailable" : `last updated ${wall}`;
  }
  return `last updated ${updated}`;
}

const DOT = {
  green: "bg-emerald-400",
  amber: "bg-amber-300",
  red: "bg-rose-400",
} as const;

/** Source, delay and last update. The why sentence shows when the print is not current. */
export function PriceConfidenceBadge({ badge }: { badge: PriceBadge }) {
  const detail = [badge.source, badge.delay, priceUpdatedPhrase(badge.updated)]
    .filter(Boolean)
    .join(". ");
  return (
    <span className="inline-flex items-center gap-1" title={badge.why || detail}>
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${DOT[badge.tone]}`} aria-hidden="true" />
      <span className="sr-only">
        {badge.tone === "green" ? "Current" : badge.tone === "amber" ? "Delayed" : "Unavailable"}. {detail}
        {badge.why ? ` ${badge.why}` : ""}
      </span>
    </span>
  );
}
