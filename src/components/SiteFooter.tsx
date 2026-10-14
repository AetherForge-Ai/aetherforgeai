import Link from "next/link";
import { CookieSettingsLink } from "@/components/CookieSettingsLink";
import { COMPANY_NUMBER, LEGAL_ENTITY_NAME, NZBN } from "@/lib/company";
import { CUSTOMER_EMAIL, ONE_LINE_DISCLAIMER, PRIVACY_OFFICER_EMAIL } from "@/lib/public-copy";
import { EmailAddress } from "@/components/EmailAddress";

const LINKS = [
  { href: "/privacy-policy", label: "Privacy Policy" },
  { href: "/terms-of-service", label: "Terms" },
  { href: "/refunds", label: "Refunds" },
  { href: "/ai-disclaimer", label: "AI Disclaimer" },
  { href: "/trust", label: "Trust" },
  { href: "/contact", label: "Contact" },
  { href: "/cookies", label: "Cookies" },
  { href: "/status", label: "Status" },
  { href: "/docs", label: "Docs" },
  { href: "/tax", label: "Tax" },
  { href: "/pricing", label: "Pricing" },
] as const;

/** The one site footer. Legal links and the company block are the same on every route. */
export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="chrome-dark border-t border-border/60 bg-background pb-24 text-foreground" aria-label="Footer">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 sm:px-6 lg:px-8">
        <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground" aria-label="Legal">
          {LINKS.map((item) => (
            <Link key={item.href} href={item.href} className="hover:text-foreground">
              {item.label}
            </Link>
          ))}
          <CookieSettingsLink />
        </nav>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {LEGAL_ENTITY_NAME} · Company number {COMPANY_NUMBER} · NZBN {NZBN} ·{" "}
          <EmailAddress email={CUSTOMER_EMAIL} />
          {" · "}
          <EmailAddress email={PRIVACY_OFFICER_EMAIL} />
        </p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          © {year} {LEGAL_ENTITY_NAME}. {ONE_LINE_DISCLAIMER}
        </p>
      </div>
    </footer>
  );
}
