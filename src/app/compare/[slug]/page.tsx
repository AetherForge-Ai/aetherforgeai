import { notFound } from "next/navigation";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { DisclaimerNotice } from "@/components/legal/DisclaimerNotice";
import { FactLine } from "@/components/learn/FactLine";
import { publicPageMetadata } from "@/lib/reviewed-book";
import { COMPARISONS } from "@/data/learn-content";

export const dynamicParams = false;
export function generateStaticParams() {
  return COMPARISONS.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = COMPARISONS.find((x) => x.slug === slug);
  if (!c) return {};
  return publicPageMetadata(`/compare/${c.slug}`, { title: `AetherForge AI vs ${c.name} — AetherForge AI`, description: c.description });
}

export default async function ComparePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = COMPARISONS.find((x) => x.slug === slug);
  if (!c) notFound();
  return (
    <div className="relative min-h-screen bg-grid">
      <SiteHeader />
      <article className="mx-auto max-w-5xl px-4 pb-16 pt-14 sm:px-6 lg:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary"><Link href="/learn">Learn</Link> · Compare</p>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-tight">AetherForge AI vs {c.name}</h1>
        <p className="mt-5 text-lg leading-relaxed text-muted-foreground">{c.summary} Product details change; follow each source link to confirm.</p>
        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 pr-4 font-semibold"> </th>
                <th className="py-2 pr-4 font-semibold">{c.name}</th>
                <th className="py-2 font-semibold">AetherForge AI</th>
              </tr>
            </thead>
            <tbody className="divide-y align-top">
              {c.rows.map((r) => (
                <tr key={r.label}>
                  <th scope="row" className="py-3 pr-4 font-semibold">{r.label}</th>
                  <td className="py-3 pr-4"><FactLine fact={r.them} /></td>
                  <td className="py-3"><FactLine fact={r.us} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-6 text-xs text-muted-foreground">No reviews or testimonials are quoted on this page.</p>
        <DisclaimerNotice variant="full" className="mt-10" />
      </article>
    </div>
  );
}
