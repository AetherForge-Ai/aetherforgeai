import type { CompletenessItem } from "@/lib/tax-pack";

/** Gaps that stop a total. An empty list still says the rows that were read. */
export function TaxCompletenessList({ items }: { items: readonly CompletenessItem[] }) {
  return (
    <section className="mt-8">
      <h2 className="font-display text-lg font-semibold">Completeness</h2>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          No buys missing an exchange rate and no dividends missing a gross on the rows read for this page.
        </p>
      ) : (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {items.map((item) => (
            <li key={`${item.code}:${item.detail}`}>{item.detail}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
