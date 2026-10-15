import Link from "next/link";
import { ReactNode } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { ArrowLeft } from "lucide-react";
import { LEGAL_PAGES, latestLegalVersion, legalAnchorId, type LegalPageKey } from "@/lib/legal-history";

interface LegalShellProps {
  title: string;
  subtitle?: string;
  /** Fallback date when no page key is given. */
  updated: string;
  /** CR-4: the page's history key. Supplies "Last updated" and "What changed". */
  page?: LegalPageKey;
  children: ReactNode;
}

/**
 * Shared dark, branded layout for AetherForge AI legal pages
 * (Terms & Conditions, Privacy Act policy, AI Disclaimer).
 */
export function LegalShell({ title, subtitle, updated, page, children }: LegalShellProps) {
  const latest = page ? latestLegalVersion(page) : null;
  const stamp = latest?.date ?? updated;
  return (
    <div className="relative min-h-screen bg-grid">
      <div className="pointer-events-none absolute inset-0 bg-aurora" />
      <div className="relative">
        <SiteHeader />

        <div className="mx-auto max-w-3xl break-words px-4 py-12 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Back to home
          </Link>

          <div className="mt-6 rounded-3xl border border-border/70 bg-card/50 p-4 sm:p-10">
            <div className="border-b border-border/60 pb-6">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                AetherForge AI · New Zealand
              </p>
              <h1 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
                {title}
              </h1>
              {subtitle && (
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{subtitle}</p>
              )}
              <p className="mt-4 text-xs text-muted-foreground">Last updated: {stamp}</p>
              {latest ? (
                <div className="mt-3 text-xs text-muted-foreground">
                  <p className="font-semibold text-foreground/90">What changed on {latest.date}</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5">
                    {latest.changes.map((change) => (
                      <li key={change}>{change}</li>
                    ))}
                  </ul>
                  <p className="mt-2">
                    <Link href={`/legal/archive#${page}`} className="font-medium text-primary hover:underline">
                      Earlier versions of the {LEGAL_PAGES[page!].title}
                    </Link>
                  </p>
                </div>
              ) : null}
            </div>

            <div className="legal-body mt-8 space-y-8 text-sm leading-relaxed text-muted-foreground">
              {children}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

/** A titled legal section with consistent heading styling. */
export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  const id = legalAnchorId(heading);
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="group font-display text-lg font-bold text-foreground">
        {heading}{" "}
        <a
          href={`#${id}`}
          className="text-sm font-normal text-muted-foreground opacity-70 hover:text-primary hover:opacity-100 focus-visible:opacity-100"
          aria-label={`Link to section: ${heading}`}
        >
          #
        </a>
      </h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

export default LegalShell;
