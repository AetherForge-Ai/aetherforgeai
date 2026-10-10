import { PublicGuide } from "@/components/public/PublicGuide";
import { JsonLd } from "@/components/public/JsonLd";
import { DOC_LINKS } from "@/lib/help-index";
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
        links={DOC_LINKS}
      />
    </>
  );
}
