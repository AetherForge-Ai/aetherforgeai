import type { ReactNode } from "react";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { IRD_FIGURES_CHECKED_ON, TOOLS_DISCLAIMER, type IrdSource } from "@/lib/nz-investor-tools";

export function ToolDisclaimer({ className = "" }: { className?: string }) {
  return (
    <p
      role="note"
      data-tool-disclaimer
      className={`rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm font-semibold leading-relaxed text-foreground ${className}`}
    >
      {TOOLS_DISCLAIMER}
    </p>
  );
}

export function ToolSources({ sources }: { sources: readonly IrdSource[] }) {
  return (
    <section className="mt-10">
      <h2 className="font-display text-lg font-bold">Inland Revenue sources</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        The figures on this page were checked against these Inland Revenue pages on {IRD_FIGURES_CHECKED_ON}.
      </p>
      <ul className="mt-4 space-y-3">
        {sources.map((source) => (
          <li key={source.url} className="text-sm leading-relaxed">
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              {source.title}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
            <span className="mt-1 block break-all text-xs text-muted-foreground">{source.url}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function TrackPortfolioLink() {
  return (
    <p className="mt-8 text-sm">
      <Link href="/dashboard" className="inline-flex min-h-11 items-center font-semibold text-primary hover:underline">
        Track your portfolio
      </Link>
    </p>
  );
}

export function InvestorToolShell({
  kicker,
  title,
  lede,
  sources,
  children,
}: {
  kicker: string;
  title: string;
  lede: string;
  sources?: readonly IrdSource[];
  children: ReactNode;
}) {
  return (
    <div className="relative min-h-screen bg-grid">
      <SiteHeader />
      <article className="mx-auto max-w-3xl px-4 pb-16 pt-14 sm:px-6 lg:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          <Link href="/tools" className="inline-flex min-h-11 items-center hover:underline md:min-h-0">
            {kicker}
          </Link>
        </p>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-tight">{title}</h1>
        <p className="mt-5 text-lg leading-relaxed text-muted-foreground">{lede}</p>
        <ToolDisclaimer className="mt-6" />
        {children}
        {sources ? <ToolSources sources={sources} /> : null}
        <TrackPortfolioLink />
        <ToolDisclaimer className="mt-8" />
      </article>
    </div>
  );
}
