/**
 * One worked example of an explanation report.
 * The figures are fictional. They are not a result and not a recommendation.
 */
export function ExampleExplanationReport() {
  return (
    <section id="example-report" className="mx-auto max-w-3xl scroll-mt-24 px-4 py-12 sm:px-6 lg:px-8">
      <p className="text-sm font-semibold uppercase tracking-wider text-primary">Example</p>
      <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
        How an explanation report reads
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
        This is a labelled example of the note a report writes about two figures. The holding is
        fictional. It is not your portfolio, not a performance result, and not a recommendation.
      </p>

      <article className="mt-8 overflow-hidden rounded-3xl border border-border/70 bg-card/50">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-6 py-4">
          <p className="font-display text-sm font-bold uppercase tracking-wider text-primary">Example only</p>
          <p className="text-xs text-muted-foreground">Not a trade · not a forecast</p>
        </div>
        <div className="grid gap-px bg-border/60 sm:grid-cols-3">
          {[
            ["Holding", "EXAMPLE.NZ"],
            ["Units", "100"],
            ["Price paid", "NZ$10.00"],
          ].map(([label, value]) => (
            <div key={label} className="bg-card px-6 py-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className="mt-1 font-display text-lg font-bold">{value}</p>
            </div>
          ))}
        </div>
        <div className="space-y-4 px-6 py-6 text-sm leading-relaxed text-muted-foreground">
          <p>
            <span className="font-semibold text-foreground">Later quote on this example: NZ$10.40.</span>{" "}
            The note says the later quote is NZ$0.40 above the price paid. That is the difference
            between the two figures printed above.
          </p>
          <p>
            The note stops there. It does not tell you what to do with EXAMPLE.NZ. It does not say
            the difference will continue, and it is not a result from a portfolio.
          </p>
        </div>
      </article>
    </section>
  );
}
