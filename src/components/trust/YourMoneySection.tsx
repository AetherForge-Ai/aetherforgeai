import {
  TRUST_MONEY_HEADING,
  TRUST_MONEY_SECTIONS,
} from "@/lib/trust-money";

/**
 * Server-rendered block on /trust. Copy lives in trust-money.ts so each
 * sentence can be checked against an existing statement or the import code.
 */
export function YourMoneySection() {
  return (
    <section id="your-money" aria-labelledby="your-money-heading" className="mt-8 space-y-3">
      <h2 id="your-money-heading" className="font-display text-lg font-bold">
        {TRUST_MONEY_HEADING}
      </h2>
      {TRUST_MONEY_SECTIONS.map((section) => (
        <div key={section.id} className="space-y-1">
          <h3 id={section.id} className="text-sm font-semibold text-foreground">
            {section.heading}
          </h3>
          <p className="text-sm leading-relaxed text-muted-foreground">{section.body}</p>
        </div>
      ))}
    </section>
  );
}
