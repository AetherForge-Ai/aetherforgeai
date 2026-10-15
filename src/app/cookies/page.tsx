import Link from "next/link";
import { LegalSection, LegalShell } from "@/components/legal/LegalShell";
import { publicPageMetadata } from "@/lib/reviewed-book";
import { CONSENT_STORAGE_KEY } from "@/lib/analytics-consent";
import { EMAIL_PREFS_COOKIE } from "@/lib/notification-prefs";
import { AUTH_COOKIE_NAMES } from "@/lib/session-owner";

export const metadata = publicPageMetadata("/cookies", {
  title: "Cookies — AetherForge AI",
  description: "The cookies and the browser storage AetherForge AI actually uses.",
});

export default function CookiesPage() {
  return (
    <LegalShell
      page="cookies"
      title="Cookies"
      subtitle="This page lists the cookies and the browser storage the site sets. It does not change how the analytics choice works."
      updated="13 Oct 2026"
    >
      <LegalSection heading="Analytics choice">
        <p>
          The Accept and Decline choice is stored in this browser under the key {CONSENT_STORAGE_KEY}. That
          value is local storage, not a cookie. Measurement stays off until Accept. Cookie settings in the
          footer opens the same choice again.
        </p>
      </LegalSection>
      <LegalSection heading="Essential cookies">
        <p>These cookies keep you signed in. They are set by the sign-in service:</p>
        <ul className="list-disc space-y-1 pl-5">
          {AUTH_COOKIE_NAMES.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
        <p>
          Email preferences use the cookie {EMAIL_PREFS_COOKIE}. It remembers which messages you asked to
          receive.
        </p>
      </LegalSection>
      <LegalSection heading="Measurement cookies">
        <p>
          After Accept, Google Analytics may set _ga and a _ga_ measurement cookie. Decline does not load
          that tag, so those cookies are not set by this site.
        </p>
        <p>
          For how we use the data these cookies collect, see our{" "}
          <Link href="/privacy-policy" className="text-primary hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </LegalSection>
    </LegalShell>
  );
}
