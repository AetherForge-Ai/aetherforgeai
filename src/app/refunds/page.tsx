import Link from "next/link";
import { LegalShell, LegalSection } from "@/components/legal/LegalShell";
import { EmailAddress } from "@/components/EmailAddress";
import { LEGAL_ENTITY_NAME } from "@/lib/company";
import { publicPageMetadata } from "@/lib/reviewed-book";
import {
  ANNUAL_REFUND_RULE,
  CUSTOMER_EMAIL,
  LEGAL_UPDATED,
  MONTHLY_CANCEL_RULE,
  ONE_LINE_DISCLAIMER,
  PRIVACY_OFFICER_EMAIL,
} from "@/lib/public-copy";
import { pageTitle } from "@/lib/page-title";

export const metadata = publicPageMetadata("/refunds", {
  title: pageTitle("Refunds & Cancellations"),
  description: `How annual and monthly plans can be cancelled, and when ${LEGAL_ENTITY_NAME} refunds a charge.`,
});

export default function RefundsPage() {
  return (
    <LegalShell
      page="refunds"
      title="Refunds & Cancellations"
      subtitle={`These rules apply to paid plans on AetherForge AI, the trading name of ${LEGAL_ENTITY_NAME}.`}
      updated={LEGAL_UPDATED}
    >
      <LegalSection heading="1. Annual plans">
        <p>{ANNUAL_REFUND_RULE}</p>
      </LegalSection>

      <LegalSection heading="2. Monthly plans">
        <p>{MONTHLY_CANCEL_RULE}</p>
      </LegalSection>

      <LegalSection heading="3. How to cancel">
        <p>
          Cancel from{" "}
          <Link href="/settings/billing" className="text-primary hover:underline">
            Plan & billing
          </Link>{" "}
          in Settings, or through the Stripe billing portal linked there. Cancellation stops the next
          renewal. Access continues until the end of the period you have already paid for.
        </p>
      </LegalSection>

      <LegalSection heading="4. Contact">
        <p>
          Billing questions: <EmailAddress email={CUSTOMER_EMAIL} className="text-primary" />
          {" and "}
          <EmailAddress email={PRIVACY_OFFICER_EMAIL} className="text-primary" />. The same rules are in
          the{" "}
          <Link href="/terms-of-service" className="text-primary hover:underline">
            Terms
          </Link>
          .
        </p>
        <p>{ONE_LINE_DISCLAIMER}</p>
      </LegalSection>
    </LegalShell>
  );
}
