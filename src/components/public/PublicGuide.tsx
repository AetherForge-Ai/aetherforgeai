import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { BrandLogo } from "@/components/BrandLogo";
import { DisclaimerNotice } from "@/components/legal/DisclaimerNotice";

export type GuideLink = {
  href: string;
  title: string;
  body: string;
};

/**
 * Shared shell for short public index pages (docs hub, blog status).
 * Copy stays descriptive — these pages do not invent articles, results, or revenue.
 */
export function PublicGuide({
  kicker,
  title,
  lede,
  links,
}: {
  kicker: string;
  title: string;
  lede: string;
  links: GuideLink[];
}) {
  return (
    <div className="relative min-h-screen bg-grid">
      <div className="pointer-events-none absolute inset-0 bg-aurora" />
      <div className="relative">
        <SiteHeader />

        <section className="mx-auto max-w-3xl px-4 pb-6 pt-14 sm:px-6 lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">{kicker}</p>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">{title}</h1>
          <p className="mt-5 text-lg leading-relaxed text-muted-foreground">{lede}</p>
        </section>

        <section className="mx-auto max-w-3xl px-4 pb-16 sm:px-6 lg:px-8">
          <ul className="space-y-3">
            {links.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="group flex items-start justify-between gap-4 rounded-2xl border border-border/70 bg-card/70 px-5 py-4 transition-colors hover:border-primary/40"
                >
                  <span>
                    <span className="block font-display text-lg font-bold">{item.title}</span>
                    <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
                      {item.body}
                    </span>
                  </span>
                  <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </Link>
              </li>
            ))}
          </ul>

          <DisclaimerNotice variant="full" className="mt-10" />

          <div className="mt-10 flex flex-col items-start justify-between gap-4 border-t border-border/60 pt-8 sm:flex-row sm:items-center">
            <BrandLogo />
            <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
              <Link href="/about" className="hover:text-foreground">
                About
              </Link>
              <Link href="/privacy-policy" className="hover:text-foreground">
                Privacy
              </Link>
              <Link href="/terms-of-service" className="hover:text-foreground">
                Terms
              </Link>
              <Link href="/ai-disclaimer" className="hover:text-foreground">
                AI Disclaimer
              </Link>
            </nav>
          </div>
        </section>
      </div>
    </div>
  );
}
