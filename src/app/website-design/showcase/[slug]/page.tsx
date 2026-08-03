import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, ExternalLink, LayoutGrid } from "lucide-react";
import {
  WEBSITE_DESIGN_SHOWCASE,
  getShowcaseDesign,
} from "../../../../../assets/websiteDesignShowcase";
import { getCurrentUser } from "@/lib/session";

export function generateStaticParams() {
  return WEBSITE_DESIGN_SHOWCASE.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const design = getShowcaseDesign(slug);
  if (!design) return { title: "Design not found — AetherForge" };
  return {
    title: `${design.name} — Design Showcase | AetherForge`,
    description: design.tagline,
  };
}

export default async function ShowcaseViewerPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const design = getShowcaseDesign(slug);
  if (!design) notFound();

  const index = WEBSITE_DESIGN_SHOWCASE.findIndex((d) => d.slug === slug);
  const prev = index > 0 ? WEBSITE_DESIGN_SHOWCASE[index - 1] : null;
  const next =
    index < WEBSITE_DESIGN_SHOWCASE.length - 1 ? WEBSITE_DESIGN_SHOWCASE[index + 1] : null;

  // Conditional destination: dashboard when signed in, home page otherwise.
  const user = await getCurrentUser().catch(() => null);
  const backHref = user ? "/dashboard" : "/";
  const backLabel = user ? "Dashboard" : "aetherforgeai.co.nz";

  return (
    <div className="flex h-screen flex-col bg-[#09090b]">
      {/* Control bar */}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#0d0d10] px-4 py-2.5 text-[#fafafa]">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href={backHref}
            className="group inline-flex shrink-0 items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-2 text-sm font-semibold transition-colors hover:border-white/30 hover:bg-white/10"
          >
            <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" />
            <span className="hidden sm:inline">Back to {backLabel}</span>
            <span className="sm:hidden">Back</span>
          </Link>
          <div className="hidden min-w-0 sm:block">
            <div className="flex items-center gap-2">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ background: design.accent }}
              />
              <span className="truncate text-sm font-semibold">{design.name}</span>
            </div>
            <span className="truncate text-xs text-white/50">{design.category}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/website-design/showcase"
            className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3.5 py-2 text-sm font-medium text-white/80 transition-colors hover:border-white/30 hover:text-white"
          >
            <LayoutGrid className="size-4" />
            <span className="hidden md:inline">All designs</span>
          </Link>

          {/* Prev / Next */}
          <div className="flex items-center overflow-hidden rounded-full border border-white/15">
            {prev ? (
              <Link
                href={`/website-design/showcase/${prev.slug}`}
                title={`Previous: ${prev.name}`}
                className="grid size-9 place-items-center text-white/80 transition-colors hover:bg-white/10 hover:text-white"
              >
                <ChevronLeft className="size-4" />
              </Link>
            ) : (
              <span className="grid size-9 place-items-center text-white/20">
                <ChevronLeft className="size-4" />
              </span>
            )}
            <span className="px-2 text-xs tabular-nums text-white/50">
              {index + 1} / {WEBSITE_DESIGN_SHOWCASE.length}
            </span>
            {next ? (
              <Link
                href={`/website-design/showcase/${next.slug}`}
                title={`Next: ${next.name}`}
                className="grid size-9 place-items-center text-white/80 transition-colors hover:bg-white/10 hover:text-white"
              >
                <ChevronRight className="size-4" />
              </Link>
            ) : (
              <span className="grid size-9 place-items-center text-white/20">
                <ChevronRight className="size-4" />
              </span>
            )}
          </div>

          <a
            href={`/website-design/showcase/${design.slug}/raw`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full bg-[#fafafa] px-3.5 py-2 text-sm font-semibold text-[#09090b] transition-opacity hover:opacity-90"
          >
            <ExternalLink className="size-4" />
            <span className="hidden md:inline">Open full</span>
          </a>
        </div>
      </header>

      {/* Live design (rendered in a sandboxed frame, exactly as delivered) */}
      <iframe
        src={`/website-design/showcase/${design.slug}/raw?preview=1`}
        title={`${design.name} — live design`}
        className="min-h-0 w-full flex-1 bg-white"
        style={{ border: 0 }}
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
      />
    </div>
  );
}
