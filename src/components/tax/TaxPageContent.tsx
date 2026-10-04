/**
 * General information for a paper portfolio. Figures that are not on the
 * linked Inland Revenue pages are left out.
 */

const SOURCES = [
  {
    href: "https://www.ird.govt.nz/cryptoassets",
    label: "Inland Revenue — Cryptoassets",
  },
  {
    href: "https://www.ird.govt.nz/cryptoassets/individual/buying-selling/acquiring-sell-exchange",
    label: "Inland Revenue — Acquiring, selling and exchanging cryptoassets",
  },
  {
    href: "https://www.ird.govt.nz/cryptoassets/taxing",
    label: "Inland Revenue — Taxing cryptoassets",
  },
  {
    href: "https://www.ird.govt.nz/income-tax/income-tax-for-individuals/types-of-individual-income/share-investments",
    label: "Inland Revenue — Share investments",
  },
] as const;

export function TaxPageContent() {
  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-primary">New Zealand</p>
      <h1 className="mt-2 font-display text-3xl font-bold">TAX</h1>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        This page is general information about New Zealand tax for a paper portfolio kept in
        AetherForge. It is not personal tax advice, and it is not an Inland Revenue assessment.
        Rates, dates, and thresholds that are not stated on the Inland Revenue pages linked below
        are left out. Check Inland Revenue for those figures, and for anything about your own
        circumstances.
      </p>

      <section className="mt-8 space-y-3">
        <h2 className="font-display text-lg font-semibold">What a paper portfolio is</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          A paper portfolio in this app is a record you keep: buys, sells, dividends, and tax lines.
          Recording a line does not send an order to an exchange and does not file a return. Whether
          a real acquisition, disposal, dividend, or cryptoasset activity is taxable is for you and
          Inland Revenue.
        </p>
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
          <li>Record a buy or a sell in the transaction ledger. That entry is a paper record.</li>
          <li>Record a dividend when cash should increase by that amount. The holding quantity does not change.</li>
          <li>Record a tax line when cash should reduce by that amount. The holding quantity does not change.</li>
          <li>Use the linked Inland Revenue pages when you work out what, if anything, belongs on a return.</li>
        </ol>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="font-display text-lg font-semibold">Cryptoassets</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Inland Revenue treats cryptoassets as property. The tax outcome depends on the
          characteristics of the cryptoasset and how it is used, not on the name. Cryptoassets are
          not subject to GST when bought or sold. GST can apply when cryptoassets are received as
          payment for a normal business. Cryptoassets are excepted financial arrangements, except
          those that are economically equivalent to debt. If they are trading stock, they are valued
          at cost at year end. File an IR3 when there is taxable cryptoasset income.
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          If cryptoassets were acquired for the purpose of disposing of them, the profit is income
          and is subject to income tax. A loss may be claimable where a profit on that disposal
          would have been taxable. The activity may still be taxable under a profit-making scheme
          even if disposal was not the main purpose.
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Inland Revenue&apos;s taxing guidance is to file an IR3, calculate the New Zealand dollar
          value, and work out income and expenses. Other rules apply if the cryptoassets are
          trading stock. This page does not set a rate, a date, or a threshold. Check Inland Revenue.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="font-display text-lg font-semibold">Shares and dividends</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Dividends, including foreign dividends, are taxable. New Zealand companies generally
          withhold tax, and those amounts go into the assessment on the IR3 — check them. Foreign
          dividends must be paid in New Zealand and self-reported on an IR1261 if they are not
          already in the IR3. Check Inland Revenue for any figure this page does not state.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="font-display text-lg font-semibold">Inland Revenue pages used</h2>
        <ul className="space-y-2 text-sm">
          {SOURCES.map((source) => (
            <li key={source.href}>
              <a href={source.href} className="text-primary underline-offset-4 hover:underline" rel="noreferrer">
                {source.label}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
