import { LegalShell, LegalSection } from "@/components/legal/LegalShell";

export const metadata = {
  title: "Terms & Conditions — AetherForge AI",
  description:
    "The terms and conditions governing your use of AetherForge AI, a New Zealand–owned market-intelligence service.",
};

const UPDATED = "2 July 2026";

export default function TermsOfService() {
  return (
    <LegalShell
      title="Terms & Conditions"
      subtitle="These Terms & Conditions govern your access to and use of AetherForge AI. AetherForge AI is a New Zealand–owned and operated service, and these terms are governed by New Zealand law, including the Consumer Guarantees Act 1993, the Fair Trading Act 1986 and the Contract and Commercial Law Act 2017."
      updated={UPDATED}
    >
      <LegalSection heading="1. Agreement to these terms">
        <p>
          By creating an account or otherwise accessing or using AetherForge AI (the &quot;Service&quot;)
          at www.aetherforgeai.co.nz, you agree to be bound by these Terms &amp; Conditions. If you do
          not agree, you must not use the Service. If you are using the Service on behalf of an
          organisation, you confirm you have authority to bind that organisation.
        </p>
      </LegalSection>

      <LegalSection heading="2. The service we provide">
        <p>
          AetherForge AI provides AI-generated market intelligence, portfolio-monitoring tools, data
          tables, charts and related informational content covering New Zealand (NZX), Australian (ASX)
          and global markets, including digital assets. Features available to you depend on your
          subscription plan.
        </p>
        <p>
          <strong className="text-foreground/90">
            The Service provides general information only and does not constitute financial,
            investment, legal, tax or accounting advice.
          </strong>{" "}
          Please read our{" "}
          <a href="/ai-disclaimer" className="text-primary hover:underline">
            AI Disclaimer
          </a>{" "}
          carefully — it forms part of these terms.
        </p>
      </LegalSection>

      <LegalSection heading="3. Eligibility">
        <p>
          You must be at least 18 years old and able to form a legally binding contract to use the
          Service. By using AetherForge AI you confirm that you meet these requirements.
        </p>
      </LegalSection>

      <LegalSection heading="4. Your account">
        <p>To access certain features you must register for an account. You agree to:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>provide accurate, current and complete information;</li>
          <li>keep your login credentials secure and confidential;</li>
          <li>accept responsibility for all activity that occurs under your account; and</li>
          <li>notify us promptly of any unauthorised use of your account.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="5. Subscriptions, billing & payment">
        <p>
          Paid features are offered on weekly, monthly and yearly subscription plans. Prices are shown
          on our pricing page and are stated in the applicable currency. Payments are processed securely
          by Stripe; by subscribing you authorise us (through Stripe) to charge your chosen payment
          method on a recurring basis until you cancel.
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Subscriptions renew automatically at the end of each billing period unless cancelled.</li>
          <li>You may cancel at any time; cancellation takes effect at the end of the current paid period.</li>
          <li>
            We may change plan features or pricing on reasonable notice; changes will not affect the
            period you have already paid for.
          </li>
        </ul>
        <p>
          Because the Service is a digital product supplied and accessed immediately, subscription fees
          are generally non-refundable except where a refund is required by the Consumer Guarantees Act
          1993 or other New Zealand law. Nothing in these terms limits your rights under that Act.
        </p>
      </LegalSection>

      <LegalSection heading="6. Annual member toolkit">
        <p>
          Customers on an annual plan may download our professional Excel investor toolkit (Portfolio
          Tracker and Transactions spreadsheets). These files are provided for your own personal
          record-keeping. You may use and modify them for your own purposes but must not resell or
          redistribute them. The figures they contain reflect the data you enter and are your
          responsibility.
        </p>
      </LegalSection>

      <LegalSection heading="7. Acceptable use">
        <p>You agree to use the Service lawfully and not to:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>breach any applicable law or regulation, including New Zealand financial markets law;</li>
          <li>attempt to gain unauthorised access to the Service or other users&apos; data;</li>
          <li>introduce viruses or malicious code, or interfere with or disrupt the Service;</li>
          <li>scrape, resell, or redistribute our content or reports without our written consent;</li>
          <li>misrepresent your identity or your affiliation with any person or entity; or</li>
          <li>use the Service to provide regulated financial advice to third parties.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="8. Intellectual property">
        <p>
          The Service and all of its content, software, branding and AI-generated outputs (excluding
          your own data) are owned by AetherForge AI or its licensors and are protected by New Zealand
          and international intellectual-property laws. We grant you a limited, non-exclusive,
          non-transferable licence to use the Service for your own personal or internal business
          purposes. You retain ownership of the portfolio data you input, and grant us a licence to use
          it solely to provide the Service to you.
        </p>
      </LegalSection>

      <LegalSection heading="9. Consumer guarantees & fair trading">
        <p>
          Where you acquire the Service as a consumer, the Consumer Guarantees Act 1993 provides
          guarantees that cannot be excluded, including that services will be provided with reasonable
          care and skill. Nothing in these terms is intended to limit or exclude those guarantees, or to
          mislead you in a way that would breach the Fair Trading Act 1986.
        </p>
        <p>
          If you acquire the Service for the purposes of a business, you agree that the Consumer
          Guarantees Act does not apply, to the extent permitted by section 43 of that Act.
        </p>
      </LegalSection>

      <LegalSection heading="10. Disclaimers">
        <p>
          To the fullest extent permitted by law and subject to the guarantees described in section 9,
          the Service is provided on an &quot;as is&quot; and &quot;as available&quot; basis. We do not
          warrant that the Service, its AI-generated analysis, or any market data will be accurate,
          complete, uninterrupted, error-free or fit for any particular investment purpose. Market data
          may be delayed, simulated or estimated. You are solely responsible for any decisions you make.
        </p>
      </LegalSection>

      <LegalSection heading="11. Limitation of liability">
        <p>
          To the maximum extent permitted by New Zealand law, AetherForge AI will not be liable for any
          indirect, incidental, special or consequential loss, or for any loss of profits, trading
          losses, investment losses, revenue, data or goodwill, arising out of or in connection with
          your use of (or inability to use) the Service. Where our liability cannot be excluded but can
          be limited, our total aggregate liability is limited to the amount you paid us for the Service
          in the twelve months preceding the event giving rise to the claim. Nothing in these terms
          limits liability that cannot lawfully be limited.
        </p>
      </LegalSection>

      <LegalSection heading="12. Indemnity">
        <p>
          You agree to indemnify AetherForge AI against any claims, losses, liabilities and reasonable
          costs arising from your breach of these terms, your misuse of the Service, or your breach of
          any law.
        </p>
      </LegalSection>

      <LegalSection heading="13. Suspension & termination">
        <p>
          We may suspend or terminate your access to the Service if you breach these terms, if required
          by law, or to protect the Service or other users. You may stop using the Service and close
          your account at any time. Provisions that by their nature should survive termination (such as
          intellectual property, disclaimers, limitation of liability and indemnity) will continue to
          apply.
        </p>
      </LegalSection>

      <LegalSection heading="14. Privacy">
        <p>
          We handle your personal information in accordance with the Privacy Act 2020 and our{" "}
          <a href="/privacy-policy" className="text-primary hover:underline">
            Privacy Policy
          </a>
          , which forms part of these terms.
        </p>
      </LegalSection>

      <LegalSection heading="15. Governing law & disputes">
        <p>
          These terms are governed by the laws of New Zealand, and you submit to the non-exclusive
          jurisdiction of the New Zealand courts. We encourage you to contact us first so we can try to
          resolve any dispute informally.
        </p>
      </LegalSection>

      <LegalSection heading="16. Changes to these terms">
        <p>
          We may update these terms from time to time. If a change is material we will give reasonable
          notice through the Service. Your continued use after changes take effect constitutes
          acceptance of the updated terms.
        </p>
      </LegalSection>

      <LegalSection heading="17. Contact">
        <p>
          Questions about these terms can be sent to{" "}
          <a href="mailto:support@aetherforgeai.co.nz" className="text-primary hover:underline">
            support@aetherforgeai.co.nz
          </a>
          .
        </p>
      </LegalSection>
    </LegalShell>
  );
}
