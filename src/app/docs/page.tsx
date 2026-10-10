import { PublicGuide } from "@/components/public/PublicGuide";
import { JsonLd } from "@/components/public/JsonLd";
import { publicPageMetadata } from "@/lib/reviewed-book";
import { breadcrumbJsonLd } from "@/lib/public-schema";

export const metadata = publicPageMetadata("/docs", {
  title: "Docs — AetherForge AI",
  description:
    "How AetherForge AI works, the AI disclaimer, pricing questions, and the policies that apply. Not a broker. Not licensed financial advice.",
});

export default function DocsPage() {
  return (
    <>
    <JsonLd
      data={breadcrumbJsonLd([
        { name: "Home", path: "/" },
        { name: "Docs", path: "/docs" },
      ])}
    />
    <PublicGuide
      kicker="AetherForge AI · Docs"
      title="Docs"
      lede="Start with how the product works, what the AI is allowed to say, and the policies that apply. AetherForge does not hold your assets and does not place trades."
      links={[
        {
          href: "/how-it-works",
          title: "How it works",
          body: "You buy through your own broker. You enter what you hold. Stox and Koins analyse it. You keep custody of every asset.",
        },
        {
          href: "/returns",
          title: "Return",
          body: "Money-weighted return, time-weighted return, and a benchmark bought on your deposit dates. A figure is shown only with a valuation, an as-of date, and a source.",
        },
        {
          href: "/ai-disclaimer",
          title: "AI disclaimer",
          body: "General information only. Not licensed financial advice under the Financial Markets Conduct Act 2013.",
        },
        {
          href: "/pricing#faq",
          title: "Pricing questions",
          body: "Answers about plans live on the pricing page.",
        },
        {
          href: "/projections",
          title: "Projections methodology",
          body: "Weekly top projections. That page includes a Methodology note on how the 7-day outlook is built. It is not personalised advice.",
        },
        {
          href: "/about",
          title: "About and contact",
          body: "The company story, and how to email or call FORGE INTELLIGENCE LIMITED.",
        },
        {
          href: "/privacy-policy",
          title: "Privacy policy",
          body: "How account data is handled under the Privacy Act 2020.",
        },
        {
          href: "/terms-of-service",
          title: "Terms",
          body: "The terms that apply to using AetherForge AI.",
        },
      ]}
    />
    </>
  );
}
