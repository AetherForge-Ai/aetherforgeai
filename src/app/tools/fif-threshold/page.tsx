import { FifThresholdTool } from "@/components/tools/FifThresholdTool";
import { InvestorToolShell } from "@/components/tools/InvestorToolShell";
import { ASX_EXEMPTION_CONDITIONS, FIF_IRD_SOURCES } from "@/lib/nz-investor-tools";
import { publicPageMetadata } from "@/lib/reviewed-book";

export const metadata = publicPageMetadata("/tools/fif-threshold", {
  title: "FIF NZ$50,000 threshold check — AetherForge AI",
  description:
    "Enter the total cost of your offshore shares and see whether that cost is over the NZ$50,000 FIF de minimis for an individual. No account. General information only.",
});

export default function FifThresholdPage() {
  return (
    <InvestorToolShell
      kicker="Calculators"
      title="FIF threshold check"
      lede="For an individual, the foreign investment fund (FIF) de minimis is a cost test. Type one total and read where it sits against NZ$50,000."
      sources={FIF_IRD_SOURCES}
    >
      <FifThresholdTool />
      <section className="mt-10 space-y-3 text-sm leading-relaxed">
        <h2 className="font-display text-lg font-bold">Exemptions, including ASX-listed Australian shares</h2>
        <p>
          Leave exempt interests out of the cost you enter. A common exemption is shares in an ASX-listed Australian-resident company. Inland Revenue says that exemption applies when all of these are true:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          {ASX_EXEMPTION_CONDITIONS.map((condition) => (
            <li key={condition}>{condition}</li>
          ))}
        </ul>
        <p>
          A franked dividend on the advice slip means Australian franking credits are attached. Those franking credits cannot be claimed as tax credits in New Zealand. Shares in New Zealand companies are not foreign investment funds.
        </p>
      </section>
      <section className="mt-8 space-y-3 text-sm leading-relaxed">
        <h2 className="font-display text-lg font-bold">What one number does not decide</h2>
        <p>
          The test looks at cost at any time in the income year. Going over NZ$50,000 on any day matters, even if the cost is lower on the day you use this page. The threshold is per person. IR461 splits a jointly owned holding between the owners, so two equal owners are each tested on their own share.
        </p>
        <p>
          This page is for an individual. Companies do not get this exemption. IR461 also describes an eligible trustee. An individual who is under the threshold can still choose to use the FIF rules, and IR461 explains when that choice continues in later years.
        </p>
      </section>
    </InvestorToolShell>
  );
}
