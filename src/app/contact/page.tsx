import { EmailAddress } from "@/components/EmailAddress";
import { LegalSection, LegalShell } from "@/components/legal/LegalShell";
import { COMPANY_NUMBER, LEGAL_ENTITY_NAME, NZBN } from "@/lib/company";
import { publicPageMetadata } from "@/lib/reviewed-book";
import { CUSTOMER_EMAIL, PRIVACY_OFFICER_EMAIL } from "@/lib/public-copy";

export const metadata = publicPageMetadata("/contact", {
  title: "Contact — AetherForge AI",
  description: `Contact ${LEGAL_ENTITY_NAME}, New Zealand company number ${COMPANY_NUMBER}.`,
});

export default function ContactPage() {
  return (
    <LegalShell
      title="Contact"
      subtitle={`${LEGAL_ENTITY_NAME} is a New Zealand limited company.`}
      updated="13 Oct 2026"
    >
      <LegalSection heading="Company">
        <p>{LEGAL_ENTITY_NAME}</p>
        <p>New Zealand company number {COMPANY_NUMBER}</p>
        <p>NZBN {NZBN}</p>
      </LegalSection>
      <LegalSection heading="Email">
        <p>
          Customer email: <EmailAddress email={CUSTOMER_EMAIL} className="text-primary" />
        </p>
        <p>
          <EmailAddress email={PRIVACY_OFFICER_EMAIL} className="text-primary" />
        </p>
        <p>Privacy Officer: {PRIVACY_OFFICER_EMAIL}</p>
      </LegalSection>
    </LegalShell>
  );
}
