import type { Metadata } from "next";
import Link from "next/link";
import { Cormorant_Garamond, Jost } from "next/font/google";
import { ArrowLeft, ArrowUpRight, LayoutGrid } from "lucide-react";
import { WEBSITE_DESIGN_SHOWCASE } from "../../../../assets/websiteDesignShowcase";
import { getCurrentUser } from "@/lib/session";

// Same warm, editorial studio type pairing as the Website Design landing page.
const displaySerif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-studio-serif",
  display: "swap",
});
const bodySans = Jost({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-studio-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Design Showcase — Website Design by AetherForge",
  description:
    "A gallery of example websites designed and built by AetherForge — local service sites, hospitality, creative portfolios, community platforms and product brands. Open any design to explore it live.",
};

export default async function ShowcaseGalleryPage() {
  // Resolve the "back" destination once for the whole page.
  const user = await getCurrentUser().catch(() => null);
  const backHref = user ? "/dashboard" : "/";
  const backLabel = user ? "Back to your dashboard" : "Back to aetherforgeai.co.nz";

  return (
    <div className={`${displaySerif.variable} ${bodySans.variable}`}>
      <main
        className="min-h-screen bg-[#F7F1E8] text-[#2B2724] antialiased selection:bg-[#C8A96A]/30"
        style={{ fontFamily: "var(--font-studio-sans), ui-sans-serif, system-ui, sans-serif" }}
      >
        {/* Header */}
        <header className="sticky top-0 z-40 border-b border-[#E6D9C4]/70 bg-[#F7F1E8]/85 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-5">
            <Link
              href={backHref}
              className="group inline-flex items-center gap-2 text-sm font-medium text-[#6B6152] transition-colors hover:text-[#9A7B44]"
            >
              <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" />
              {backLabel}
            </Link>
            <Link
              href="/website-design"
              className="inline-flex items-center gap-1.5 rounded-full bg-[#2B2724] px-5 py-2.5 text-sm font-medium text-[#F7F1E8] transition-colors hover:bg-[#9A7B44]"
            >
              Website Design studio <ArrowUpRight className="size-3.5" />
            </Link>
          </div>
        </header>

        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(60% 55% at 82% 0%, rgba(200,169,106,0.20), transparent 60%)",
            }}
          />
          <div className="relative mx-auto max-w-6xl px-6 py-16 md:py-20">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#C8A96A]/50 bg-[#FFFDF9]/70 px-4 py-1.5 text-xs font-medium uppercase tracking-[0.18em] text-[#9A7B44]">
              <LayoutGrid className="size-3.5" /> Design showcase
            </span>
            <h1
              className="mt-6 max-w-3xl text-[2.6rem] leading-[1.05] text-[#211E1B] sm:text-6xl"
              style={{ fontFamily: "var(--font-studio-serif), serif", fontWeight: 600 }}
            >
              A few of the websites
              <span className="block italic text-[#9A7B44]">I&apos;ve designed &amp; built.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg font-light leading-relaxed text-[#5C5346]">
              Every design below is a real, working example — different industries, different moods,
              the same standard of craft. Open any one to explore it full-screen, exactly as a
              visitor would experience it.
            </p>
          </div>
        </section>

        {/* Gallery grid */}
        <section className="mx-auto max-w-6xl px-6 pb-24">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {WEBSITE_DESIGN_SHOWCASE.map((design) => (
              <Link
                key={design.slug}
                href={`/website-design/showcase/${design.slug}`}
                className="group flex flex-col overflow-hidden rounded-[1.3rem] border border-[#E6D9C4] bg-[#FFFDF9] shadow-[0_20px_44px_-30px_rgba(43,39,36,0.4)] transition-all duration-200 hover:-translate-y-1 hover:border-[#C8A96A] hover:shadow-[0_28px_56px_-28px_rgba(43,39,36,0.45)]"
              >
                {/* Live scaled preview (non-interactive thumbnail) */}
                <div
                  className="relative h-56 w-full overflow-hidden border-b border-[#EFE4D2] bg-[#0b0b0d]"
                  style={{ borderTop: `3px solid ${design.accent}` }}
                >
                  <iframe
                    src={`/website-design/showcase/${design.slug}/raw?preview=1`}
                    title={`${design.name} preview`}
                    loading="lazy"
                    tabIndex={-1}
                    scrolling="no"
                    aria-hidden="true"
                    className="pointer-events-none absolute left-0 top-0 origin-top-left"
                    style={{ width: "400%", height: "400%", transform: "scale(0.25)", border: 0 }}
                  />
                  {/* hover veil */}
                  <div className="absolute inset-0 flex items-end justify-end bg-gradient-to-t from-[#2B2724]/25 to-transparent p-4 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FFFDF9] px-3.5 py-1.5 text-xs font-semibold text-[#2B2724] shadow">
                      Explore live <ArrowUpRight className="size-3.5" />
                    </span>
                  </div>
                </div>

                {/* Meta */}
                <div className="flex flex-1 flex-col p-6">
                  <span
                    className="text-[0.7rem] font-semibold uppercase tracking-[0.16em]"
                    style={{ color: design.accent === "#22d3ee" ? "#0e7490" : design.accent }}
                  >
                    {design.category}
                  </span>
                  <h2
                    className="mt-2 text-2xl text-[#211E1B]"
                    style={{ fontFamily: "var(--font-studio-serif), serif", fontWeight: 600 }}
                  >
                    {design.name}
                  </h2>
                  <p className="mt-2.5 flex-1 text-sm font-light leading-relaxed text-[#5C5346]">
                    {design.tagline}
                  </p>
                  <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-[#9A7B44]">
                    View design
                    <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </span>
                </div>
              </Link>
            ))}
          </div>

          {/* Footer CTA */}
          <div className="mt-16 flex flex-col items-center gap-6 rounded-[1.4rem] border border-[#E6D9C4] bg-[#FBF6EE] px-6 py-12 text-center">
            <h3
              className="max-w-xl text-3xl text-[#211E1B]"
              style={{ fontFamily: "var(--font-studio-serif), serif", fontWeight: 600 }}
            >
              Want a site like these for your business?
            </h3>
            <p className="max-w-xl text-base font-light text-[#5C5346]">
              These are just examples — every project is designed from scratch around your brand.
              Tell me what you have in mind.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <Link
                href="/website-design#enquire"
                className="inline-flex items-center gap-2 rounded-full bg-[#2B2724] px-6 py-3 text-sm font-medium text-[#F7F1E8] transition-colors hover:bg-[#9A7B44]"
              >
                Start your project <ArrowUpRight className="size-4" />
              </Link>
              <Link
                href={backHref}
                className="inline-flex items-center gap-2 rounded-full border border-[#CDBEA3] px-6 py-3 text-sm font-medium text-[#4A4237] transition-colors hover:border-[#9A7B44] hover:text-[#9A7B44]"
              >
                <ArrowLeft className="size-4" /> {backLabel}
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
