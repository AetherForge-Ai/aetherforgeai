import Link from "next/link";
import { LegalShell } from "@/components/legal/LegalShell";
import { publicPageMetadata } from "@/lib/reviewed-book";
import { LEGAL_PAGES, type LegalPageKey } from "@/lib/legal-history";

export const metadata = publicPageMetadata("/legal/archive", {
  title: "Legal page history — AetherForge AI",
  description: "Every published version date of the AetherForge AI Terms, Privacy Policy, AI Disclaimer, Refunds, Cookies and Contact pages, with what changed.",
});

/** CR-4: archive of legal page versions and what changed in each. */
export default function LegalArchivePage() {
  const keys = Object.keys(LEGAL_PAGES) as LegalPageKey[];
  return (
    <LegalShell
      title="Legal page history"
      subtitle="Each legal page, with the date of every published version and what changed. The current wording is always on the page itself."
      updated={LEGAL_PAGES.terms.versions[0].date}
    >
      {keys.map((key) => {
        const entry = LEGAL_PAGES[key];
        return (
          <section key={key} id={key} className="scroll-mt-24">
            <h2 className="font-display text-lg font-bold text-foreground">
              <Link href={entry.href} className="hover:text-primary hover:underline">
                {entry.title}
              </Link>
            </h2>
            <ol className="mt-3 space-y-3">
              {entry.versions.map((version, index) => (
                <li key={version.date}>
                  <h3 className="font-semibold text-foreground/90">
                    {version.date}
                    {index === 0 ? " (current)" : ""}
                  </h3>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5">
                    {version.changes.map((change) => (
                      <li key={change}>{change}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </section>
        );
      })}
    </LegalShell>
  );
}
