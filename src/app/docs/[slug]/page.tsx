import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { JsonLd } from "@/components/public/JsonLd";
import Image from "next/image";
import { docsGuide, docsShot } from "@/lib/docs-guides";
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
        {docsShot(guide.slug) ? (
          <figure className="mt-8 overflow-hidden rounded-2xl border border-border/70 bg-card" data-docs-shot>
            <Image
              src={docsShot(guide.slug)!.src}
              alt={docsShot(guide.slug)!.alt}
              width={docsShot(guide.slug)!.width}
              height={docsShot(guide.slug)!.height}
              className="h-auto w-full"
              sizes="(min-width: 768px) 720px, 100vw"
            />
            <figcaption className="px-4 py-2 text-xs text-muted-foreground">
              Example — a synthetic book on a test build. Figures are illustrative, not a real portfolio.
            </figcaption>
          </figure>
        ) : null}
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
