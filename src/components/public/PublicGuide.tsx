import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
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
  notes,
}: {
  kicker: string;
  title: string;
  lede: string;
  links: GuideLink[];
  notes?: { title: string; body: string; tone?: "ok" | "amber" }[];
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
          {notes && notes.length > 0 ? (
            <ul className="mb-6 space-y-2">
              {notes.map((note) => (
                <li
                  key={note.title}
                  className={
                    note.tone === "amber"
                      ? "rounded-2xl border border-amber-800/40 bg-amber-500/10 px-5 py-3 text-amber-950 dark:text-amber-50"
                      : "rounded-2xl border border-border/70 bg-card/70 px-5 py-3"
                  }
                >
                  <span className="block font-display text-base font-bold">{note.title}</span>
                  <span className="mt-1 block text-sm">{note.body}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <ul className="space-y-3">
            {links.map((item) => (
              <li key={`${item.href}-${item.title}`}>
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
        </section>
      </div>
    </div>
  );
}
