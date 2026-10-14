import { EmailAddress } from "@/components/EmailAddress";
import { ContactForm } from "@/components/contact/ContactForm";
import { LegalSection, LegalShell } from "@/components/legal/LegalShell";
import { COMPANY_NUMBER, LEGAL_ENTITY_NAME, NZBN } from "@/lib/company";
import { publicPageMetadata } from "@/lib/reviewed-book";
import { CONTACT_PAGE_EMAIL } from "@/lib/public-copy";

export const metadata = publicPageMetadata("/contact", {
  title: "Contact — AetherForge AI",
  description: `Contact ${LEGAL_ENTITY_NAME}, New Zealand company number ${COMPANY_NUMBER}.`,
});

export default function ContactPage() {
  return (
    <LegalShell
      title="Contact"
      subtitle={`${LEGAL_ENTITY_NAME} is a New Zealand limited company.`}
      updated="15 Oct 2026"
    >
      <LegalSection heading="Send us a message">
        <p>
          Use the form below, or email <EmailAddress email={CONTACT_PAGE_EMAIL} className="text-primary" />. We reply by
          email. For a privacy request, mark your message for the Privacy Officer.
        </p>
        <ContactForm />
      </LegalSection>
      <LegalSection heading="Company">
        <p>{LEGAL_ENTITY_NAME}</p>
        <p>New Zealand company number {COMPANY_NUMBER}</p>
        <p>NZBN {NZBN}</p>
      </LegalSection>
    </LegalShell>
  );
}
