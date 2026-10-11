import Link from "next/link";
import { EmailAddress } from "@/components/EmailAddress";
import { SiteHeader } from "@/components/SiteHeader";
import { PAPER_FEE_SUMMARY } from "@/lib/fee-rule";
import { publicPageMetadata } from "@/lib/reviewed-book";
import { publicDataSourcesLine } from "@/lib/data-sources";
import {
  AI_REQUEST_LINES,
  CUSTOMER_EMAIL,
  DATA_SHARING_LINE,
  FRESHNESS_PLAIN,
  PAPER_BOOK_STATEMENT,
  PRIVACY_OFFICER_EMAIL,
  PROCESSORS,
  SECURITY_LINE,
} from "@/lib/public-copy";
import {
  TRUST_PAGE_LOG,
  trustBreachLine,
  trustDeletionLine,
  trustExportLine,
  trustRetentionLine,
  trustStorageLine,
  trustTransportLine,
} from "@/lib/trust-facts";

/** Shown on this page only. Other pages keep the unnamed third-party row. */
function disclosedProcessors() {
  return PROCESSORS().map((processor) =>
    processor.name === "A third-party AI service" ? { ...processor, name: "SuperGrok" } : processor,
  );
}

export const metadata = publicPageMetadata("/trust", {
  title: "Trust · AetherForge AI",
  description: "Data sources, freshness, processors, security, and how to report a vulnerability.",
});

export default function TrustPage() {
  return (
    <div className="relative min-h-screen bg-grid">
      <div className="pointer-events-none absolute inset-0 bg-aurora" />
      <div className="relative">
        <SiteHeader />
        <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
          <Link href="/" className="text-sm font-semibold text-primary hover:underline">
            Back to home
          </Link>
          <h1 className="mt-4 font-display text-3xl font-bold">Trust</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            What the signed-in portfolio is, where the numbers come from, who handles data, and how to report a
            weakness.
          </p>

          <section className="mt-8 space-y-2">
            <h2 className="font-display text-lg font-bold">Paper, not a broker</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {PAPER_BOOK_STATEMENT} Recording a buy does not send money to a broker, an exchange, or a bank. A sell
              does not pay you.
            </p>
          </section>

          <section className="mt-8 space-y-2">
            <h2 className="font-display text-lg font-bold">Where prices come from</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {publicDataSourcesLine()}
            </p>
          </section>

          <section className="mt-8 space-y-2">
            <h2 className="font-display text-lg font-bold">How fresh the figures are</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">{FRESHNESS_PLAIN}</p>
          </section>

          <section className="mt-8 space-y-2">
            <h2 className="font-display text-lg font-bold">Who else handles data</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">{DATA_SHARING_LINE}</p>
            <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
              {disclosedProcessors().map((processor) => (
                <li key={processor.name}>
                  <span className="font-semibold text-foreground">{processor.name}</span> — {processor.role}.
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-8 space-y-2">
            <h2 className="font-display text-lg font-bold">Security</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {SECURITY_LINE} The book is tied to your signed-in account. Another member cannot read it. We do not ask
              for a broker login, and we do not store a password for a bank or an exchange.
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">{trustTransportLine()}</p>
          </section>

          <section className="mt-8 space-y-2">
            <h2 className="font-display text-lg font-bold">Where the book is stored</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">{trustStorageLine()}</p>
          </section>

          <section className="mt-8 space-y-2">
            <h2 className="font-display text-lg font-bold">Retention, deletion and export</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">{trustRetentionLine()}</p>
            <p className="text-sm leading-relaxed text-muted-foreground">{trustDeletionLine()}</p>
            <p className="text-sm leading-relaxed text-muted-foreground">{trustExportLine()}</p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              The full wording is in the{" "}
              <Link href="/privacy-policy" className="font-semibold text-primary underline-offset-2 hover:underline">
                privacy policy
              </Link>
              .
            </p>
          </section>

          <section className="mt-8 space-y-2">
            <h2 className="font-display text-lg font-bold">The fee rule</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">{PAPER_FEE_SUMMARY}</p>
          </section>

          <section className="mt-8 space-y-2">
            <h2 className="font-display text-lg font-bold">What the AI does</h2>
            {AI_REQUEST_LINES.map((line) => (
              <p key={line.slice(0, 24)} className="text-sm leading-relaxed text-muted-foreground">
                {line}
              </p>
            ))}
            <p className="text-sm leading-relaxed text-muted-foreground">
              The third-party AI service in those sentences is SuperGrok. No retention period is set by our code.
            </p>
          </section>

          <section className="mt-8 space-y-2">
            <h2 className="font-display text-lg font-bold">Report a vulnerability</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">{trustBreachLine()}</p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              The contact file is{" "}
              <Link href="/.well-known/security.txt" className="font-semibold text-primary underline-offset-2 hover:underline">
                security.txt
              </Link>
              .
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              If you find a security weakness, email{" "}
              <EmailAddress email={CUSTOMER_EMAIL} className="font-semibold text-primary" />
              {" or "}
              <EmailAddress email={PRIVACY_OFFICER_EMAIL} className="font-semibold text-primary" />{" "}
              or use the{" "}
              <Link href="/about#contact" className="font-semibold text-primary underline-offset-2 hover:underline">
                contact form
              </Link>{" "}
              and put &quot;Security report&quot; in the message.
            </p>
          </section>

          <section className="mt-8 space-y-2">
            <h2 className="font-display text-lg font-bold">Changes on this page</h2>
            <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
              {TRUST_PAGE_LOG.map((entry) => (
                <li key={entry.date}>
                  {entry.date}: {entry.change}
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-8 space-y-2">
            <h2 className="font-display text-lg font-bold">Not financial advice</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              The figures, bots and notes are general information. They are not a recommendation to buy or sell, and they
              do not consider your circumstances. Read the{" "}
              <Link href="/ai-disclaimer" className="font-semibold text-primary underline-offset-2 hover:underline">
                AI disclaimer
              </Link>{" "}
              before you act.
            </p>
          </section>
        </main>
      </div>
    </div>
  );
}
