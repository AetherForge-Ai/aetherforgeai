import { notFound } from "next/navigation";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { DisclaimerNotice } from "@/components/legal/DisclaimerNotice";
import { FactLine } from "@/components/learn/FactLine";
import { publicPageMetadata } from "@/lib/reviewed-book";
import { GUIDES } from "@/data/learn-content";

export const dynamicParams = false;
export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const g = GUIDES.find((x) => x.slug === slug);
  if (!g) return {};
  return publicPageMetadata(`/learn/${g.slug}`, { title: `${g.title} — AetherForge AI`, description: g.description });
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const g = GUIDES.find((x) => x.slug === slug);
  if (!g) notFound();
  return (
    <div className="relative min-h-screen bg-grid">
      <SiteHeader />
      <article className="mx-auto max-w-3xl px-4 pb-16 pt-14 sm:px-6 lg:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary"><Link href="/learn">Learn</Link></p>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-tight">{g.title}</h1>
        <p className="mt-5 text-lg leading-relaxed text-muted-foreground">{g.intro}</p>
        <ul className="mt-8 space-y-4">
          {g.facts.map((f) => (
            <li key={f.text} className="rounded-2xl border border-border/70 bg-card/70 px-5 py-4 text-sm leading-relaxed">
              <FactLine fact={f} />
            </li>
          ))}
        </ul>
        <p className="mt-6 text-xs text-muted-foreground" data-learn-disclaimer>
          {/* b37: every /learn guide carries the tax label TT checks for. */}
          <strong className="font-semibold text-foreground">Indicative, not tax advice.</strong> Rules change. Check the linked source before relying on a figure, and ask your accountant about your own situation.</p>
        <DisclaimerNotice variant="full" className="mt-10" />
      </article>
    </div>
  );
}
