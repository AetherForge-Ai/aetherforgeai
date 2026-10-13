import { JsonLd } from "@/components/public/JsonLd";
import { SiteHeader } from "@/components/SiteHeader";
import { HelpSearch } from "@/components/help/HelpSearch";
import { helpArticles } from "@/lib/help-index";
import { EmailAddress } from "@/components/EmailAddress";
import { breadcrumbJsonLd } from "@/lib/public-schema";
import { publicPageMetadata } from "@/lib/reviewed-book";

export const metadata = publicPageMetadata("/help", {
  title: "Help — AetherForge AI",
  description: "Search the docs and the pricing questions. Email admin@aetherforgeai.co.nz.",
});

export default function HelpPage() {
  return (
    <div className="relative min-h-screen bg-grid">
      <div className="pointer-events-none absolute inset-0 bg-aurora" />
      <div className="relative">
        <SiteHeader />
        <main className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
          <JsonLd
            data={breadcrumbJsonLd([
              { name: "Home", path: "/" },
              { name: "Help", path: "/help" },
            ])}
          />
          <h1 className="font-display text-4xl font-bold">Help</h1>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            Search the docs and the pricing questions. For an account question, email{" "}
            <EmailAddress email="admin@aetherforgeai.co.nz" /> (admin at aetherforgeai.co.nz).
          </p>
          <div className="mt-8">
            <HelpSearch articles={helpArticles()} />
          </div>
        </main>
      </div>
    </div>
  );
}
