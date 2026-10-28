import { JsonLd } from "@/components/public/JsonLd";
import { SiteHeader } from "@/components/SiteHeader";
import { HelpSearch } from "@/components/help/HelpSearch";
import { helpArticles } from "@/lib/help-index";
import { breadcrumbJsonLd, helpFaqJsonLd } from "@/lib/public-schema";
import { publicPageMetadata } from "@/lib/reviewed-book";

export const metadata = publicPageMetadata("/help", {
  title: "Help — AetherForge AI",
  description: "Search the docs and the pricing questions. Email admin@aetherforgeai.co.nz.",
});

export default function HelpPage() {
  const articles = helpArticles();
  return (
    <div className="relative min-h-screen bg-grid">
      <div className="pointer-events-none absolute inset-0 bg-aurora" />
      <div className="relative">
        <SiteHeader />
        <main className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
          {/* b38 G-15: the same entries rendered below (search starts empty, so all are visible). */}
          <JsonLd data={helpFaqJsonLd(articles)} />
          <JsonLd
            data={breadcrumbJsonLd([
              { name: "Home", path: "/" },
              { name: "Help", path: "/help" },
            ])}
          />
          <h1 className="font-display text-4xl font-bold">Help</h1>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            Search the docs and the pricing questions. For an account question, email{" "}
            {/* M-2: plain text, not a link. The "@" sits in its own span so edge email obfuscation leaves it readable. */}
            <span className="font-medium text-foreground" data-testid="help-contact-email">
              admin<span>@</span>aetherforgeai.co.nz
            </span>
            .
          </p>
          {/* b89 START-1: the beginner guide stays one tap away from Help. */}
          <p className="mt-4 text-sm">
            <a href="/start-here" data-start-here-help className="inline-flex min-h-11 items-center font-semibold text-primary hover:underline md:min-h-0">
              New here? Start here
            </a>
          </p>
          <div className="mt-8">
            <HelpSearch articles={articles} />
          </div>
        </main>
      </div>
    </div>
  );
}
