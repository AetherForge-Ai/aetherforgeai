import Link from "next/link";
import { ReactNode } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { BrandLogo } from "@/components/BrandLogo";
import { ArrowLeft } from "lucide-react";

interface LegalShellProps {
  title: string;
  subtitle?: string;
  updated: string;
  children: ReactNode;
}

/**
 * Shared dark, branded layout for AetherForge AI legal pages
 * (Terms & Conditions, Privacy Act policy, AI Disclaimer).
 */
export function LegalShell({ title, subtitle, updated, children }: LegalShellProps) {
  return (
    <div className="relative min-h-screen bg-grid">
      <div className="pointer-events-none absolute inset-0 bg-aurora" />
      <div className="relative">
        <SiteHeader />

        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Back to home
          </Link>

          <div className="mt-6 rounded-3xl border border-border/70 bg-card/50 p-6 sm:p-10">
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
              <p className="mt-4 text-xs text-muted-foreground">Last updated: {updated}</p>
            </div>

            <div className="legal-body mt-8 space-y-8 text-sm leading-relaxed text-muted-foreground">
              {children}
            </div>
          </div>

          <div className="mt-8 flex flex-col items-center justify-between gap-4 border-t border-border/60 pt-8 text-xs text-muted-foreground sm:flex-row">
            <BrandLogo />
            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
              <Link href="/terms-of-service" className="hover:text-foreground">
                Terms &amp; Conditions
              </Link>
              <Link href="/privacy-policy" className="hover:text-foreground">
                AI Privacy Act
              </Link>
              <Link href="/ai-disclaimer" className="hover:text-foreground">
                AI Disclaimer
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** A titled legal section with consistent heading styling. */
export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-lg font-bold text-foreground">{heading}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

export default LegalShell;
