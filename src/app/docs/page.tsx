import type { Metadata } from "next";
import { PublicGuide } from "@/components/public/PublicGuide";

export const metadata: Metadata = {
  title: "Docs — AetherForge AI",
  description:
    "How AetherForge AI works, the AI disclaimer, pricing questions, and the policies that apply. Not a broker. Not licensed financial advice.",
  alternates: { canonical: "/docs" },
};

export default function DocsPage() {
  return (
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
          body: "The company story, and how to email or call Forge Intelligence Limited.",
        },
        {
          href: "/privacy-policy",
          title: "Privacy policy",
          body: "How account data is handled under the Privacy Act 2020.",
        },
        {
          href: "/terms-of-service",
          title: "Terms of service",
          body: "The terms that apply to using AetherForge AI.",
        },
        {
          href: "/blog",
          title: "Blog",
          body: "Product writing is not published yet. This page points at Market News and example results instead.",
        },
      ]}
    />
  );
}
