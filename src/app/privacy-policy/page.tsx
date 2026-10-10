import { LegalShell, LegalSection } from "@/components/legal/LegalShell";
import { EmailAddress } from "@/components/EmailAddress";
import { LEGAL_ENTITY_NAME } from "@/lib/company";
import { publicPageMetadata } from "@/lib/reviewed-book";
import { ANALYTICS_NOTICE, LEGAL_UPDATED, PROCESSORS } from "@/lib/public-copy";

export const metadata = publicPageMetadata("/privacy-policy", {
  title: "Privacy Policy — AetherForge AI",
  description:
    "How AetherForge AI collects, uses and protects your personal information under the New Zealand Privacy Act 2020.",
});

const UPDATED = LEGAL_UPDATED;

export default function PrivacyPolicy() {
  return (
    <LegalShell
      title="Privacy Policy"
      subtitle={`This policy explains how AetherForge AI collects, uses, discloses and protects your personal information in accordance with the Privacy Act 2020 (New Zealand) and its thirteen Information Privacy Principles (IPPs). AetherForge AI is the trading name of ${LEGAL_ENTITY_NAME}, a New Zealand limited company.`}
      updated={UPDATED}
    >
      <LegalSection heading="1. Who we are">
        <p>
          AetherForge AI is the trading name of {LEGAL_ENTITY_NAME} (&quot;AetherForge AI&quot;, &quot;we&quot;,
          &quot;us&quot; or &quot;our&quot;). We operate the website{" "}
          <strong className="text-foreground/90">www.aetherforgeai.co.nz</strong> and provide
          AI-generated market intelligence and portfolio-monitoring tools. We are the &quot;agency&quot;
          responsible for your personal information under the Privacy Act 2020.
        </p>
        <p>
          We are committed to protecting your privacy and handling your personal information openly,
          transparently and in accordance with the thirteen Information Privacy Principles.
        </p>
      </LegalSection>

      <LegalSection heading="2. Personal information we collect (IPP 1, 2, 3 & 4)">
        <p>
          We only collect personal information that is necessary for our lawful functions and
          activities, and we collect it directly from you wherever possible, by lawful and fair means:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong className="text-foreground/90">Account information</strong> — your name, email
            address and country when you register, and authentication details managed by our sign-in
            provider.
          </li>
          <li>
            <strong className="text-foreground/90">Paper-book records</strong> — the cash, buys, sells,
            corrections and dividends you record in NZ$, including tickers, quantities, prices, foreign-exchange
            rates and notes, and the CSV export of that book.
          </li>
          <li>
            <strong className="text-foreground/90">Billing information</strong> — subscription plan,
            status and payment identifiers. Card details are processed directly by Stripe and are never
            stored on our servers.
          </li>
          <li>
            <strong className="text-foreground/90">Technical information</strong> — IP address, browser
            and device type, and usage analytics collected automatically to keep the service secure and
            reliable.
          </li>
        </ul>
        <p>
          When we collect personal information from you, we take reasonable steps to ensure you are
          aware of why it is being collected, who will receive it, and that you have a right to access
          and correct it.
        </p>
      </LegalSection>

      <LegalSection heading="3. How we use your information (IPP 10)">
        <p>We use your personal information only for the purposes for which it was collected, including to:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>create, secure and manage your account;</li>
          <li>generate AI market-intelligence reports based on the holdings you add;</li>
          <li>process subscription payments and manage your plan;</li>
          <li>send you service updates and security notices;</li>
          <li>respond to your support enquiries; and</li>
          <li>maintain, protect and improve the security and performance of the service.</li>
        </ul>
        <p>
          We will not use your personal information for a new, unrelated purpose without your consent,
          unless permitted under the Privacy Act 2020.
        </p>
      </LegalSection>

      <LegalSection heading="4. Artificial intelligence & automated processing">
        <p>
          AetherForge AI uses an AI provider to write plain-English notes. The holdings and prompts you
          submit may be transmitted to that provider solely to produce those notes. We do not use your
          personal financial data to train third-party AI models, and we do not make automated decisions
          that produce legal or similarly significant effects about you. AI-written notes are
          informational only — see our{" "}
          <a href="/ai-disclaimer" className="text-primary hover:underline">
            AI Disclaimer
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection heading="5. Disclosure of your information (IPP 11)">
        <p>We do not sell your personal information. We may disclose it only:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            to the processors named below, bound by confidentiality obligations:
            <ul className="mt-2 list-disc space-y-1.5 pl-5">
              {PROCESSORS.map((processor) => (
                <li key={processor.name}>
                  <strong className="text-foreground/90">{processor.name}</strong> — {processor.role}
                  {processor.name === "Google Analytics" ? ", only after you accept analytics cookies" : ""}.
                </li>
              ))}
            </ul>
          </li>
          <li>where you have authorised the disclosure;</li>
          <li>
            where required or authorised by law, including to comply with a lawful request from a New
            Zealand court, regulator or enforcement agency; or
          </li>
          <li>
            in connection with a business restructure, merger or sale, where the recipient agrees to
            protect your information consistently with this policy.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="6. Sending information overseas (IPP 12)">
        <p>
          Some of the processors named in section 5 are located outside New Zealand. That list includes
          Cloudflare, Stripe, an AI provider, Google Analytics, Totalum on Google Cloud, Yahoo Finance,
          CoinGecko, Swyftx, GeckoTerminal, gold-api.com, ExchangeRate-API and Frankfurter.
          Google Analytics runs only after you accept analytics cookies. Where we disclose
          personal information overseas, we take reasonable steps to ensure it is protected by
          comparable safeguards to those under the Privacy Act 2020, or we rely on an exception
          permitted by IPP 12 (such as your authorisation).
        </p>
      </LegalSection>

      <LegalSection heading="7. Storage & security (IPP 5)">
        <p>
          We take reasonable technical and organisational measures to protect your personal information
          against loss, unauthorised access, use, modification or disclosure. This includes encryption
          in transit, access controls, and scoping every portfolio, report and conversation to your own
          account. No system is completely secure, but if a notifiable privacy breach occurs we will
          notify affected individuals and the Office of the Privacy Commissioner as required by the
          Privacy Act 2020.
        </p>
      </LegalSection>

      <LegalSection heading="8. Retention (IPP 9)">
        <p>
          We keep your personal information only for as long as it is required for the purposes set out
          in this policy or as required by law. When information is no longer needed, we securely delete
          or de-identify it. You may delete your holdings at any time, and you may request deletion of
          your account.
        </p>
      </LegalSection>

      <LegalSection heading="9. Your right to access & correct (IPP 6 & 7)">
        <p>
          Under the Privacy Act 2020 you have the right to request access to the personal information we
          hold about you, and to request correction of any information that is inaccurate, out of date,
          incomplete or misleading. You can update much of your information directly in your account
          settings, or contact us to make a request. We will respond within the timeframes required by
          the Act (generally 20 working days).
        </p>
      </LegalSection>

      <LegalSection heading="10. Accuracy (IPP 8)">
        <p>
          Before using or disclosing your personal information, we take reasonable steps to ensure it is
          accurate, up to date, complete, relevant and not misleading. Please help us by keeping your
          account details current.
        </p>
      </LegalSection>

      <LegalSection heading="11. Unique identifiers (IPP 13)">
        <p>
          We assign internal account identifiers solely to operate the service. We do not require you to
          disclose unique identifiers assigned by other agencies (such as an IRD number) and we do not
          use such identifiers as our own.
        </p>
      </LegalSection>

      <LegalSection heading="12. Cookies & analytics">
        <p>
          We use essential cookies to keep you signed in and to secure the service. {ANALYTICS_NOTICE}{" "}
          The Google Analytics tag is not loaded until you choose Accept. Decline leaves it off. You
          can change that choice at any time from Cookie settings in the footer. You can also control
          cookies through your browser settings, although disabling essential cookies may affect
          functionality.
        </p>
      </LegalSection>

      <LegalSection heading="13. Complaints & contact">
        <p>
          If you have a question, wish to exercise your privacy rights, or want to make a complaint about
          how we have handled your personal information, email the Privacy Officer at{" "}
          <EmailAddress email="lukas@aetherforgeai.co.nz" className="text-primary" />
          . You can also use the contact form on the{" "}
          <a href="/about#contact" className="text-primary hover:underline">
            About
          </a>{" "}
          page and mark it for the Privacy Officer. We take privacy complaints seriously and will work with
          you to resolve them.
        </p>
        <p>
          If you are not satisfied with our response, you have the right to complain to the Office of the
          Privacy Commissioner (New Zealand):{" "}
          <a
            href="https://www.privacy.org.nz"
            className="text-primary hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            www.privacy.org.nz
          </a>{" "}
          · 0800 803 909.
        </p>
      </LegalSection>

      <LegalSection heading="14. Changes to this policy">
        <p>
          We may update this policy from time to time to reflect changes in our practices or the law. The
          &quot;last updated&quot; date above shows when it was last revised, and material changes will be
          notified through the service.
        </p>
      </LegalSection>
    </LegalShell>
  );
}
