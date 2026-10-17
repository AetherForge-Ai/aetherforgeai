import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { JsonLd } from "@/components/public/JsonLd";
import { docsGuide } from "@/lib/docs-guides";
import { publicPageMetadata } from "@/lib/reviewed-book";

// CR-5: render per request so the CSP nonce is stamped on every script.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = docsGuide(slug);
  return publicPageMetadata(`/docs/${slug}`, {
    title: `${guide?.title ?? "Guide"} — AetherForge AI docs`,
    description: guide?.summary ?? "AetherForge AI guide.",
  });
}

export default async function DocsGuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = docsGuide(slug);
  if (!guide) notFound();
  return (
    <div className="relative min-h-screen bg-grid">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "HowTo",
          name: guide.title,
          description: guide.summary,
          step: guide.steps.map((text, i) => ({ "@type": "HowToStep", position: i + 1, text })),
        }}
      />
      <SiteHeader />
      <article className="mx-auto max-w-3xl px-4 pb-16 pt-14 sm:px-6 lg:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          <Link href="/docs" className="hover:underline">Docs</Link> · Guide
        </p>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-tight">{guide.title}</h1>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{guide.summary}</p>
        <ol className="mt-8 list-decimal space-y-3 pl-6 text-base leading-relaxed">
          {guide.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className="mt-10 text-sm text-muted-foreground">General information only, not financial advice.</p>
      </article>
    </div>
  );
}
