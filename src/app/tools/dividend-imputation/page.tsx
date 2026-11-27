import { DividendImputationTool } from "@/components/tools/DividendImputationTool";
import { InvestorToolShell } from "@/components/tools/InvestorToolShell";
import { DIVIDEND_IRD_SOURCES, INDIVIDUAL_MARGINAL_RATES } from "@/lib/nz-investor-tools";
import { publicPageMetadata } from "@/lib/reviewed-book";

export const metadata = publicPageMetadata("/tools/dividend-imputation", {
  title: "Dividend and imputation illustration — AetherForge AI",
  description:
    "Cash dividend plus imputation credits at the 28% company rate, maximum ratio 28/72, and the top-up or unused credit at an individual marginal rate. No account.",
});

export default function DividendImputationPage() {
  return (
    <InvestorToolShell
      kicker="Calculators"
      title="Dividend and imputation illustration"
      lede="See a fully imputed dividend at the 28% company tax rate, then compare the imputation credit with tax at one individual marginal rate."
      sources={DIVIDEND_IRD_SOURCES}
    >
      <section className="mt-8 space-y-3 text-sm leading-relaxed">
        <h2 className="font-display text-lg font-bold">The 28:72 maximum</h2>
        <p>
          Inland Revenue says most companies pay 28% income tax. A company can attach up to 28 cents of imputation credit to each $1 of gross dividend. That maximum is written 28:72: 28 cents of credit for each 72 cents of cash dividend. The same ratio is 38.89 cents of credit for each $1 of net profit. This page uses 28/72 and rounds the credit to the nearest cent.
        </p>
        <p>
          Inland Revenue&apos;s imputation guide works an example the other way around. Company profit $1,000, tax at 28% $280, profit left to distribute $720. With the maximum credit attached, the shareholder&apos;s taxable amount is $1,000. Tax at 33% is $330, less the $280 credit, so $50 of tax remains on that dividend.
        </p>
        <p>
          A company can attach less than the maximum, or nothing. This illustration always uses the maximum. It does not subtract resident withholding tax a company may have deducted from the cash you were paid.
        </p>
      </section>
      <DividendImputationTool />
      <section className="mt-10 space-y-3 text-sm leading-relaxed">
        <h2 className="font-display text-lg font-bold">Individual rates from 1 April 2025</h2>
        <p>These are the rates Inland Revenue publishes for each dollar of individual income from 1 April 2025.</p>
        <ul className="list-disc space-y-2 pl-5">
          {INDIVIDUAL_MARGINAL_RATES.map((rate) => (
            <li key={rate.id}>
              {rate.label} ({rate.band})
            </li>
          ))}
        </ul>
        <p>
          If the credit on this dividend is larger than tax at the rate you choose, the difference is unused credit on this dividend, not a cash refund. IR3G says excess imputation credits are not refundable. They are claimed against tax payable, and any amount still unused is carried forward.
        </p>
      </section>
    </InvestorToolShell>
  );
}
